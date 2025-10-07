import OpenAI from 'openai';
import { storage } from '../storage';
import type { Prospect } from '@shared/schema';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface EnhancedPersonalizationRequest {
  prospectId: string;
  includeLinkedInData?: boolean;
  customPrompt?: string;
  emailSettings?: {
    tone?: 'professional' | 'casual' | 'urgent' | 'friendly';
    focus?: 'value_proposition' | 'pain_points' | 'roi' | 'relationship';
    length?: 'short' | 'medium' | 'long';
  };
}

export interface EnhancedPersonalizationResult {
  subject: string;
  content: string;
  personalizationScore: number;
  personalizationFactors: string[];
  reasoning: string;
  keyInsights: string[];
  followUpRecommendation: string;
}

export async function generateEnhancedPersonalizedEmail(
  request: EnhancedPersonalizationRequest
): Promise<EnhancedPersonalizationResult> {
  try {
    const prospect = await storage.getProspect(request.prospectId);
    if (!prospect) {
      throw new Error(`Prospect with ID ${request.prospectId} not found`);
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn("OpenAI API key not configured, using fallback");
      return generateFallbackPersonalization(prospect);
    }

    const enrichedContext = buildEnrichedContext(prospect, request);
    const emailPrompt = buildEmailPrompt(prospect, enrichedContext, request);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert sales email writer who creates highly personalized, compelling outreach emails. Focus on relevance, value delivery, and authentic personalization that resonates with the prospect's specific role and challenges."
        },
        {
          role: "user",
          content: emailPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const emailData = JSON.parse(response.choices[0].message.content || '{}');

    return {
      subject: emailData.subject || `Quick question about ${prospect.jobTitle} priorities`,
      content: emailData.content || generateFallbackEmailBody(prospect),
      personalizationScore: emailData.personalizationScore || 75,
      personalizationFactors: emailData.personalizationFactors || [
        "Prospect name and title",
        "Company information",
        "Role-specific challenges"
      ],
      reasoning: emailData.reasoning || "AI-generated personalized email",
      keyInsights: emailData.keyInsights || ["Professional context"],
      followUpRecommendation: emailData.followUpRecommendation || "Follow up in 3-5 days if no response"
    };

  } catch (error) {
    console.error('Enhanced personalization failed:', error);
    const prospect = await storage.getProspect(request.prospectId);
    if (prospect) {
      return generateFallbackPersonalization(prospect);
    }
    throw error;
  }
}

function buildEnrichedContext(prospect: Prospect, request: EnhancedPersonalizationRequest): string {
  const parts: string[] = [];
  
  parts.push(`PROSPECT INFORMATION:
- Name: ${prospect.firstName || ""} ${prospect.lastName || ""}
- Title: ${prospect.jobTitle || "Unknown"}
- Company: ${prospect.companyName || "Unknown"}
- Industry: ${prospect.companyIndustry || "Unknown"}
- Company Size: ${prospect.companySize || "Unknown"}
- Location: ${prospect.contactLocation || "Unknown"}`);

  if (prospect.linkedinUrl && request.includeLinkedInData) {
    parts.push(`\nLINKEDIN PROFILE: ${prospect.linkedinUrl}`);
  }

  if (prospect.enrichmentData) {
    parts.push(`\nENRICHMENT DATA AVAILABLE: Yes`);
  }

  return parts.join('\n');
}

function buildEmailPrompt(
  prospect: Prospect,
  enrichedContext: string,
  request: EnhancedPersonalizationRequest
): string {
  const settings = request.emailSettings || {};
  const tone = settings.tone || 'professional';
  const focus = settings.focus || 'value_proposition';
  const length = settings.length || 'medium';

  return `Generate a highly personalized sales email using the following context:

${enrichedContext}

EMAIL SETTINGS:
- Tone: ${tone}
- Focus: ${focus}
- Length: ${length}

${request.customPrompt ? `CUSTOM REQUIREMENTS: ${request.customPrompt}` : ''}

REQUIREMENTS:
1. Write a compelling subject line personalized to their role/industry
2. Open with a relevant insight or observation
3. Connect their specific challenges to our solution value
4. Include personalization factors naturally throughout
5. Use the recommended tone and approach
6. End with a relevant call-to-action
7. Keep under 150 words for medium length
8. Include professional signature

Respond in JSON format:
{
  "subject": "Personalized subject line",
  "content": "Complete email content with signature",
  "personalizationScore": 85,
  "personalizationFactors": ["factor1", "factor2", "factor3"],
  "reasoning": "Explanation of personalization approach used",
  "keyInsights": ["insight1", "insight2"],
  "followUpRecommendation": "Next step recommendation"
}`;
}

function generateFallbackPersonalization(prospect: Prospect): EnhancedPersonalizationResult {
  const name = prospect.firstName || 'there';
  const company = prospect.companyName || 'your company';
  
  return {
    subject: `Quick question about ${company}`,
    content: generateFallbackEmailBody(prospect),
    personalizationScore: 50,
    personalizationFactors: ["Prospect name", "Company name"],
    reasoning: "Generated using fallback template (AI unavailable)",
    keyInsights: ["Basic prospect information"],
    followUpRecommendation: "Follow up in 3 days if no response"
  };
}

function generateFallbackEmailBody(prospect: Prospect): string {
  const name = prospect.firstName || 'there';
  const company = prospect.companyName || 'your company';
  
  return `Hi ${name},

I noticed ${company} and thought you might be interested in how we help companies streamline their operations and drive growth.

Would you be open to a quick 15-minute call to discuss how we could help?

Best regards,
Your Name
Company Name`;
}

export async function analyzeEmailResponse(
  originalEmail: string,
  prospectResponse: string,
  prospectId: string
): Promise<{
  sentiment: 'positive' | 'negative' | 'neutral';
  intent: string;
  confidence: number;
  nextSteps: string[];
  reasoning: string;
}> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        sentiment: 'neutral',
        intent: 'unknown',
        confidence: 0,
        nextSteps: ['Manual review required'],
        reasoning: 'AI analysis unavailable'
      };
    }

    const prompt = `Analyze this email response from a sales prospect:

ORIGINAL EMAIL SENT:
${originalEmail}

PROSPECT RESPONSE:
${prospectResponse}

Analyze for sentiment, intent, and provide next steps. Respond in JSON:
{
  "sentiment": "positive|negative|neutral",
  "intent": "interested|not_interested|needs_more_info|pricing_request|meeting_request|out_of_office",
  "confidence": 85,
  "nextSteps": ["action 1", "action 2"],
  "reasoning": "Analysis explanation"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing sales email responses and providing actionable insights."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result;

  } catch (error) {
    console.error('Response analysis failed:', error);
    return {
      sentiment: 'neutral',
      intent: 'unknown',
      confidence: 0,
      nextSteps: ['Review manually'],
      reasoning: 'Analysis failed'
    };
  }
}
