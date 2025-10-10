import nodemailer from "nodemailer";
import { db } from "../db";
import { emailMailboxes, emailSendLog, InsertEmailSendLogEntry } from "@shared/schema";
import { eq } from "drizzle-orm";
import { mailboxService } from "./mailbox.service";

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
  }): Promise<{ success: boolean; messageId?: string; error?: string; finalBody?: string }> {
    try {
      const [mailbox] = await db
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
      
      if (params.trackingId) {
        const trackingPixel = `<img src="${process.env.API_BASE_URL || ''}/webhooks/pixel/${params.trackingId}" width="1" height="1" />`;
        emailBody = emailBody + trackingPixel;
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
        status: "success",
        messageId: info.messageId,
        sentAt: new Date(),
      });

      console.log(`✅ Email sent: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        finalBody: emailBody, // Return the final HTML body with signature
      };
    } catch (error: any) {
      console.error("Email sending failed:", error);

      await db.insert(emailSendLog).values({
        mailboxId: params.mailboxId,
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
