import { db } from '../db';
import { emailReplies, emails, sequenceProspects, type EmailReply } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { aiService } from './ai.service';
import { aiTrackingService } from './ai-tracking.service';

export type Sentiment = 'positive' | 'negative' | 'neutral' | 'unsubscribe';
export type Intent = 'interested' | 'meeting_request' | 'not_now' | 'question' | 'objection' | 'unsubscribe' | 'ooo' | 'bounce';

export interface ClassificationResult {
  sentiment: Sentiment;
  intent: Intent;
  extractedInfo: {
    preferredTime?: string;
    questions?: string[];
    objections?: string[];
    returnDate?: string;
  };
  aiSummary: string;
  nextAction: string;
  confidence: number;
}

export interface ProcessedReply {
  reply: EmailReply;
  classification: ClassificationResult;
}

class ReplyClassificationService {
  async classifyReply(replyContent: string, originalSubject: string, userId: string): Promise<ClassificationResult> {
    const startTime = Date.now();
    
    const prompt = `Analyze this email reply and provide a structured classification.

Original Subject: ${originalSubject}

Reply Content:
${replyContent}

Respond in JSON format with these exact fields:
{
  "sentiment": "positive" | "negative" | "neutral" | "unsubscribe",
  "intent": "interested" | "meeting_request" | "not_now" | "question" | "objection" | "unsubscribe" | "ooo" | "bounce",
  "extractedInfo": {
    "preferredTime": "string or null - any meeting time preferences mentioned",
    "questions": ["array of questions asked"],
    "objections": ["array of objections raised"],
    "returnDate": "string or null - OOO return date if applicable"
  },
  "aiSummary": "Brief 1-2 sentence summary of the reply",
  "nextAction": "Recommended next action for the sales rep",
  "confidence": 0.0-1.0
}

Classification guidelines:
- "interested": Positive response, wants to learn more or continue conversation
- "meeting_request": Explicitly requests or agrees to a meeting/call
- "not_now": Timing is bad but may be interested later
- "question": Asks for more information before deciding
- "objection": Raises concerns or pushback
- "unsubscribe": Requests to stop receiving emails
- "ooo": Out of office auto-reply
- "bounce": Email delivery failure notification`;

    try {
      const response = await aiService.generateText(prompt, 500);
      const latencyMs = Date.now() - startTime;
      
      await aiTrackingService.trackGeneration({
        userId,
        generationType: 'reply_classification',
        prompt: prompt.substring(0, 500),
        response: response.substring(0, 500),
        model: 'gpt-4o-mini',
        provider: 'openai',
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: Math.ceil(response.length / 4),
        latencyMs,
        success: true,
        metadata: { originalSubject },
      });

      const parsed = JSON.parse(this.extractJson(response));
      return {
        sentiment: parsed.sentiment || 'neutral',
        intent: parsed.intent || 'question',
        extractedInfo: parsed.extractedInfo || {},
        aiSummary: parsed.aiSummary || '',
        nextAction: parsed.nextAction || 'Review and respond manually',
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      console.error('Error classifying reply:', error);
      return this.getFallbackClassification(replyContent);
    }
  }

  async processReply(replyId: string, userId: string): Promise<ProcessedReply | null> {
    // Verify ownership by joining through emails table with userId check
    const [replyData] = await db
      .select({
        reply: emailReplies,
        originalSubject: emails.subject,
      })
      .from(emailReplies)
      .innerJoin(emails, eq(emailReplies.emailId, emails.id))
      .where(and(
        eq(emailReplies.id, replyId),
        eq(emails.userId, userId)
      ))
      .limit(1);

    // Return null if reply doesn't exist OR doesn't belong to this user
    if (!replyData) return null;

    const reply = replyData.reply;
    const originalSubject = replyData.originalSubject || '';

    const classification = await this.classifyReply(reply.replyContent, originalSubject, userId);

    const [updatedReply] = await db.update(emailReplies)
      .set({
        sentiment: classification.sentiment,
        intent: classification.intent,
        extractedInfo: classification.extractedInfo,
        aiSummary: classification.aiSummary,
        nextAction: classification.nextAction,
        oooReturnDate: classification.extractedInfo.returnDate 
          ? new Date(classification.extractedInfo.returnDate) 
          : null,
        processed: true,
      })
      .where(eq(emailReplies.id, replyId))
      .returning();

    if (classification.intent === 'unsubscribe' && reply.sequenceId) {
      await this.handleUnsubscribe(reply.prospectId, reply.sequenceId);
    }

    if (classification.sentiment === 'positive' && reply.sequenceId) {
      await this.pauseSequenceForProspect(reply.prospectId, reply.sequenceId);
    }

    return { reply: updatedReply, classification };
  }

  async processUnclassifiedReplies(userId: string, limit = 50): Promise<ProcessedReply[]> {
    const unprocessed = await db.select()
      .from(emailReplies)
      .where(eq(emailReplies.processed, false))
      .limit(limit);

    const results: ProcessedReply[] = [];
    for (const reply of unprocessed) {
      const result = await this.processReply(reply.id, userId);
      if (result) results.push(result);
    }
    return results;
  }

  private async handleUnsubscribe(prospectId: string, sequenceId: string): Promise<void> {
    await db.update(sequenceProspects)
      .set({ status: 'unsubscribed' })
      .where(and(
        eq(sequenceProspects.prospectId, prospectId),
        eq(sequenceProspects.sequenceId, sequenceId)
      ));
  }

  private async pauseSequenceForProspect(prospectId: string, sequenceId: string): Promise<void> {
    await db.update(sequenceProspects)
      .set({ status: 'replied' })
      .where(and(
        eq(sequenceProspects.prospectId, prospectId),
        eq(sequenceProspects.sequenceId, sequenceId)
      ));
  }

  private extractJson(text: string): string {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : '{}';
  }

  private getFallbackClassification(content: string): ClassificationResult {
    const lowered = content.toLowerCase();
    
    if (lowered.includes('unsubscribe') || lowered.includes('remove me') || lowered.includes('stop emailing')) {
      return {
        sentiment: 'unsubscribe',
        intent: 'unsubscribe',
        extractedInfo: {},
        aiSummary: 'User requested to unsubscribe',
        nextAction: 'Remove from sequence immediately',
        confidence: 0.9,
      };
    }

    if (lowered.includes('out of office') || lowered.includes('automatic reply') || lowered.includes('away from')) {
      return {
        sentiment: 'neutral',
        intent: 'ooo',
        extractedInfo: {},
        aiSummary: 'Out of office auto-reply detected',
        nextAction: 'Reschedule follow-up based on return date',
        confidence: 0.8,
      };
    }

    if (lowered.includes('meeting') || lowered.includes('call') || lowered.includes('schedule') || lowered.includes('demo')) {
      return {
        sentiment: 'positive',
        intent: 'meeting_request',
        extractedInfo: {},
        aiSummary: 'Prospect interested in scheduling a meeting',
        nextAction: 'Follow up to confirm meeting time',
        confidence: 0.7,
      };
    }

    if (lowered.includes('interested') || lowered.includes('tell me more') || lowered.includes('sounds good')) {
      return {
        sentiment: 'positive',
        intent: 'interested',
        extractedInfo: {},
        aiSummary: 'Prospect expressed interest',
        nextAction: 'Send more information and propose next steps',
        confidence: 0.7,
      };
    }

    return {
      sentiment: 'neutral',
      intent: 'question',
      extractedInfo: {},
      aiSummary: 'Reply requires manual review',
      nextAction: 'Review and respond appropriately',
      confidence: 0.3,
    };
  }

  async getClassificationStats(userId: string): Promise<Record<string, number>> {
    const replies = await db.select({
      intent: emailReplies.intent,
      sentiment: emailReplies.sentiment,
    })
      .from(emailReplies)
      .innerJoin(emails, eq(emailReplies.emailId, emails.id))
      .where(and(
        eq(emails.userId, userId),
        eq(emailReplies.processed, true)
      ));

    const stats: Record<string, number> = {};
    for (const reply of replies) {
      const key = `${reply.sentiment}_${reply.intent}`;
      stats[key] = (stats[key] || 0) + 1;
    }
    return stats;
  }
}

export const replyClassificationService = new ReplyClassificationService();
