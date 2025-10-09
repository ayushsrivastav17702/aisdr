import Imap from "imap";
// @ts-ignore - mailparser doesn't have types
import { simpleParser } from "mailparser";
import { db } from "../db";
import { emailReplies, emailQueue, emailMailboxes, sequenceProspects } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
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

  private async processReply(email: any, mailbox: any): Promise<boolean> {
    try {
      const fromEmail = email.from?.value?.[0]?.address || email.from?.text;
      const subject = email.subject || "";
      const body = email.text || email.html || "";
      const messageId = email.messageId;
      const inReplyTo = email.inReplyTo;

      if (!fromEmail || !body) {
        return false;
      }

      console.log(`📧 Processing reply from ${fromEmail} - Subject: "${subject.substring(0, 50)}..."`);

      // Find the original sent email by matching recipient and subject/message-id
      const sentEmails = await db
        .select()
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.mailboxId, mailbox.id),
            eq(emailQueue.status, "sent")
          )
        );

      let matchedEmail = null;

      // Try to match by In-Reply-To or subject
      for (const sentEmail of sentEmails) {
        // Get prospect email from the queue entry
        const prospectEmail = await this.getProspectEmail(sentEmail.prospectId);
        
        if (!prospectEmail) continue;

        // Match by prospect email
        if (prospectEmail.toLowerCase() === fromEmail.toLowerCase()) {
          // Additional check: subject similarity or In-Reply-To header
          if (
            inReplyTo === sentEmail.emailId ||
            subject.toLowerCase().includes(sentEmail.subject?.toLowerCase() || "") ||
            subject.toLowerCase().includes("re:")
          ) {
            matchedEmail = sentEmail;
            break;
          }
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

      // Store the reply
      await db.insert(emailReplies).values({
        emailId: matchedEmail.emailId || null,
        sequenceId: matchedEmail.sequenceId || null,
        prospectId: matchedEmail.prospectId,
        replyContent: body,
        sentiment: "neutral",
        receivedAt: new Date(email.date || Date.now()),
        aiSummary: null,
        nextAction: null,
      });

      // Update sequence prospect: increment reply counter and set status to 'replied'
      if (matchedEmail.sequenceId) {
        await db
          .update(sequenceProspects)
          .set({
            replies: sql`${sequenceProspects.replies} + 1`,
            status: "replied",
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
