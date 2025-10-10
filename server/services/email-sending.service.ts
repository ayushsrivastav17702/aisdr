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
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
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

      // Convert plain text line breaks to HTML
      let emailBody = params.body
        .replace(/\n\n/g, '<br><br>')  // Double line breaks become double <br>
        .replace(/\n/g, '<br>');        // Single line breaks become single <br>
      
      if (params.trackingId) {
        const trackingPixel = `<img src="${process.env.API_BASE_URL || ''}/webhooks/pixel/${params.trackingId}" width="1" height="1" />`;
        emailBody = emailBody + trackingPixel;
      }

      const info = await transporter.sendMail({
        from: `"${params.fromName || mailbox.name}" <${mailbox.email}>`,
        to: params.to,
        subject: params.subject,
        html: emailBody,
        replyTo: mailbox.email,
      });

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
