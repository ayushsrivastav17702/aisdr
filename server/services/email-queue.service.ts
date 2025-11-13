import { db } from "../db";
import { emailQueue, InsertEmailQueueItem, EmailQueueItem, prospects, emails } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { emailSendingService } from "./email-sending.service";
import { mailboxService } from "./mailbox.service";

export class EmailQueueService {
  async addToQueue(queueData: {
    emailId?: string;
    sequenceId?: string;
    prospectId: string;
    subject: string;
    body: string;
    fromName?: string;
    replyTo?: string;
    scheduledFor: Date;
    priority?: number;
    inReplyTo?: string;
    references?: string;
    userId: string; // REQUIRED: User ID for multi-tenant mailbox selection
  }): Promise<EmailQueueItem> {
    try {
      // Validate userId is provided (critical for multi-tenant security)
      if (!queueData.userId) {
        throw new Error("userId is required for email queue - multi-tenant security violation");
      }

      // Select mailbox scoped to the user
      const mailbox = await mailboxService.getNextMailbox(queueData.userId);

      const [queueItem] = await db
        .insert(emailQueue)
        .values({
          ...queueData,
          mailboxId: mailbox.id,
          status: "pending",
          priority: queueData.priority || 5,
        })
        .returning();

      console.log(`📬 Added email to queue: ${queueItem.id} for user ${queueData.userId} using mailbox ${mailbox.email} (scheduled for ${queueData.scheduledFor})`);
      return queueItem;
    } catch (error) {
      console.error("Failed to add email to queue:", error);
      throw error;
    }
  }

  async processPendingEmails(): Promise<void> {
    try {
      const now = new Date();
      const pendingEmails = await db
        .select()
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.status, "pending"),
            lte(emailQueue.scheduledFor, now)
          )
        )
        .orderBy(emailQueue.priority, emailQueue.scheduledFor)
        .limit(50);

      console.log(`📨 Processing ${pendingEmails.length} pending emails`);

      for (const email of pendingEmails) {
        await this.processEmail(email);
      }
    } catch (error) {
      console.error("Failed to process pending emails:", error);
    }
  }

  private async processEmail(email: EmailQueueItem): Promise<void> {
    try {
      // Fetch prospect to get actual email address
      const [prospect] = await db
        .select()
        .from(prospects)
        .where(eq(prospects.id, email.prospectId))
        .limit(1);

      if (!prospect || !prospect.primaryEmail) {
        throw new Error(`Prospect ${email.prospectId} not found or has no email`);
      }

      await db
        .update(emailQueue)
        .set({ status: "sending" })
        .where(eq(emailQueue.id, email.id));

      const result = await emailSendingService.sendEmail({
        mailboxId: email.mailboxId,
        to: prospect.primaryEmail,
        subject: email.subject,
        body: email.body,
        fromName: email.fromName || undefined,
        trackingId: email.id,
        inReplyTo: email.inReplyTo || undefined,
        references: email.references || undefined,
      });

      if (result.success) {
        const sentAt = new Date();
        
        // Update email queue status
        await db
          .update(emailQueue)
          .set({
            status: "sent",
            sentAt,
          })
          .where(eq(emailQueue.id, email.id));

        // Create or update entry in emails table for analytics tracking
        if (email.emailId) {
          // Update existing email record with final body including signature and Message-ID
          await db
            .update(emails)
            .set({
              content: result.finalBody || email.body, // Use final body with signature
              sentAt,
              status: "sent",
              messageId: result.messageId, // Store Message-ID for threading
            })
            .where(eq(emails.id, email.emailId));
        } else {
          // Create new email record for analytics with final body including signature and Message-ID
          await db.insert(emails).values({
            prospectId: email.prospectId,
            sequenceId: email.sequenceId || null,
            subject: email.subject,
            content: result.finalBody || email.body, // Store final HTML with signature
            status: "sent",
            sentAt,
            trackingId: email.id, // Use queue ID as tracking ID
            messageId: result.messageId, // Store Message-ID for threading
          });
        }

        console.log(`✅ Email sent successfully: ${email.id} to ${prospect.primaryEmail}`);
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error: any) {
      const attempts = (email.attempts || 0) + 1;
      const maxAttempts = email.maxAttempts || 3;

      if (attempts >= maxAttempts) {
        await db
          .update(emailQueue)
          .set({
            status: "failed",
            failedAt: new Date(),
            lastError: error.message,
            attempts,
          })
          .where(eq(emailQueue.id, email.id));

        console.error(`❌ Email failed after ${attempts} attempts: ${email.id}`);
      } else {
        await db
          .update(emailQueue)
          .set({
            status: "pending",
            lastError: error.message,
            attempts,
          })
          .where(eq(emailQueue.id, email.id));

        console.log(`🔄 Email retry ${attempts}/${maxAttempts}: ${email.id}`);
      }
    }
  }

  async getQueueStats(): Promise<{
    pending: number;
    sent: number;
    failed: number;
    sending: number;
  }> {
    const [stats] = await db
      .select({
        pending: sql<number>`count(*) filter (where ${emailQueue.status} = 'pending')`,
        sending: sql<number>`count(*) filter (where ${emailQueue.status} = 'sending')`,
        sent: sql<number>`count(*) filter (where ${emailQueue.status} = 'sent')`,
        failed: sql<number>`count(*) filter (where ${emailQueue.status} = 'failed')`,
      })
      .from(emailQueue);

    return {
      pending: Number(stats.pending),
      sending: Number(stats.sending),
      sent: Number(stats.sent),
      failed: Number(stats.failed),
    };
  }

  async getPendingCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailQueue)
      .where(eq(emailQueue.status, "pending"));

    return Number(result.count);
  }

  async cancelEmail(emailId: string): Promise<void> {
    await db
      .update(emailQueue)
      .set({ status: "failed", lastError: "Cancelled by user" })
      .where(eq(emailQueue.id, emailId));
  }
}

export const emailQueueService = new EmailQueueService();
