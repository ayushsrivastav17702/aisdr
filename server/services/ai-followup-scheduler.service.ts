import OpenAI from "openai";
import { storage } from "../storage";
import { generateFollowUp } from "./ai-email-generator.service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface FollowUpConfig {
  sequenceId: string;
  prospectId: string;
  stepId: string;
  daysBetween: number;
  maxFollowUps: number;
  followUpType: 'gentle_reminder' | 'value_add' | 'breakup' | 'social_proof';
  triggerCondition: 'no_response' | 'no_open' | 'opened_no_click' | 'time_based';
}

export interface FollowUpEmail {
  subject: string;
  body: string;
  followUpNumber: number;
  reasoning: string;
  scheduledFor: Date;
}

export class AIFollowUpScheduler {
  private static instance: AIFollowUpScheduler;
  private scheduledFollowUps: Map<string, FollowUpConfig[]> = new Map();

  public static getInstance(): AIFollowUpScheduler {
    if (!AIFollowUpScheduler.instance) {
      AIFollowUpScheduler.instance = new AIFollowUpScheduler();
    }
    return AIFollowUpScheduler.instance;
  }

  async scheduleFollowUp(config: FollowUpConfig): Promise<string> {
    try {
      const followUpId = `followup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const key = `${config.sequenceId}_${config.prospectId}`;
      
      const existingFollowUps = this.scheduledFollowUps.get(key) || [];
      existingFollowUps.push(config);
      this.scheduledFollowUps.set(key, existingFollowUps);

      console.log(`📅 ${config.followUpType} follow-up scheduled for prospect ${config.prospectId} in ${config.daysBetween} days`);
      
      return followUpId;
    } catch (error) {
      console.error('❌ Failed to schedule follow-up:', error);
      throw error;
    }
  }

  async generateFollowUpEmailPreview(
    prospectId: string,
    emailHistory: string | string[],
    followUpType: string,
    followUpNumber: number,
    originalSubject?: string // NEW: Accept original subject for proper threading
  ): Promise<FollowUpEmail> {
    try {
      const prospect = await storage.getProspect(prospectId);
      if (!prospect) {
        throw new Error(`Prospect ${prospectId} not found`);
      }

      // Handle both string and array inputs
      // Note: Strings should no longer be split - they come as single entries from the API
      const emailHistoryArray = Array.isArray(emailHistory) 
        ? emailHistory 
        : (typeof emailHistory === 'string' && emailHistory.trim() ? [emailHistory.trim()] : []);
      
      const result = await generateFollowUp(prospectId, emailHistoryArray, followUpNumber);

      const scheduledFor = new Date();
      scheduledFor.setDate(scheduledFor.getDate() + 3);

      // CRITICAL: Use original subject for proper email threading
      // Email clients thread based on "Re: [original subject]", not AI-generated subjects
      let threadedSubject = result.subject;
      if (originalSubject) {
        // Strip any existing "Re: " prefix and add it properly
        const baseSubject = originalSubject.replace(/^Re:\s*/i, '').trim();
        threadedSubject = `Re: ${baseSubject}`;
        console.log(`🔗 Threading reply with subject: "${threadedSubject}"`);
      }

      return {
        subject: threadedSubject,
        body: result.body,
        followUpNumber,
        reasoning: result.reasoning,
        scheduledFor
      };
    } catch (error) {
      console.error('❌ Error generating follow-up preview:', error);
      throw error;
    }
  }

  async buildFollowUpPrompt(
    prospectId: string,
    previousEmails: string,
    followUpType: string,
    followUpNumber: number
  ): Promise<string> {
    const prospect = await storage.getProspect(prospectId);
    if (!prospect) {
      throw new Error(`Prospect ${prospectId} not found`);
    }

    const typeDescriptions = {
      'gentle_reminder': 'gentle reminder that adds value without being pushy',
      'value_add': 'value-added follow-up with helpful insights or resources',
      'breakup': 'professional breakup email that leaves the door open',
      'social_proof': 'follow-up that includes social proof or case studies'
    };

    const typeDescription = typeDescriptions[followUpType as keyof typeof typeDescriptions] || 'professional follow-up';

    return `Generate a ${typeDescription} for this prospect:

PROSPECT:
- Name: ${prospect.firstName || ""} ${prospect.lastName || ""}
- Title: ${prospect.jobTitle || "Unknown"}
- Company: ${prospect.companyName || "Unknown"}

FOLLOW-UP NUMBER: ${followUpNumber}

PREVIOUS EMAILS:
${previousEmails || "No previous emails"}

TYPE: ${followUpType}

Requirements:
1. Write a compelling subject line
2. Keep email body brief and valuable
3. Match the ${followUpType} style
4. Include clear next step
5. Professional tone throughout

Respond in JSON format:
{
  "subject": "Follow-up subject line",
  "content": "Complete email body",
  "reasoning": "Why this approach works"
}`;
  }
}

export const aiFollowUpScheduler = AIFollowUpScheduler.getInstance();
