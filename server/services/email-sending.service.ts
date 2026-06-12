import nodemailer from "nodemailer";
import { db } from "../db";
import { emailMailboxes, emailSendLog, InsertEmailSendLogEntry } from "@shared/schema";
import { eq } from "drizzle-orm";
import { mailboxService } from "./mailbox.service";
import { emailTrackingService } from "./email-tracking.service";
import { oauthService } from "./oauth.service";

export class EmailSendingService {
  async sendEmail(params: {
    mailboxId: string;
    to: string;
    subject: string;
    body: string;
    fromName?: string;
    trackingId?: string;
    inReplyTo?: string;
    references?: string;
    userId: string; // REQUIRED: User ID for multi-tenant send log tracking
  }): Promise<{ success: boolean; messageId?: string; error?: string; finalBody?: string }> {
    let mailbox: typeof emailMailboxes.$inferSelect | undefined;
    try {
      [mailbox] = await db
        .select()
        .from(emailMailboxes)
        .where(eq(emailMailboxes.id, params.mailboxId));

      if (!mailbox) {
        throw new Error("Mailbox not found");
      }

      if (mailbox.status !== "active" && mailbox.status !== "warming") {
        throw new Error(`Mailbox is ${mailbox.status}`);
      }

      if (mailbox.dailySent !== null && mailbox.dailyLimit !== null && mailbox.dailySent >= mailbox.dailyLimit) {
        throw new Error("Daily limit reached");
      }

      const transporter = await this.createTransporter(mailbox);

      // Convert plain text to properly formatted HTML
      // Split by line breaks and wrap each paragraph in <p> tags for proper spacing
      const paragraphs = params.body
        .split(/\n+/)  // Split by one or more line breaks
        .filter(p => p.trim().length > 0)  // Remove empty paragraphs
        .map(p => `<p style="margin: 0 0 16px 0;">${p.trim()}</p>`)  // Wrap in <p> tags with spacing
        .join('');
      
      let emailBody = paragraphs;
      
      // Add signature if available
      if (mailbox.signature) {
        console.log(`📝 Appending signature for mailbox ${mailbox.email}:`, mailbox.signature.substring(0, 50) + '...');
        const signatureHtml = mailbox.signature
          .split(/\n+/)
          .filter(p => p.trim().length > 0)
          .map(p => `<p style="margin: 0 0 4px 0; color: #666;">${p.trim()}</p>`)
          .join('');
        emailBody = emailBody + `<br><br>${signatureHtml}`;
        console.log(`✅ Signature appended successfully`);
      } else {
        console.log(`⚠️ No signature found for mailbox ${mailbox.email}`);
      }
      
      // Add tracking if trackingId is provided
      if (params.trackingId) {
        // Wrap links for click tracking
        emailBody = emailTrackingService.wrapAllUrls(emailBody, params.trackingId);
        
        // Add tracking pixel for open tracking
        const trackingPixelHtml = emailTrackingService.getTrackingPixelHtml(params.trackingId);
        emailBody = emailBody + trackingPixelHtml;
      }

      const mailOptions: any = {
        from: `"${params.fromName || mailbox.name}" <${mailbox.email}>`,
        to: params.to,
        subject: params.subject,
        html: emailBody,
        replyTo: mailbox.email,
      };
      
      // Add threading headers if provided (for email thread continuity)
      if (params.inReplyTo) {
        mailOptions.inReplyTo = params.inReplyTo;
        mailOptions.headers = {
          'In-Reply-To': params.inReplyTo,
        };
      }
      
      if (params.references) {
        if (!mailOptions.headers) {
          mailOptions.headers = {};
        }
        mailOptions.headers['References'] = params.references;
      }
      
      const info = await transporter.sendMail(mailOptions);

      await mailboxService.incrementDailySent(params.mailboxId);

      await db.insert(emailSendLog).values({
        mailboxId: params.mailboxId,
        userId: params.userId, // CRITICAL: Multi-tenant security - required field
        status: "success",
        messageId: info.messageId,
        sentAt: new Date(),
      });

      console.log(`✅ Email sent: ${info.messageId}`);
      console.log('[EmailSending] ✅ Sent to:', params.to, 'via', mailbox.email);

      return {
        success: true,
        messageId: info.messageId,
        finalBody: emailBody, // Return the final HTML body with signature
      };
    } catch (error: any) {
      console.error("Email sending failed:", error);
      console.error('[EmailSending] ❌ Failed:', error?.message, 'code:', error?.code);

      await db.insert(emailSendLog).values({
        mailboxId: params.mailboxId,
        userId: params.userId, // CRITICAL: Multi-tenant security - required field
        status: "failed",
        error: error.message,
        sentAt: new Date(),
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async createTransporter(mailbox: any) {
    const { provider } = mailbox;

    // Gmail mailboxes connected via OAuth (have a refreshToken) authenticate
    // with OAuth2 instead of an SMTP password.
    if (provider === "gmail" && mailbox.refreshToken) {
      const { accessToken, refreshToken } = await this.getGmailOAuthCredentials(mailbox);

      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: mailbox.smtpUser || mailbox.email,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken,
          accessToken,
        },
      });
    }

    if (provider === "smtp" || provider === "gmail" || provider === "outlook") {
      const password = mailbox.smtpPassword
        ? mailboxService.decrypt(mailbox.smtpPassword)
        : "";

      return nodemailer.createTransport({
        host: mailbox.smtpHost,
        port: mailbox.smtpPort,
        secure: mailbox.smtpSecure,
        auth: {
          user: mailbox.smtpUser || mailbox.email,
          pass: password,
        },
      });
    } else if (provider === "sendgrid") {
      const apiKey = mailbox.apiKey ? mailboxService.decrypt(mailbox.apiKey) : "";
      return nodemailer.createTransport({
        host: "smtp.sendgrid.net",
        port: 587,
        auth: {
          user: "apikey",
          pass: apiKey,
        },
      });
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * Decrypt the stored Gmail OAuth tokens for a mailbox, refreshing the
   * access token first if it is missing or close to expiry (Gmail access
   * tokens last ~1 hour). The refreshed access token + new expiry are
   * persisted back to the mailbox row.
   */
  private async getGmailOAuthCredentials(mailbox: any): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = mailboxService.decrypt(mailbox.refreshToken);

    const REFRESH_BUFFER_MS = 10 * 60 * 1000; // refresh if expiring within 10 minutes
    const needsRefresh =
      !mailbox.accessToken ||
      !mailbox.tokenExpiry ||
      new Date(mailbox.tokenExpiry).getTime() <= Date.now() + REFRESH_BUFFER_MS;

    if (!needsRefresh) {
      return { accessToken: mailboxService.decrypt(mailbox.accessToken), refreshToken };
    }

    const { accessToken, expiresIn } = await oauthService.refreshGmailAccessToken(refreshToken);
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    await db
      .update(emailMailboxes)
      .set({
        accessToken: mailboxService.encrypt(accessToken),
        tokenExpiry,
        updatedAt: new Date(),
      })
      .where(eq(emailMailboxes.id, mailbox.id));

    return { accessToken, refreshToken };
  }

  async testMailbox(mailboxId: string): Promise<boolean> {
    try {
      const [mailbox] = await db
        .select()
        .from(emailMailboxes)
        .where(eq(emailMailboxes.id, mailboxId));

      if (!mailbox) {
        throw new Error("Mailbox not found");
      }

      const transporter = await this.createTransporter(mailbox);
      await transporter.verify();
      console.log(`✅ Mailbox ${mailbox.email} connection verified`);
      return true;
    } catch (error) {
      console.error("Mailbox test failed:", error);
      return false;
    }
  }
}

export const emailSendingService = new EmailSendingService();
