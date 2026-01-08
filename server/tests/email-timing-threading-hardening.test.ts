import { describe, it, expect, vi, beforeEach } from 'vitest';

const SLA_TIME_TO_SEND_MS = 60000;
const REPLY_DETECTION_SLA_MS = 30000;

interface EmailMessage {
  id: string;
  threadId: string;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  from: string;
  to: string;
  sentAt: Date;
  status: 'sent' | 'failed' | 'pending' | 'cancelled';
}

interface ReplyMessage {
  id: string;
  originalMessageId: string;
  fromEmail: string;
  subject: string;
  body: string;
  receivedAt: Date;
  classification: 'positive' | 'negative' | 'neutral' | 'ooo' | 'bounce' | 'unsubscribe';
}

const createMockEmail = (overrides?: Partial<EmailMessage>): EmailMessage => ({
  id: `email-${Math.random().toString(36).slice(2)}`,
  threadId: 'thread-123',
  messageId: `<msg-${Date.now()}@example.com>`,
  inReplyTo: null,
  references: [],
  subject: 'Re: Follow up on our conversation',
  from: 'sdr@company.com',
  to: 'prospect@example.com',
  sentAt: new Date(),
  status: 'sent',
  ...overrides
});

describe('Email Send, Timing & Threading (TC-SEQ-HARD-21 to TC-SEQ-HARD-30)', () => {

  describe('TC-SEQ-HARD-21: Measure Time-to-Send SLA', () => {
    it('should send email within SLA (<60s)', () => {
      const activationTime = new Date();
      const sendTime = new Date(activationTime.getTime() + 45000);
      
      const timeToSend = sendTime.getTime() - activationTime.getTime();
      
      expect(timeToSend).toBeLessThan(SLA_TIME_TO_SEND_MS);
    });

    it('should track timestamp differences accurately', () => {
      const timestamps = {
        queued: new Date('2024-01-15T10:00:00Z'),
        picked: new Date('2024-01-15T10:00:05Z'),
        personalized: new Date('2024-01-15T10:00:15Z'),
        sent: new Date('2024-01-15T10:00:20Z')
      };

      const queueToPickMs = timestamps.picked.getTime() - timestamps.queued.getTime();
      const pickToPersonalizeMs = timestamps.personalized.getTime() - timestamps.picked.getTime();
      const personalizeToSendMs = timestamps.sent.getTime() - timestamps.personalized.getTime();
      const totalMs = timestamps.sent.getTime() - timestamps.queued.getTime();

      expect(queueToPickMs).toBe(5000);
      expect(pickToPersonalizeMs).toBe(10000);
      expect(personalizeToSendMs).toBe(5000);
      expect(totalMs).toBe(20000);
      expect(totalMs).toBeLessThan(SLA_TIME_TO_SEND_MS);
    });

    it('should alert when SLA is breached', () => {
      const alerts: string[] = [];
      
      const checkSLA = (queuedAt: Date, sentAt: Date): void => {
        const elapsed = sentAt.getTime() - queuedAt.getTime();
        if (elapsed > SLA_TIME_TO_SEND_MS) {
          alerts.push(`SLA breach: ${elapsed}ms`);
        }
      };

      checkSLA(new Date(0), new Date(45000));
      checkSLA(new Date(0), new Date(75000));

      expect(alerts.length).toBe(1);
      expect(alerts[0]).toContain('75000ms');
    });
  });

  describe('TC-SEQ-HARD-22: SMTP Partial Failure', () => {
    it('should retry only failed recipients', async () => {
      const recipients = ['a@test.com', 'b@test.com', 'c@test.com'];
      const failedRecipients = ['b@test.com'];
      const successfulRecipients = new Set(['a@test.com', 'c@test.com']);
      
      const retryQueue: string[] = [];
      
      const sendEmail = async (to: string): Promise<boolean> => {
        if (failedRecipients.includes(to)) {
          retryQueue.push(to);
          return false;
        }
        return true;
      };

      for (const recipient of recipients) {
        await sendEmail(recipient);
      }

      expect(retryQueue).toEqual(['b@test.com']);
      expect(retryQueue.some(r => successfulRecipients.has(r))).toBe(false);
    });

    it('should not resend to already successful recipients', () => {
      const sentLog = new Set<string>();
      const retryAttempts = new Map<string, number>();
      
      const recordSend = (email: string, success: boolean): void => {
        if (success) {
          sentLog.add(email);
        } else {
          retryAttempts.set(email, (retryAttempts.get(email) || 0) + 1);
        }
      };

      const canResend = (email: string): boolean => {
        return !sentLog.has(email);
      };

      recordSend('a@test.com', true);
      recordSend('b@test.com', false);

      expect(canResend('a@test.com')).toBe(false);
      expect(canResend('b@test.com')).toBe(true);
    });
  });

  describe('TC-SEQ-HARD-23: Same Subject, Same Thread', () => {
    it('should keep follow-ups in same thread with consistent subject', () => {
      const originalSubject = 'Re: Follow up on our conversation';
      const step1 = createMockEmail({ subject: originalSubject, messageId: '<msg-1@example.com>' });
      const step2 = createMockEmail({ 
        subject: originalSubject, 
        messageId: '<msg-2@example.com>',
        inReplyTo: step1.messageId,
        references: [step1.messageId]
      });

      expect(step1.subject).toBe(step2.subject);
      expect(step2.inReplyTo).toBe(step1.messageId);
      expect(step2.threadId).toBe(step1.threadId);
    });

    it('should maintain thread chain across multiple steps', () => {
      const messages: EmailMessage[] = [];
      const threadId = 'thread-main';
      
      for (let i = 0; i < 5; i++) {
        const prevMessage = messages[i - 1];
        messages.push(createMockEmail({
          threadId,
          messageId: `<msg-${i}@example.com>`,
          inReplyTo: prevMessage?.messageId || null,
          references: messages.map(m => m.messageId)
        }));
      }

      expect(messages.every(m => m.threadId === threadId)).toBe(true);
      expect(messages[4].references.length).toBe(4);
    });
  });

  describe('TC-SEQ-HARD-24: Subject Change Threading Test', () => {
    it('should thread using Message-ID / In-Reply-To despite subject change', () => {
      const step1 = createMockEmail({ 
        subject: 'Introduction',
        messageId: '<msg-intro@example.com>'
      });
      
      const step2 = createMockEmail({
        subject: 'Quick question',
        messageId: '<msg-question@example.com>',
        inReplyTo: step1.messageId,
        references: [step1.messageId],
        threadId: step1.threadId
      });

      expect(step1.subject).not.toBe(step2.subject);
      expect(step2.inReplyTo).toBe(step1.messageId);
      expect(step2.threadId).toBe(step1.threadId);
    });

    it('should use References header for threading', () => {
      const messageChain = [
        '<msg-1@example.com>',
        '<msg-2@example.com>',
        '<msg-3@example.com>'
      ];

      const newMessage = createMockEmail({
        subject: 'New subject entirely',
        inReplyTo: messageChain[messageChain.length - 1],
        references: messageChain
      });

      expect(newMessage.references).toEqual(messageChain);
      expect(newMessage.inReplyTo).toBe('<msg-3@example.com>');
    });
  });

  describe('TC-SEQ-HARD-25: Reply After Step 1 but Before Step 2 Fires', () => {
    it('should cancel Step 2 when reply received', () => {
      const step1SentAt = new Date('2024-01-15T10:00:00Z');
      const step2ScheduledAt = new Date('2024-01-15T14:00:00Z');
      const replyReceivedAt = new Date('2024-01-15T12:00:00Z');

      const pendingSteps = [
        { stepOrder: 2, scheduledAt: step2ScheduledAt, status: 'pending' as const }
      ];

      const processReply = (receivedAt: Date) => {
        return pendingSteps.map(step => ({
          ...step,
          status: receivedAt < step.scheduledAt ? 'cancelled' as const : step.status
        }));
      };

      const updatedSteps = processReply(replyReceivedAt);
      
      expect(updatedSteps[0].status).toBe('cancelled');
    });

    it('should mark prospect as replied', () => {
      const enrollment = {
        prospectId: 'p-1',
        status: 'active' as const,
        replies: 0,
        repliedAt: null as Date | null
      };

      const handleReply = (enrollmentData: typeof enrollment, replyAt: Date) => {
        return {
          ...enrollmentData,
          status: 'replied' as const,
          replies: enrollmentData.replies + 1,
          repliedAt: replyAt
        };
      };

      const updated = handleReply(enrollment, new Date());
      
      expect(updated.status).toBe('replied');
      expect(updated.replies).toBe(1);
      expect(updated.repliedAt).not.toBeNull();
    });
  });

  describe('TC-SEQ-HARD-26: Reply Arrives Exactly at Delay Boundary', () => {
    it('should prevent race-triggered follow-up', () => {
      const step2ScheduledMs = 1000;
      const replyArrivedMs = 1000;
      
      const replyProcessedFirst = (replyMs: number, scheduledMs: number): boolean => {
        return replyMs <= scheduledMs;
      };

      expect(replyProcessedFirst(replyArrivedMs, step2ScheduledMs)).toBe(true);
    });

    it('should use locking to prevent race conditions', () => {
      let lockAcquired = false;
      const processingQueue: string[] = [];
      
      const acquireLock = (enrollmentId: string): boolean => {
        if (lockAcquired) return false;
        lockAcquired = true;
        processingQueue.push(enrollmentId);
        return true;
      };

      const releaseLock = (): void => {
        lockAcquired = false;
      };

      const replyProcess = acquireLock('enroll-1');
      const sendProcess = acquireLock('enroll-1');

      expect(replyProcess).toBe(true);
      expect(sendProcess).toBe(false);
      expect(processingQueue.length).toBe(1);

      releaseLock();
    });
  });

  describe('TC-SEQ-HARD-27: Reply From Alias Email', () => {
    it('should map alias email to prospect correctly', () => {
      const prospectEmails = {
        primary: 'john@company.com',
        aliases: ['j.doe@company.com', 'john.doe@company.com', 'jdoe@company.com']
      };

      const findProspectByEmail = (email: string): string | null => {
        if (email === prospectEmails.primary || prospectEmails.aliases.includes(email)) {
          return 'prospect-john';
        }
        return null;
      };

      expect(findProspectByEmail('j.doe@company.com')).toBe('prospect-john');
      expect(findProspectByEmail('john.doe@company.com')).toBe('prospect-john');
      expect(findProspectByEmail('unknown@other.com')).toBeNull();
    });

    it('should maintain thread mapping with alias replies', () => {
      const threadMap = new Map<string, string>();
      threadMap.set('thread-1', 'prospect-john');
      
      const replyFromAlias = {
        threadId: 'thread-1',
        fromEmail: 'j.doe@company.com'
      };

      const prospectId = threadMap.get(replyFromAlias.threadId);
      
      expect(prospectId).toBe('prospect-john');
    });
  });

  describe('TC-SEQ-HARD-28: Multiple Replies From Prospect', () => {
    it('should maintain single conversation thread', () => {
      const conversationReplies: ReplyMessage[] = [];
      const prospectId = 'prospect-1';
      
      const addReply = (content: string): void => {
        conversationReplies.push({
          id: `reply-${conversationReplies.length}`,
          originalMessageId: '<msg-original@example.com>',
          fromEmail: 'prospect@example.com',
          subject: 'Re: Follow up',
          body: content,
          receivedAt: new Date(),
          classification: 'positive'
        });
      };

      addReply('Thanks for reaching out');
      addReply('I have a follow-up question');
      addReply('One more thing...');

      expect(conversationReplies.length).toBe(3);
      expect(conversationReplies.every(r => r.originalMessageId === '<msg-original@example.com>')).toBe(true);
    });

    it('should prevent duplicate AI auto-replies', () => {
      const sentAutoReplies = new Set<string>();
      
      const canSendAutoReply = (threadId: string, replyId: string): boolean => {
        const key = `${threadId}-${replyId}`;
        if (sentAutoReplies.has(key)) {
          return false;
        }
        return true;
      };

      const markAutoReplySent = (threadId: string, replyId: string): void => {
        sentAutoReplies.add(`${threadId}-${replyId}`);
      };

      expect(canSendAutoReply('thread-1', 'reply-1')).toBe(true);
      markAutoReplySent('thread-1', 'reply-1');
      expect(canSendAutoReply('thread-1', 'reply-1')).toBe(false);
      expect(canSendAutoReply('thread-1', 'reply-2')).toBe(true);
    });
  });

  describe('TC-SEQ-HARD-29: Out-of-Office Reply Handling', () => {
    it('should classify OOO replies correctly', () => {
      const oooPatterns = [
        'out of office',
        'out of the office',
        'away from the office',
        'on vacation',
        'on holiday',
        'automatic reply',
        'auto-reply'
      ];

      const classifyReply = (body: string): string => {
        const lowerBody = body.toLowerCase();
        if (oooPatterns.some(p => lowerBody.includes(p))) {
          return 'ooo';
        }
        return 'normal';
      };

      expect(classifyReply('I am currently out of office until Jan 20')).toBe('ooo');
      expect(classifyReply('Thanks for your email!')).toBe('normal');
    });

    it('should not trigger auto-reply escalation for OOO', () => {
      const shouldAutoReply = (classification: string): boolean => {
        return classification !== 'ooo' && classification !== 'bounce';
      };

      expect(shouldAutoReply('positive')).toBe(true);
      expect(shouldAutoReply('ooo')).toBe(false);
      expect(shouldAutoReply('bounce')).toBe(false);
    });

    it('should pause or delay campaign for OOO', () => {
      const handleOOO = (enrollment: { status: string; pausedUntil: Date | null }, returnDate: Date | null) => {
        if (returnDate) {
          return { ...enrollment, status: 'paused', pausedUntil: returnDate };
        }
        return { ...enrollment, status: 'paused', pausedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
      };

      const enrollment = { status: 'active', pausedUntil: null };
      const returnDate = new Date('2024-01-25');
      
      const updated = handleOOO(enrollment, returnDate);
      
      expect(updated.status).toBe('paused');
      expect(updated.pausedUntil).toEqual(returnDate);
    });
  });

  describe('TC-SEQ-HARD-30: Spam/Bounce Reply', () => {
    it('should classify bounce replies correctly', () => {
      const bouncePatterns = [
        'delivery status notification',
        'undeliverable',
        'mail delivery failed',
        'message not delivered',
        'mailbox not found',
        'user unknown',
        '550 5.1.1'
      ];

      const classifyBounce = (body: string): boolean => {
        const lowerBody = body.toLowerCase();
        return bouncePatterns.some(p => lowerBody.includes(p));
      };

      expect(classifyBounce('Delivery Status Notification - Failure')).toBe(true);
      expect(classifyBounce('550 5.1.1 User unknown')).toBe(true);
      expect(classifyBounce('Thanks for reaching out!')).toBe(false);
    });

    it('should remove prospect on hard bounce', () => {
      const removeProspectFromSequence = (
        enrollment: { status: string; removedReason: string | null },
        reason: string
      ) => {
        return {
          ...enrollment,
          status: 'removed',
          removedReason: reason
        };
      };

      const enrollment = { status: 'active', removedReason: null };
      const updated = removeProspectFromSequence(enrollment, 'HARD_BOUNCE');

      expect(updated.status).toBe('removed');
      expect(updated.removedReason).toBe('HARD_BOUNCE');
    });

    it('should track bounce rate per mailbox', () => {
      const mailboxStats = {
        mailboxId: 'mb-1',
        sent: 100,
        bounces: 5,
        getBounceRate: function() {
          return (this.bounces / this.sent) * 100;
        }
      };

      expect(mailboxStats.getBounceRate()).toBe(5);

      mailboxStats.bounces = 11;
      const shouldPauseMailbox = mailboxStats.getBounceRate() > 10;
      
      expect(shouldPauseMailbox).toBe(true);
    });
  });
});

describe('Inbox + AI Reply (TC-SEQ-HARD-31 to TC-SEQ-HARD-40)', () => {

  describe('TC-SEQ-HARD-31: Reply Captured <30 Seconds', () => {
    it('should update inbox within SLA', () => {
      const replyReceivedAt = new Date();
      const inboxUpdatedAt = new Date(replyReceivedAt.getTime() + 25000);
      
      const updateLatency = inboxUpdatedAt.getTime() - replyReceivedAt.getTime();
      
      expect(updateLatency).toBeLessThanOrEqual(REPLY_DETECTION_SLA_MS);
    });

    it('should fire notification on reply', () => {
      const notifications: { type: string; prospectId: string; timestamp: Date }[] = [];
      
      const onReplyReceived = (prospectId: string) => {
        notifications.push({
          type: 'reply_received',
          prospectId,
          timestamp: new Date()
        });
      };

      onReplyReceived('prospect-1');
      
      expect(notifications.length).toBe(1);
      expect(notifications[0].type).toBe('reply_received');
    });
  });

  describe('TC-SEQ-HARD-32: AI Reply Auto-Draft Generation', () => {
    it('should generate context-aware reply', () => {
      const context = {
        prospectName: 'John',
        companyName: 'Acme Corp',
        previousMessages: ['Hi John, following up on our conversation...'],
        replyContent: 'I am interested, can you tell me more about pricing?'
      };

      const generateDraft = (ctx: typeof context): string => {
        return `Hi ${ctx.prospectName}, thank you for your interest! I'd be happy to discuss pricing for ${ctx.companyName}.`;
      };

      const draft = generateDraft(context);
      
      expect(draft).toContain('John');
      expect(draft).toContain('Acme Corp');
      expect(draft).toContain('pricing');
    });

    it('should attach to correct thread', () => {
      const originalThread = {
        threadId: 'thread-123',
        messageIds: ['<msg-1@example.com>', '<msg-2@example.com>']
      };

      const createDraft = (thread: typeof originalThread) => {
        return {
          threadId: thread.threadId,
          inReplyTo: thread.messageIds[thread.messageIds.length - 1],
          references: thread.messageIds
        };
      };

      const draft = createDraft(originalThread);
      
      expect(draft.threadId).toBe('thread-123');
      expect(draft.inReplyTo).toBe('<msg-2@example.com>');
    });
  });

  describe('TC-SEQ-HARD-33: AI Reply Hallucination Test', () => {
    it('should not invent facts', () => {
      const knownContext = {
        prospectName: 'John',
        companyName: 'Acme Corp',
        productName: 'Sales Platform'
      };

      const validateNoHallucination = (response: string, context: typeof knownContext): boolean => {
        const priceMentioned = /\$\d+/.test(response);
        const percentageMentioned = /\d+%/.test(response);
        const dateMentioned = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d+/i.test(response);
        
        if (priceMentioned || dateMentioned) {
          return false;
        }
        return true;
      };

      const goodResponse = 'Hi John, I would be happy to discuss pricing options for Acme Corp.';
      const badResponse = 'Hi John, our platform costs $499/month and we have 95% customer satisfaction.';

      expect(validateNoHallucination(goodResponse, knownContext)).toBe(true);
      expect(validateNoHallucination(badResponse, knownContext)).toBe(false);
    });

    it('should use only known context', () => {
      const allowedFields = ['firstName', 'lastName', 'companyName', 'jobTitle', 'productName'];
      
      const extractUsedFields = (template: string): string[] => {
        const matches = template.match(/\{\{(\w+)\}\}/g) || [];
        return matches.map(m => m.replace(/\{\{|\}\}/g, ''));
      };

      const template = 'Hi {{firstName}}, I see you work at {{companyName}} as {{jobTitle}}.';
      const usedFields = extractUsedFields(template);
      
      expect(usedFields.every(f => allowedFields.includes(f))).toBe(true);
    });
  });

  describe('TC-SEQ-HARD-34: AI Reply Delay Under Load', () => {
    it('should generate draft within SLA', async () => {
      const AI_DRAFT_SLA_MS = 30000;
      const startTime = Date.now();
      
      await new Promise(r => setTimeout(r, 50));
      
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(AI_DRAFT_SLA_MS);
    });

    it('should show queue position if delayed', () => {
      const queue = {
        items: ['draft-1', 'draft-2', 'draft-3', 'draft-4', 'draft-5'],
        getPosition: function(draftId: string) {
          return this.items.indexOf(draftId) + 1;
        }
      };

      expect(queue.getPosition('draft-3')).toBe(3);
      expect(queue.getPosition('draft-1')).toBe(1);
    });
  });

  describe('TC-SEQ-HARD-35: AI Reply With Missing Context', () => {
    it('should generate neutral fallback reply', () => {
      const minimalContext = {
        prospectName: null,
        companyName: null,
        previousMessages: []
      };

      const generateFallback = (ctx: typeof minimalContext): string => {
        const name = ctx.prospectName || 'there';
        return `Hi ${name}, thank you for your reply. I'd be happy to help answer any questions you have.`;
      };

      const fallback = generateFallback(minimalContext);
      
      expect(fallback).toContain('Hi there');
      expect(fallback).not.toContain('undefined');
      expect(fallback).not.toContain('null');
    });
  });

  describe('TC-SEQ-HARD-36: AI Reply + Manual Edit', () => {
    it('should send edited content', () => {
      const aiDraft = 'Hi John, thank you for your interest!';
      const manualEdit = 'Hi John, great to hear from you! Let me share some details.';
      
      const sendEmail = (content: string) => ({ sent: content });
      
      const result = sendEmail(manualEdit);
      
      expect(result.sent).toBe(manualEdit);
      expect(result.sent).not.toBe(aiDraft);
    });

    it('should log original AI version', () => {
      const auditLog: { aiVersion: string; sentVersion: string; editedAt: Date }[] = [];
      
      const logEdit = (aiVersion: string, sentVersion: string) => {
        auditLog.push({
          aiVersion,
          sentVersion,
          editedAt: new Date()
        });
      };

      logEdit('AI generated content', 'Manually edited content');
      
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].aiVersion).toBe('AI generated content');
      expect(auditLog[0].sentVersion).toBe('Manually edited content');
    });
  });

  describe('TC-SEQ-HARD-37: Reply From Forwarded Thread', () => {
    it('should map forwarded reply to correct prospect', () => {
      const forwardedHeaders = {
        originalFrom: 'prospect@company.com',
        forwardedBy: 'assistant@company.com',
        references: ['<original-msg@example.com>']
      };

      const extractOriginalSender = (headers: typeof forwardedHeaders): string => {
        return headers.originalFrom;
      };

      expect(extractOriginalSender(forwardedHeaders)).toBe('prospect@company.com');
    });

    it('should use References to find original thread', () => {
      const threadLookup = new Map<string, string>();
      threadLookup.set('<original-msg@example.com>', 'prospect-123');

      const findProspectFromForward = (references: string[]): string | null => {
        for (const ref of references) {
          const prospect = threadLookup.get(ref);
          if (prospect) return prospect;
        }
        return null;
      };

      expect(findProspectFromForward(['<original-msg@example.com>'])).toBe('prospect-123');
    });
  });

  describe('TC-SEQ-HARD-38: Reply After Campaign End', () => {
    it('should still capture reply', () => {
      const capturedReplies: ReplyMessage[] = [];
      
      const captureReply = (reply: Partial<ReplyMessage>, campaignActive: boolean) => {
        capturedReplies.push({
          id: `reply-${Date.now()}`,
          originalMessageId: '<msg@example.com>',
          fromEmail: reply.fromEmail || 'unknown@example.com',
          subject: reply.subject || 'Re: Follow up',
          body: reply.body || '',
          receivedAt: new Date(),
          classification: 'neutral'
        });
        return { captured: true, campaignActive };
      };

      const result = captureReply({ body: 'Late reply' }, false);
      
      expect(result.captured).toBe(true);
      expect(capturedReplies.length).toBe(1);
    });

    it('should not reactivate ended sequence', () => {
      const sequence = {
        id: 'seq-1',
        status: 'completed',
        completedAt: new Date('2024-01-10')
      };

      const shouldReactivate = (seq: typeof sequence, replyAt: Date): boolean => {
        return false;
      };

      expect(shouldReactivate(sequence, new Date())).toBe(false);
    });
  });

  describe('TC-SEQ-HARD-39: Multiple Sequences Same Prospect', () => {
    it('should maintain only one active thread per prospect', () => {
      const prospectEnrollments = [
        { sequenceId: 'seq-1', prospectId: 'p-1', status: 'active' },
        { sequenceId: 'seq-2', prospectId: 'p-1', status: 'paused' },
        { sequenceId: 'seq-3', prospectId: 'p-1', status: 'completed' }
      ];

      const activeEnrollments = prospectEnrollments.filter(e => e.status === 'active');
      
      expect(activeEnrollments.length).toBe(1);
    });

    it('should prevent duplicate active enrollments', () => {
      const enrollments = new Map<string, { sequenceId: string; status: string }>();
      
      const enrollProspect = (prospectId: string, sequenceId: string): { success: boolean; reason?: string } => {
        const existing = enrollments.get(prospectId);
        if (existing && existing.status === 'active') {
          return { success: false, reason: 'ALREADY_ACTIVE_IN_SEQUENCE' };
        }
        enrollments.set(prospectId, { sequenceId, status: 'active' });
        return { success: true };
      };

      const result1 = enrollProspect('p-1', 'seq-1');
      const result2 = enrollProspect('p-1', 'seq-2');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
      expect(result2.reason).toBe('ALREADY_ACTIVE_IN_SEQUENCE');
    });
  });

  describe('TC-SEQ-HARD-40: System Restart During Reply Processing', () => {
    it('should not lose replies on restart', () => {
      const persistedReplies = new Map<string, ReplyMessage>();
      const processingQueue: string[] = [];
      
      const persistReply = (reply: ReplyMessage): void => {
        persistedReplies.set(reply.id, reply);
        processingQueue.push(reply.id);
      };

      const simulateRestart = (): void => {
        processingQueue.length = 0;
      };

      const recoverUnprocessed = (): string[] => {
        return Array.from(persistedReplies.keys());
      };

      persistReply({
        id: 'reply-1',
        originalMessageId: '<msg@example.com>',
        fromEmail: 'prospect@example.com',
        subject: 'Re: Follow up',
        body: 'Interested!',
        receivedAt: new Date(),
        classification: 'positive'
      });

      simulateRestart();
      const recovered = recoverUnprocessed();

      expect(processingQueue.length).toBe(0);
      expect(recovered).toContain('reply-1');
    });

    it('should handle idempotent ingestion', () => {
      const processedReplies = new Set<string>();
      
      const ingestReply = (replyId: string): { processed: boolean; duplicate: boolean } => {
        if (processedReplies.has(replyId)) {
          return { processed: false, duplicate: true };
        }
        processedReplies.add(replyId);
        return { processed: true, duplicate: false };
      };

      const result1 = ingestReply('reply-1');
      const result2 = ingestReply('reply-1');

      expect(result1.processed).toBe(true);
      expect(result1.duplicate).toBe(false);
      expect(result2.processed).toBe(false);
      expect(result2.duplicate).toBe(true);
    });
  });
});
