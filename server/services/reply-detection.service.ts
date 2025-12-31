import Imap from "imap";
// @ts-ignore - mailparser doesn't have types
import { simpleParser } from "mailparser";
import { db } from "../db";
import { emailReplies, emailQueue, emailMailboxes, sequenceProspects, emails, automationRuns, prospects as prospectsTable } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { mailboxService } from "./mailbox.service";
import sequenceStepService from "./sequence-step.service";
import { Sentry, isSentryEnabled } from "../sentry";
import { emailQueueService } from "./email-queue.service";
import { hardeningService } from "./hardening.service";

/**
 * Comprehensive reply classification result
 */
interface ReplyClassification {
  replyType: "human_reply" | "ooo" | "bounce" | "auto_reply";
  sentiment: "positive" | "negative" | "neutral" | "unsubscribe";
  intent: "interested" | "meeting_request" | "not_now" | "question" | "objection" | "unsubscribe" | "ooo" | "bounce" | null;
  extractedInfo: {
    preferredTime?: string;
    questions?: string[];
    objections?: string[];
    returnDate?: Date;
    forwardTo?: string;
  };
  oooReturnDate?: Date;
}

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
          // KILL SWITCH CHECK: Skip mailboxes for paused tenants
          // userId is required per schema, but check anyway for safety
          if (mailbox.userId) {
            const isPaused = await hardeningService.isAutomationPausedForUser(mailbox.userId);
            if (isPaused) {
              console.log(`⏸️  Skipping reply check for mailbox ${mailbox.email} - tenant automation paused`);
              continue;
            }
          } else {
            // Defensive: skip mailboxes without userId (should not happen per schema)
            console.warn(`⚠️  Skipping mailbox ${mailbox.email} - no userId assigned (unexpected)`);
            continue;
          }
          await this.checkMailboxReplies(mailbox);
        }
      }
    } catch (error) {
      console.error("❌ Reply check error:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'reply-detection', operation: 'checkForReplies' }
        });
      }
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
                markSeen: false,
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
          if (err.textCode === 'AUTHENTICATIONFAILED' || err.source === 'authentication') {
            console.log(`⏭️ Skipping ${mailbox.email} - IMAP credentials need updating`);
          } else {
            console.error(`❌ IMAP connection error for ${mailbox.email}:`, err);
          }
          resolve();
        });

        imap.once("end", () => {
          resolve();
        });

        imap.connect();

      } catch (error) {
        console.error(`❌ Mailbox check error for ${mailbox.email}:`, error);
        if (isSentryEnabled()) {
          Sentry.captureException(error, {
            tags: { service: 'reply-detection', operation: 'checkMailboxReplies' },
            extra: { mailboxEmail: mailbox.email }
          });
        }
        resolve();
      }
    });
  }

  private cleanReplyContent(rawContent: string): string {
    const lines = rawContent.split('\n');
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (
        line.startsWith('>') ||
        (line.startsWith('On ') && line.includes('wrote:')) ||
        line.match(/^[-_]{3,}/) ||
        line.match(/^From:.*Sent:/)
      ) {
        break;
      }
      
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
   * Detect if email is an Out-of-Office auto-reply
   */
  private detectOOO(content: string, subject: string): { isOOO: boolean; returnDate?: Date } {
    const lowerContent = content.toLowerCase();
    const lowerSubject = subject.toLowerCase();

    const oooIndicators = [
      "out of office", "out of the office", "away from the office", "away from my desk",
      "on vacation", "on holiday", "on leave", "on pto", "parental leave",
      "maternity leave", "paternity leave", "limited access to email",
      "will be out", "currently out", "automatic reply", "auto-reply", "autoreply",
      "i am currently away", "i'm currently away", "i will be away", "i'll be away",
      "will return", "returning on", "back on", "back in the office",
    ];

    const isOOO = oooIndicators.some(indicator => 
      lowerContent.includes(indicator) || lowerSubject.includes(indicator)
    );

    if (!isOOO) {
      return { isOOO: false };
    }

    const returnDate = this.extractReturnDate(content);
    return { isOOO: true, returnDate };
  }

  /**
   * Extract return date from OOO message
   */
  private extractReturnDate(content: string): Date | undefined {
    const datePatterns = [
      /(?:back|return|returning)\s+(?:on|by)?\s*(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
      /(?:back|return|returning)\s+(?:on|by)?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
      /(?:back|return|returning)\s+(?:on|by)?\s*(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)/i,
      /(?:out|away|unavailable)\s+(?:until|till)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
      /(?:back|return|returning|until)\s+(\d{4}-\d{2}-\d{2})/i,
    ];

    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          const parsedDate = new Date(match[1]);
          if (!isNaN(parsedDate.getTime())) {
            if (parsedDate.getFullYear() < 2020) {
              const now = new Date();
              parsedDate.setFullYear(now.getFullYear());
              if (parsedDate < now) {
                parsedDate.setFullYear(now.getFullYear() + 1);
              }
            }
            return parsedDate;
          }
        } catch (e) {
          // Continue to next pattern
        }
      }
    }

    const daysPattern = /(?:back|return|returning)\s+in\s+(\d+)\s*days?/i;
    const daysMatch = content.match(daysPattern);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + days);
      return returnDate;
    }

    if (/(?:back|return)\s+next\s+week/i.test(content)) {
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + 7);
      return returnDate;
    }

    return undefined;
  }

  /**
   * Detect if email is a bounce notification
   */
  private detectBounce(content: string, subject: string, fromEmail: string): boolean {
    const lowerContent = content.toLowerCase();
    const lowerSubject = subject.toLowerCase();
    const lowerFrom = fromEmail.toLowerCase();

    const bounceIndicators = [
      "mail delivery failed", "delivery status notification", "undeliverable",
      "undelivered mail", "message not delivered", "delivery failure",
      "failed to deliver", "mailbox not found", "user unknown", "no such user",
      "address rejected", "recipient rejected", "does not exist",
      "mailbox unavailable", "permanent failure", "5.1.1", "550 5.1.1", "554 5.7.1",
    ];

    const bounceFromAddresses = ["mailer-daemon", "postmaster", "mail-daemon", "noreply", "no-reply"];

    const isBounceContent = bounceIndicators.some(indicator => 
      lowerSubject.includes(indicator) || lowerContent.includes(indicator)
    );

    const isBounceFrom = bounceFromAddresses.some(addr => lowerFrom.includes(addr));

    return isBounceContent || isBounceFrom;
  }

  /**
   * Classify intent from human reply
   */
  private classifyIntent(content: string): ReplyClassification["intent"] {
    const lowerContent = content.toLowerCase();

    const meetingIndicators = [
      "schedule a call", "schedule a meeting", "book a time", "book a call",
      "set up a meeting", "set up a call", "let's schedule", "let's set up",
      "can we meet", "can we talk", "let's talk", "hop on a call", "quick call",
      "15 minutes", "30 minutes", "availability", "calendar", "what times work",
      "when are you free", "send me some times",
    ];

    if (meetingIndicators.some(ind => lowerContent.includes(ind))) {
      return "meeting_request";
    }

    const questionIndicators = [
      "how does", "what is", "what are", "can you explain", "could you tell me",
      "i have a question", "quick question", "wondering if", "curious about",
      "more details", "more information", "tell me more",
    ];

    const hasQuestion = questionIndicators.some(ind => lowerContent.includes(ind)) || lowerContent.includes("?");

    const interestedIndicators = [
      "interested", "sounds good", "sounds great", "this is interesting",
      "i'd like to learn", "would love to", "please send", "send me",
      "share more", "yes please", "absolutely", "definitely", "perfect", "excellent",
    ];

    if (interestedIndicators.some(ind => lowerContent.includes(ind))) {
      return "interested";
    }

    const objectionIndicators = [
      "too expensive", "not in our budget", "budget constraints",
      "already using", "already have", "happy with", "not a priority",
      "don't see the value", "not convinced", "concerns about", "worried about",
      "hesitant", "not sure if",
    ];

    if (objectionIndicators.some(ind => lowerContent.includes(ind))) {
      return "objection";
    }

    const notNowIndicators = [
      "not now", "maybe later", "not at this time", "check back",
      "reach out later", "follow up in", "revisit in", "not a good time",
      "too busy", "bad timing", "end of quarter", "next quarter", "next year",
    ];

    if (notNowIndicators.some(ind => lowerContent.includes(ind))) {
      return "not_now";
    }

    const unsubscribeIndicators = [
      "unsubscribe", "opt out", "opt-out", "remove me", "stop emailing",
      "stop sending", "don't contact", "do not contact", "take me off", "remove from list",
    ];

    if (unsubscribeIndicators.some(ind => lowerContent.includes(ind))) {
      return "unsubscribe";
    }

    if (hasQuestion) {
      return "question";
    }

    // Fallback pattern matching for common reply types
    // Acknowledgment responses (likely positive engagement)
    const acknowledgmentIndicators = [
      "thanks for", "thank you for", "appreciate", "got it", "received",
      "noted", "understood", "will review", "will look", "will check",
      "let me get back", "i'll get back", "following up", "circling back",
    ];

    if (acknowledgmentIndicators.some(ind => lowerContent.includes(ind))) {
      return "interested";
    }

    // Referral patterns (forwarding to someone else)
    const referralIndicators = [
      "forwarding to", "looping in", "cc'ing", "adding", "copied",
      "right person", "better suited", "connect you with", "introduce you to",
      "colleague", "team member", "pass this along", "share with",
    ];

    if (referralIndicators.some(ind => lowerContent.includes(ind))) {
      return "interested";
    }

    // Hard decline patterns - these indicate prospect wants no further contact
    const hardDeclineIndicators = [
      "no thanks", "not interested", "pass on this", "please stop",
      "no need", "not for us", "doesn't fit", "wrong fit", "not a fit",
      "we're not looking", "we've decided", "no longer interested",
    ];

    if (hardDeclineIndicators.some(ind => lowerContent.includes(ind))) {
      return "unsubscribe";
    }

    // Soft decline patterns - timing issue but may revisit
    const softDeclineIndicators = [
      "we're good for now", "all set for now", "maybe next year",
      "not right now but", "possibly in the future", "keep me on file",
    ];

    if (softDeclineIndicators.some(ind => lowerContent.includes(ind))) {
      return "not_now";
    }

    // Short positive response detection (check for standalone affirmatives)
    // Uses word boundary matching to handle short replies like "Yes!" or "Sure, let's talk"
    const shortPositiveWords = ["yes", "ok", "okay", "sure", "great", "absolutely", "definitely"];
    const firstWord = lowerContent.trim().split(/[\s,!.]+/)[0];
    if (shortPositiveWords.includes(firstWord) && lowerContent.length < 100) {
      return "interested";
    }

    return null;
  }

  /**
   * Extract key information from reply
   */
  private extractKeyInfo(content: string): ReplyClassification["extractedInfo"] {
    const info: ReplyClassification["extractedInfo"] = {};

    const timePatterns = [
      /(?:available|free|works?|good)\s+(?:on\s+)?(\w+day)/i,
      /(\w+day)\s+(?:works?|good|free)/i,
      /(?:how about|let's do)\s+(\w+day\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(?:works?|good)/i,
      /(?:morning|afternoon|evening)\s+(?:works?|good|free)/i,
    ];

    for (const pattern of timePatterns) {
      const match = content.match(pattern);
      if (match) {
        info.preferredTime = match[0];
        break;
      }
    }

    const questions = content.match(/[^.!?]*\?/g);
    if (questions && questions.length > 0) {
      info.questions = questions.map((q: string) => q.trim()).filter((q: string) => q.length > 10);
    }

    const objectionPhrases = [
      /(?:concern[s]?\s+(?:is|are|about)\s+)([^.!?]+)/i,
      /(?:worried\s+(?:about|that)\s+)([^.!?]+)/i,
      /(?:not sure\s+(?:if|about|that)\s+)([^.!?]+)/i,
      /(?:hesitant\s+(?:because|about)\s+)([^.!?]+)/i,
    ];

    const objections: string[] = [];
    for (const pattern of objectionPhrases) {
      const match = content.match(pattern);
      if (match && match[1]) {
        objections.push(match[1].trim());
      }
    }
    if (objections.length > 0) {
      info.objections = objections;
    }

    const forwardPattern = /(?:forward(?:ed|ing)?\s+(?:this\s+)?to\s+|cc[':]?ing\s+|looping\s+in\s+|adding\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
    const forwardMatch = content.match(forwardPattern);
    if (forwardMatch) {
      info.forwardTo = forwardMatch[1];
    }

    return info;
  }

  /**
   * Comprehensive reply classification
   */
  private classifyReplyComprehensive(content: string, subject: string, fromEmail: string): ReplyClassification {
    if (this.detectBounce(content, subject, fromEmail)) {
      return {
        replyType: "bounce",
        sentiment: "neutral",
        intent: "bounce",
        extractedInfo: {},
      };
    }

    const oooResult = this.detectOOO(content, subject);
    if (oooResult.isOOO) {
      return {
        replyType: "ooo",
        sentiment: "neutral",
        intent: "ooo",
        extractedInfo: { returnDate: oooResult.returnDate },
        oooReturnDate: oooResult.returnDate,
      };
    }

    const intent = this.classifyIntent(content);
    const extractedInfo = this.extractKeyInfo(content);

    let sentiment: ReplyClassification["sentiment"] = "neutral";
    if (intent === "interested" || intent === "meeting_request") {
      sentiment = "positive";
    } else if (intent === "unsubscribe") {
      sentiment = "unsubscribe";
    } else if (intent === "objection" || intent === "not_now") {
      sentiment = "negative";
    }

    return { replyType: "human_reply", sentiment, intent, extractedInfo };
  }

  /**
   * Extract original Message-ID from DSN/bounce email body
   * DSN emails contain the original Message-ID in various formats
   */
  private extractMessageIdFromDSN(body: string, references?: string | string[]): string | null {
    // Check References header first (contains thread of Message-IDs)
    if (references) {
      // Handle case where references is an array
      const refString = Array.isArray(references) ? references.join(' ') : references;
      // Ensure refString is actually a string before calling match
      if (typeof refString === 'string') {
        const refMatch = refString.match(/<[^>]+>/g);
        if (refMatch && refMatch.length > 0) {
          return refMatch[0]; // First reference is typically the original
        }
      }
    }

    // Common DSN patterns for original Message-ID
    const dsnPatterns = [
      /Original-Message-ID:\s*(<[^>]+>)/i,
      /Message-ID:\s*(<[^>]+>)/im,
      /Original message ID:\s*(<[^>]+>)/i,
      /X-Original-Message-ID:\s*(<[^>]+>)/i,
      /Original-Envelope-ID:\s*(<[^>]+>)/i,
      /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/g, // Email-like Message-ID in angle brackets
    ];

    for (const pattern of dsnPatterns) {
      const match = body.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Extract failed recipient email from DSN body
   */
  private extractFailedRecipient(body: string, headers: any): string | null {
    // Check X-Failed-Recipients header first
    if (headers?.['x-failed-recipients']) {
      return headers['x-failed-recipients'];
    }

    // DSN patterns for failed recipient
    const recipientPatterns = [
      /Final-Recipient:\s*(?:rfc822;)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /X-Failed-Recipients:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /Original-Recipient:\s*(?:rfc822;)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /Remote-MTA:\s*dns;\s*([a-zA-Z0-9.-]+)/i,
      /was not delivered to:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /could not be delivered to:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /The following address failed:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /Delivery to the following recipient failed permanently:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    ];

    for (const pattern of recipientPatterns) {
      const match = body.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    }

    return null;
  }

  private async processReply(email: any, mailbox: any): Promise<boolean> {
    try {
      const fromEmail = email.from?.value?.[0]?.address || email.from?.text;
      const subject = email.subject || "";
      const rawBody = email.text || email.html || "";
      const body = this.cleanReplyContent(rawBody);
      const inReplyTo = email.inReplyTo;
      const references = email.references;
      const headers = email.headers;

      if (!fromEmail || !body) {
        return false;
      }

      // Early detection of bounce/DSN emails
      const isBounce = this.detectBounce(rawBody, subject, fromEmail);

      console.log(`📧 Processing ${isBounce ? 'BOUNCE' : 'reply'} from ${fromEmail} - Subject: "${subject.substring(0, 50)}..." - In-Reply-To: ${inReplyTo || 'none'}`);

      let matchedEmail = null;
      let matchedEmailRecord = null;

      // For bounces, try enhanced matching strategies
      if (isBounce) {
        // Strategy 1: Extract failed recipient from DSN body and match to prospect
        const failedRecipient = this.extractFailedRecipient(rawBody, headers);
        if (failedRecipient) {
          console.log(`📭 DSN: Failed recipient detected: ${failedRecipient}`);
          
          // Find prospect by email, then find their most recent sent email
          const prospectByEmail = await db.query.prospects.findFirst({
            where: (p, { or, eq }) => or(
              eq(p.primaryEmail, failedRecipient),
              eq(p.secondaryEmail, failedRecipient)
            )
          });

          if (prospectByEmail) {
            // Find the most recent email sent to this prospect
            const [recentEmail] = await db
              .select()
              .from(emails)
              .where(eq(emails.prospectId, prospectByEmail.id))
              .orderBy(desc(emails.sentAt))
              .limit(1);

            if (recentEmail) {
              console.log(`✅ Matched bounce by failed recipient: ${failedRecipient} -> prospect ${prospectByEmail.id}`);
              matchedEmailRecord = recentEmail;
              matchedEmail = {
                prospectId: recentEmail.prospectId,
                sequenceId: recentEmail.sequenceId,
                subject: recentEmail.subject,
              };
            }
          }
        }

        // Strategy 2: Extract original Message-ID from DSN body
        if (!matchedEmail) {
          const originalMessageId = this.extractMessageIdFromDSN(rawBody, references);
          if (originalMessageId) {
            console.log(`📭 DSN: Found original Message-ID: ${originalMessageId}`);
            
            const [emailRecord] = await db
              .select()
              .from(emails)
              .where(eq(emails.messageId, originalMessageId))
              .limit(1);

            if (emailRecord) {
              console.log(`✅ Matched bounce by extracted Message-ID: ${originalMessageId}`);
              matchedEmailRecord = emailRecord;
              matchedEmail = {
                prospectId: emailRecord.prospectId,
                sequenceId: emailRecord.sequenceId,
                subject: emailRecord.subject,
              };
            }
          }
        }
      }

      // Standard matching: try In-Reply-To header
      if (!matchedEmail && inReplyTo) {
        const [emailRecord] = await db
          .select()
          .from(emails)
          .where(eq(emails.messageId, inReplyTo))
          .limit(1);

        if (emailRecord) {
          console.log(`✅ Matched reply by Message-ID: ${inReplyTo}`);
          matchedEmailRecord = emailRecord;
          
          const [queueItem] = await db
            .select()
            .from(emailQueue)
            .where(eq(emailQueue.id, emailRecord.trackingId || ''))
            .limit(1);
          
          matchedEmail = queueItem || {
            prospectId: emailRecord.prospectId,
            sequenceId: emailRecord.sequenceId,
            subject: emailRecord.subject,
          };
        }
      }

      // Fallback: Match by prospect email + subject pattern
      if (!matchedEmail) {
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

        const potentialMatches: any[] = [];

        for (const sentEmail of sentEmails) {
          const prospectEmail = await this.getProspectEmail(sentEmail.prospectId);
          if (!prospectEmail) continue;

          if (prospectEmail.toLowerCase() === fromEmail.toLowerCase()) {
            // Check if subject matches (with or without "Re:" prefix)
            const normalizedSentSubject = (sentEmail.subject || "").toLowerCase().replace(/^re:\s*/i, '').trim();
            const normalizedReplySubject = subject.toLowerCase().replace(/^re:\s*/i, '').trim();
            
            if (
              normalizedReplySubject.includes(normalizedSentSubject) ||
              normalizedSentSubject.includes(normalizedReplySubject) ||
              subject.toLowerCase().startsWith("re:")
            ) {
              potentialMatches.push({
                email: sentEmail,
                subjectMatch: normalizedReplySubject === normalizedSentSubject,
              });
            }
          }
        }

        if (potentialMatches.length > 0) {
          // Prefer exact subject match
          const exactMatch = potentialMatches.find(m => m.subjectMatch);
          matchedEmail = exactMatch ? exactMatch.email : potentialMatches[0].email;
          console.log(`✅ Matched reply by subject/sender: ${fromEmail} -> prospect ${matchedEmail.prospectId}`);
        }
      }

      if (!matchedEmail) {
        console.log(`⚠️ Could not match reply from ${fromEmail} to any sent email (Subject: "${subject}")`);
        return true;
      }

      // Check for duplicate
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
        return true;
      }

      // Comprehensive classification
      const classification = this.classifyReplyComprehensive(body, subject, fromEmail);
      console.log(`🏷️ Reply classified - Type: ${classification.replyType}, Sentiment: ${classification.sentiment}, Intent: ${classification.intent}`);

      // Find the email record for analytics
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

      const replyReceivedAt = new Date(email.date || Date.now());

      // Store the reply with enhanced classification
      await db.insert(emailReplies).values({
        emailId: emailRecord?.id || null,
        sequenceId: matchedEmail.sequenceId || null,
        prospectId: matchedEmail.prospectId,
        replyContent: body,
        sentiment: classification.sentiment,
        replyType: classification.replyType,
        intent: classification.intent,
        extractedInfo: classification.extractedInfo,
        oooReturnDate: classification.oooReturnDate,
        receivedAt: replyReceivedAt,
        processed: false,
      });

      // Update email record with repliedAt
      if (emailRecord) {
        await db
          .update(emails)
          .set({ repliedAt: replyReceivedAt })
          .where(eq(emails.id, emailRecord.id));
      }

      // Handle bounces - mark prospect email as bounced and cancel future sends
      if (classification.replyType === "bounce") {
        console.log(`📭 Bounce detected for prospect ${matchedEmail.prospectId}`);
        if (emailRecord) {
          await db.update(emails)
            .set({ bouncedAt: replyReceivedAt })
            .where(eq(emails.id, emailRecord.id));
        }
        // Get prospect userId for bounce handling
        const bounceProspect = await db.query.prospects.findFirst({
          where: eq(prospectsTable.id, matchedEmail.prospectId)
        });
        if (bounceProspect?.userId) {
          await emailQueueService.handleBounce(matchedEmail.prospectId, bounceProspect.userId);
        }
      }

      // Handle OOO - reschedule follow-ups after return date
      if (classification.replyType === "ooo" && classification.oooReturnDate) {
        console.log(`🏖️ OOO detected - Return date: ${classification.oooReturnDate.toISOString()}`);
        const oooProspect = await db.query.prospects.findFirst({
          where: eq(prospectsTable.id, matchedEmail.prospectId)
        });
        if (oooProspect?.userId) {
          const rescheduled = await emailQueueService.rescheduleForOOO(
            matchedEmail.prospectId, 
            classification.oooReturnDate, 
            oooProspect.userId
          );
          console.log(`📅 Rescheduled ${rescheduled} emails after OOO return`);
        }
      }

      // Update sequence prospect status
      if (matchedEmail.sequenceId) {
        let newStatus = "replied";
        
        if (classification.sentiment === "unsubscribe") {
          newStatus = "unsubscribed";
          
          const { unsubscribes } = await import("@shared/schema");
          const prospect = await db.query.prospects.findFirst({
            where: eq(prospectsTable.id, matchedEmail.prospectId)
          });
          
          await db.insert(unsubscribes).values({
            userId: prospect?.userId || "",
            prospectId: matchedEmail.prospectId,
            email: fromEmail,
            reason: body.substring(0, 500),
          });
          
          console.log(`🚫 Prospect ${matchedEmail.prospectId} unsubscribed`);
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
        
        // Update automation run statistics
        const [sequenceProspect] = await db.select()
          .from(sequenceProspects)
          .where(
            and(
              eq(sequenceProspects.sequenceId, matchedEmail.sequenceId),
              eq(sequenceProspects.prospectId, matchedEmail.prospectId)
            )
          );
        
        let automationRunId: string | null | undefined = sequenceProspect?.automationRunId;
        
        // Fallback: If no automationRunId on sequence_prospect, find a run that was active when reply received
        // CRITICAL: Only attribute to runs that started before or at reply time
        if (!automationRunId && matchedEmail.sequenceId) {
          const prospect = await db.query.prospects.findFirst({
            where: eq(prospectsTable.id, matchedEmail.prospectId)
          });
          
          if (prospect?.userId) {
            const candidateRuns = await db.select()
              .from(automationRuns)
              .where(
                and(
                  eq(automationRuns.sequenceId, matchedEmail.sequenceId!),
                  eq(automationRuns.userId, prospect.userId),
                  // Run must have started before or at reply time
                  sql`${automationRuns.startedAt} <= ${replyReceivedAt}`
                )
              )
              .orderBy(sql`${automationRuns.startedAt} DESC`)
              .limit(1);
            
            const activeRun = candidateRuns[0];
            
            // Only use if run was active (not completed before reply was received)
            if (activeRun && (!activeRun.completedAt || new Date(activeRun.completedAt) >= replyReceivedAt)) {
              automationRunId = activeRun.id;
              
              // Backfill automationRunId for future
              if (sequenceProspect) {
                await db.update(sequenceProspects)
                  .set({ automationRunId })
                  .where(eq(sequenceProspects.id, sequenceProspect.id));
                console.log(`🔗 Backfilled automationRunId on sequence_prospect for replies`);
              }
            }
          }
        }
        
        if (automationRunId) {
          await db.update(automationRuns)
            .set({ repliesReceived: sql`${automationRuns.repliesReceived} + 1` })
            .where(eq(automationRuns.id, automationRunId));
          console.log(`📊 Incremented repliesReceived for automation run ${automationRunId}`);
        }
        
        // Auto-pause sequence for human replies (not OOO or bounces)
        if (classification.replyType === "human_reply") {
          const prospect = await db.query.prospects.findFirst({
            where: eq(prospectsTable.id, matchedEmail.prospectId)
          });
          
          const cancelledCount = await sequenceStepService.cancelFutureSteps(
            matchedEmail.sequenceId,
            matchedEmail.prospectId,
            prospect?.userId
          );
          
          if (cancelledCount > 0) {
            console.log(`⏸️ Paused sequence: Cancelled ${cancelledCount} future emails`);
          }
        } else if (classification.replyType === "ooo") {
          // Explicit logging for OOO - sequence continues but emails are rescheduled
          console.log(`📅 OOO Reply: Sequence for prospect ${matchedEmail.prospectId} will continue after return date. Emails rescheduled, not cancelled.`);
        } else if (classification.replyType === "bounce") {
          // Explicit logging for bounces - handled separately via handleBounce
          console.log(`📭 Bounce: Future emails cancelled for prospect ${matchedEmail.prospectId} via bounce handler.`);
        }
      }

      console.log(`✅ Reply from ${fromEmail} processed successfully`);
      return true;

    } catch (error) {
      console.error("❌ Error processing reply:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'reply-detection', operation: 'processReply' }
        });
      }
      return false;
    }
  }

  private async getProspectEmail(prospectId: string | null): Promise<string | null> {
    if (!prospectId) return null;
    try {
      const prospect = await db.query.prospects.findFirst({
        where: eq(prospectsTable.id, prospectId)
      });
      return prospect?.primaryEmail || prospect?.secondaryEmail || null;
    } catch (error) {
      console.error("Error getting prospect email:", error);
      return null;
    }
  }
}

export const replyDetectionService = new ReplyDetectionService();
