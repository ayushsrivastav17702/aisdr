import Imap from "imap";
// @ts-ignore - mailparser doesn't have types
import { simpleParser } from "mailparser";
import { db } from "../db";
import { emailReplies, emailQueue, emailMailboxes, sequenceProspects, emails } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { mailboxService } from "./mailbox.service";

export class ReplyDetectionService {
  private pollInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  async startPolling(intervalSeconds: number = 20): Promise<void> {
    if (this.pollInterval) {
      console.log("⚠️ Reply polling already running");
      return;
    }

    console.log(`📬 Starting reply detection polling (every ${intervalSeconds}s)`);
    
    // Initial check
    await this.checkForReplies();
    
    // Set up interval
    this.pollInterval = setInterval(async () => {
      await this.checkForReplies();
    }, intervalSeconds * 1000);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log("🛑 Reply detection polling stopped");
    }
  }

  private async checkForReplies(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;
      
      // Get all active mailboxes
      const mailboxes = await db
        .select()
        .from(emailMailboxes)
        .where(eq(emailMailboxes.status, "active"));

      for (const mailbox of mailboxes) {
        if (mailbox.provider === "smtp" || mailbox.provider === "gmail") {
          await this.checkMailboxReplies(mailbox);
        }
      }
    } catch (error) {
      console.error("❌ Reply check error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async checkMailboxReplies(mailbox: any): Promise<void> {
    return new Promise((resolve) => {
      try {
        // Decrypt password
        const password = mailbox.smtpPassword 
          ? mailboxService.decrypt(mailbox.smtpPassword)
          : "";

        if (!password) {
          console.log(`⚠️ No password for mailbox ${mailbox.email}`);
          resolve();
          return;
        }

        // Configure IMAP for Gmail
        const imapConfig: Imap.Config = {
          user: mailbox.smtpUser || mailbox.email,
          password: password,
          host: mailbox.provider === "gmail" ? "imap.gmail.com" : "imap.gmail.com",
          port: 993,
          tls: true,
          tlsOptions: { rejectUnauthorized: false },
        };

        const imap = new Imap(imapConfig);

        imap.once("ready", () => {
          imap.openBox("INBOX", false, (err, box) => {
            if (err) {
              console.error(`❌ IMAP open box error for ${mailbox.email}:`, err);
              imap.end();
              resolve();
              return;
            }

            // Search for unread emails
            imap.search(["UNSEEN"], (err, results) => {
              if (err) {
                console.error(`❌ IMAP search error for ${mailbox.email}:`, err);
                imap.end();
                resolve();
                return;
              }

              if (!results || results.length === 0) {
                console.log(`📭 No unread emails in ${mailbox.email}`);
                imap.end();
                resolve();
                return;
              }

              console.log(`📨 Found ${results.length} unread emails in ${mailbox.email}`);

              const fetch = imap.fetch(results, {
                bodies: "",
                markSeen: false, // Don't mark as seen immediately - only after successful processing
              });

              const processingPromises: Promise<{ seqno: number; success: boolean }>[] = [];
              
              fetch.on("message", (msg, seqno) => {
                msg.on("body", (stream) => {
                  const processingPromise = new Promise<{ seqno: number; success: boolean }>((resolveMsg) => {
                    simpleParser(stream, async (err: any, parsed: any) => {
                      if (err) {
                        console.error("❌ Email parse error:", err);
                        resolveMsg({ seqno, success: false });
                        return;
                      }

                      try {
                        const success = await this.processReply(parsed, mailbox);
                        resolveMsg({ seqno, success });
                      } catch (error) {
                        console.error("❌ Process reply error:", error);
                        resolveMsg({ seqno, success: false });
                      }
                    });
                  });
                  
                  processingPromises.push(processingPromise);
                });
              });
              
              // Wait for all messages to be processed, then mark as seen
              fetch.once("end", async () => {
                const results = await Promise.all(processingPromises);
                const emailsToMark = results.filter(r => r.success).map(r => r.seqno);
                
                if (emailsToMark.length > 0) {
                  console.log(`✅ Marking ${emailsToMark.length} emails as seen...`);
                  imap.addFlags(emailsToMark, ["\\Seen"], (flagErr) => {
                    if (flagErr) {
                      console.error("❌ Failed to mark emails as seen:", flagErr);
                    } else {
                      console.log(`✅ Successfully marked ${emailsToMark.length} emails as seen`);
                    }
                    imap.end();
                    resolve();
                  });
                } else {
                  imap.end();
                  resolve();
                }
              });

              fetch.once("error", (err: any) => {
                console.error(`❌ IMAP fetch error for ${mailbox.email}:`, err);
                imap.end();
                resolve();
              });
            });
          });
        });

        imap.once("error", (err: any) => {
          console.error(`❌ IMAP connection error for ${mailbox.email}:`, err);
          resolve();
        });

        imap.once("end", () => {
          resolve();
        });

        imap.connect();

      } catch (error) {
        console.error(`❌ Mailbox check error for ${mailbox.email}:`, error);
        resolve();
      }
    });
  }

  private cleanReplyContent(rawContent: string): string {
    // Remove quoted text and signatures from reply
    let cleaned = rawContent;
    
    // Split by lines
    const lines = cleaned.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Stop at quoted content indicators
      if (
        line.startsWith('>') || // Quoted line
        line.startsWith('On ') && line.includes('wrote:') || // Gmail/Outlook quote header
        line.match(/^[-_]{3,}/) || // Signature separator
        line.match(/^From:.*Sent:/) // Outlook quote header
      ) {
        break;
      }
      
      // Stop at signature indicators
      if (
        line === '--' ||
        line.match(/^Best regards,?$/i) ||
        line.match(/^Thanks,?$/i) ||
        line.match(/^Regards,?$/i) ||
        line.match(/^Sincerely,?$/i)
      ) {
        break;
      }
      
      result.push(lines[i]);
    }
    
    return result.join('\n').trim();
  }

  /**
   * Classify reply sentiment based on content
   * Returns: "positive", "negative", "unsubscribe", or "neutral"
   */
  private classifyReply(replyContent: string): string {
    const lowerContent = replyContent.toLowerCase();

    // Check for unsubscribe/opt-out requests first (highest priority)
    const unsubscribeKeywords = [
      "unsubscribe",
      "opt out",
      "opt-out",
      "remove me",
      "stop emailing",
      "stop sending",
      "don't contact",
      "do not contact",
      "don't email",
      "do not email",
      "take me off",
      "remove from list",
      "not interested",
    ];

    if (unsubscribeKeywords.some(keyword => lowerContent.includes(keyword))) {
      return "unsubscribe";
    }

    // Check for positive indicators
    const positiveKeywords = [
      "interested",
      "tell me more",
      "sounds good",
      "let's talk",
      "schedule",
      "meeting",
      "demo",
      "yes",
      "sure",
      "absolutely",
      "definitely",
      "great",
      "sounds interesting",
      "can you share",
      "i'd like to",
      "would love to",
      "perfect",
      "excellent",
    ];

    const positiveCount = positiveKeywords.filter(keyword => lowerContent.includes(keyword)).length;

    // Check for negative indicators
    const negativeKeywords = [
      "no thanks",
      "not now",
      "maybe later",
      "too busy",
      "don't need",
      "already have",
      "not looking",
      "not a fit",
      "wrong person",
      "not the right",
    ];

    const negativeCount = negativeKeywords.filter(keyword => lowerContent.includes(keyword)).length;

    // Classification logic
    if (positiveCount > 0 && positiveCount >= negativeCount) {
      return "positive";
    } else if (negativeCount > 0) {
      return "negative";
    }

    return "neutral";
  }

  private async processReply(email: any, mailbox: any): Promise<boolean> {
    try {
      const fromEmail = email.from?.value?.[0]?.address || email.from?.text;
      const subject = email.subject || "";
      const rawBody = email.text || email.html || "";
      const body = this.cleanReplyContent(rawBody);
      const messageId = email.messageId;
      const inReplyTo = email.inReplyTo;

      if (!fromEmail || !body) {
        return false;
      }

      console.log(`📧 Processing reply from ${fromEmail} - Subject: "${subject.substring(0, 50)}..."`);
      console.log(`📧 Cleaned reply content: "${body.substring(0, 100)}..."`);

      // Find the original sent email by matching recipient and subject/message-id
      // Order by scheduled_for DESC to prioritize most recent emails
      const sentEmails = await db
        .select()
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.mailboxId, mailbox.id),
            eq(emailQueue.status, "sent")
          )
        )
        .orderBy(desc(emailQueue.scheduledFor));

      let matchedEmail = null;
      let potentialMatches: any[] = [];

      // First pass: collect all potential matches from this sender
      for (const sentEmail of sentEmails) {
        const prospectEmail = await this.getProspectEmail(sentEmail.prospectId);
        
        if (!prospectEmail) continue;

        // Match by prospect email
        if (prospectEmail.toLowerCase() === fromEmail.toLowerCase()) {
          // Check if subject matches or is a reply
          if (
            subject.toLowerCase().includes(sentEmail.subject?.toLowerCase() || "") ||
            subject.toLowerCase().includes("re:")
          ) {
            potentialMatches.push({
              email: sentEmail,
              isInReplyTo: inReplyTo === sentEmail.emailId,
            });
          }
        }
      }

      // Second pass: prioritize In-Reply-To match, otherwise use most recent
      if (potentialMatches.length > 0) {
        // First try to find exact In-Reply-To match
        const inReplyToMatch = potentialMatches.find(m => m.isInReplyTo);
        if (inReplyToMatch) {
          matchedEmail = inReplyToMatch.email;
          console.log(`✓ Matched via In-Reply-To header to sequence: ${matchedEmail.sequenceId}`);
        } else {
          // Use most recent email (already sorted by scheduledFor DESC)
          matchedEmail = potentialMatches[0].email;
          console.log(`✓ Matched to most recent email in sequence: ${matchedEmail.sequenceId}`);
        }
      }

      if (!matchedEmail) {
        console.log(`⚠️ Could not match reply from ${fromEmail} to any sent email`);
        return true; // Mark as seen anyway - not a match for our system
      }

      // Check if this exact reply already exists (by content to avoid duplicates)
      const [existingReply] = await db
        .select()
        .from(emailReplies)
        .where(
          and(
            eq(emailReplies.prospectId, matchedEmail.prospectId),
            eq(emailReplies.replyContent, body)
          )
        );

      if (existingReply) {
        console.log(`⏭️ Reply already recorded for prospect ${matchedEmail.prospectId}`);
        return true; // Already processed - mark as seen
      }

      // Classify the reply
      const sentiment = this.classifyReply(body);
      console.log(`🏷️ Reply classified as: ${sentiment}`);

      // Find the email record in the emails table for analytics
      const [emailRecord] = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.prospectId, matchedEmail.prospectId),
            eq(emails.sequenceId, matchedEmail.sequenceId || "")
          )
        )
        .orderBy(desc(emails.sentAt))
        .limit(1);

      // Store the reply
      const replyReceivedAt = new Date(email.date || Date.now());
      await db.insert(emailReplies).values({
        emailId: emailRecord?.id || null,
        sequenceId: matchedEmail.sequenceId || null,
        prospectId: matchedEmail.prospectId,
        replyContent: body,
        sentiment,
        receivedAt: replyReceivedAt,
        aiSummary: null,
        nextAction: null,
      });

      // Update the emails table to mark as replied for analytics
      if (emailRecord) {
        await db
          .update(emails)
          .set({ repliedAt: replyReceivedAt })
          .where(eq(emails.id, emailRecord.id));
        
        console.log(`📊 Updated email ${emailRecord.id} with repliedAt timestamp for analytics`);
      }

      // Update sequence prospect based on reply classification
      if (matchedEmail.sequenceId) {
        let newStatus = "replied";
        
        // If unsubscribe detected, mark as unsubscribed and stop sequence
        if (sentiment === "unsubscribe") {
          newStatus = "unsubscribed";
          
          // Create unsubscribe record
          const { unsubscribes } = await import("@shared/schema");
          await db.insert(unsubscribes).values({
            prospectId: matchedEmail.prospectId,
            email: fromEmail,
            reason: body.substring(0, 500), // Store up to 500 chars of reason
          });
          
          console.log(`🚫 Prospect ${matchedEmail.prospectId} unsubscribed - sequence stopped`);
        }

        await db
          .update(sequenceProspects)
          .set({
            replies: sql`${sequenceProspects.replies} + 1`,
            status: newStatus,
          })
          .where(
            and(
              eq(sequenceProspects.sequenceId, matchedEmail.sequenceId),
              eq(sequenceProspects.prospectId, matchedEmail.prospectId)
            )
          );
      }

      console.log(`✅ Stored reply from ${fromEmail} for prospect ${matchedEmail.prospectId}`);
      return true; // Success - mark as seen
    } catch (error) {
      console.error("❌ Process reply error:", error);
      return false; // Error - don't mark as seen, will retry
    }
  }

  private async getProspectEmail(prospectId: string): Promise<string | null> {
    try {
      const [prospect] = await db.query.prospects.findMany({
        where: (prospects, { eq }) => eq(prospects.id, prospectId),
      });
      
      return prospect?.primaryEmail || null;
    } catch (error) {
      console.error("Error getting prospect email:", error);
      return null;
    }
  }
}

export const replyDetectionService = new ReplyDetectionService();
