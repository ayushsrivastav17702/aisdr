import { Resend } from "resend";
import { db } from "../db";
import { emailMailboxes, emailSendLog, InsertEmailSendLogEntry } from "@shared/schema";
import { eq } from "drizzle-orm";
import { mailboxService } from "./mailbox.service";
import { emailTrackingService } from "./email-tracking.service";

// Render's free tier blocks outbound SMTP on ports 25/465/587, so direct
// nodemailer/SMTP (and Gmail OAuth2 SMTP) sends time out with
// "Connection timeout". Resend's API is HTTPS (port 443), which is never
// blocked, so all outbound mail is sent through Resend regardless of the
// mailbox's configured provider.
const resendClient = new Resend(process.env.RESEND_API_KEY);

// Until the sending domain (e.g. b2bleads.co.in) is verified in Resend,
// emails must be sent "from" Resend's shared sandbox domain. Reply-To is
// still set to the connected mailbox so replies land in the right inbox.
const RESEND_FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

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

      // Threading headers (RFC 5322) so replies/follow-ups stay in the same thread
      const headers: Record<string, string> = {};
      if (params.inReplyTo) {
        headers['In-Reply-To'] = params.inReplyTo;
      }
      if (params.references) {
        headers['References'] = params.references;
      }
      if (params.trackingId) {
        headers['X-Tracking-Id'] = params.trackingId;
      }

      const { data, error } = await resendClient.emails.send({
        from: `${params.fromName || mailbox.name} <${RESEND_FROM_ADDRESS}>`,
        to: params.to,
        subject: params.subject,
        html: emailBody,
        text: params.body,
        replyTo: mailbox.email,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      });

      if (error) {
        throw new Error(error.message);
      }

      const messageId = data?.id;

      await mailboxService.incrementDailySent(params.mailboxId);

      await db.insert(emailSendLog).values({
        mailboxId: params.mailboxId,
        userId: params.userId, // CRITICAL: Multi-tenant security - required field
        status: "success",
        messageId,
        sentAt: new Date(),
      });

      console.log(`✅ Email sent via Resend: ${messageId}`);
      console.log('[EmailSending] ✅ Sent to:', params.to, 'via', mailbox.email);

      return {
        success: true,
        messageId,
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

  async testMailbox(mailboxId: string): Promise<boolean> {
    try {
      const [mailbox] = await db
        .select()
        .from(emailMailboxes)
        .where(eq(emailMailboxes.id, mailboxId));

      if (!mailbox) {
        throw new Error("Mailbox not found");
      }

      if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
      }

      console.log(`✅ Mailbox ${mailbox.email} configured (sending via Resend)`);
      return true;
    } catch (error) {
      console.error("Mailbox test failed:", error);
      return false;
    }
  }
}

export const emailSendingService = new EmailSendingService();
