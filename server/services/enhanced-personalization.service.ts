import OpenAI from 'openai';
import { storage, RequestContext } from '../storage';
import type { Prospect } from '@shared/schema';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface EnhancedPersonalizationRequest {
  prospectId: string;
  organizationId: string;
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
  personalizationSource: 'ai' | 'fallback';
}

export async function generateEnhancedPersonalizedEmail(
  request: EnhancedPersonalizationRequest
): Promise<EnhancedPersonalizationResult> {
  const ctx: RequestContext = { organizationId: request.organizationId };
  
  // FAULT TOLERANCE: Cache prospect BEFORE try block so fallback never needs to re-query
  // This ensures we can always generate fallback even if storage becomes unavailable
  let cachedProspect: Prospect | undefined;
  
  try {
    cachedProspect = await storage.getProspect(ctx, request.prospectId);
  } catch (fetchError) {
    console.error('⚠️ Failed to fetch prospect, returning minimal template:', fetchError);
    // Storage unavailable - return minimal template immediately
    return getMinimalSafeTemplate();
  }
  
  if (!cachedProspect) {
    console.warn(`⚠️ Prospect ${request.prospectId} not found, returning minimal template`);
    return getMinimalSafeTemplate();
  }
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("⚠️ OpenAI API key not configured, using fallback personalization");
      return generateFallbackPersonalization(cachedProspect);
    }

    // Fetch content from content library (non-critical - proceed even if fails)
    let contentLibraryItems: any[] = [];
    try {
      contentLibraryItems = await storage.getContentLibraryItems(ctx);
      console.log(`Fetched ${contentLibraryItems.length} content items from library`);
    } catch (contentError) {
      console.warn('⚠️ Failed to fetch content library, proceeding without it:', contentError);
    }

    const enrichedContext = buildEnrichedContext(cachedProspect, request, contentLibraryItems);
    const emailPrompt = buildEmailPrompt(cachedProspect, enrichedContext, request);

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

    console.log(`✅ AI personalization successful for prospect ${request.prospectId}`);
    return {
      subject: emailData.subject || `Quick question about ${cachedProspect.jobTitle} priorities`,
      content: emailData.content || generateFallbackEmailBody(cachedProspect),
      personalizationScore: emailData.personalizationScore || 75,
      personalizationFactors: emailData.personalizationFactors || [
        "Prospect name and title",
        "Company information",
        "Role-specific challenges"
      ],
      reasoning: emailData.reasoning || "AI-generated personalized email",
      keyInsights: emailData.keyInsights || ["Professional context"],
      followUpRecommendation: emailData.followUpRecommendation || "Follow up in 3-5 days if no response",
      personalizationSource: 'ai' as const
    };

  } catch (error) {
    console.error('⚠️ Enhanced personalization failed, using fallback:', error);
    // Use cached prospect - no need to re-query storage
    return generateFallbackPersonalization(cachedProspect);
  }
}

function getMinimalSafeTemplate(): EnhancedPersonalizationResult {
  return {
    subject: 'Quick question',
    content: `Hi,\n\nI wanted to reach out and share how we help companies like yours drive growth and efficiency.\n\nWould you be open to a brief call to discuss?\n\nBest regards`,
    personalizationScore: 20,
    personalizationFactors: [],
    reasoning: 'Minimal template - prospect not available',
    keyInsights: [],
    followUpRecommendation: 'Follow up in 3 days',
    personalizationSource: 'fallback' as const
  };
}

function buildEnrichedContext(
  prospect: Prospect, 
  request: EnhancedPersonalizationRequest,
  contentLibraryItems: any[]
): string {
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

  // Add relevant content from content library
  if (contentLibraryItems && contentLibraryItems.length > 0) {
    const relevantContent = filterRelevantContent(contentLibraryItems, prospect);
    if (relevantContent.length > 0) {
      parts.push(`\n\nCONTENT LIBRARY RESOURCES (use these to enhance personalization):`);
      relevantContent.forEach((item, index) => {
        parts.push(`\n${index + 1}. ${item.title} (${item.type})`);
        if (item.description) {
          parts.push(`   Description: ${item.description}`);
        }
        parts.push(`   Content: ${item.content.substring(0, 300)}${item.content.length > 300 ? '...' : ''}`);
        if (item.industry) {
          parts.push(`   Industry Focus: ${item.industry}`);
        }
        if (item.useCase) {
          parts.push(`   Use Case: ${item.useCase}`);
        }
      });
    }
  }

  return parts.join('\n');
}

function filterRelevantContent(contentItems: any[], prospect: Prospect): any[] {
  // Filter content by industry match or general content
  return contentItems.filter(item => {
    // Include if no specific industry filter
    if (!item.industry) return true;
    
    // Match industry if prospect has industry info
    if (prospect.companyIndustry && item.industry) {
      return item.industry.toLowerCase().includes(prospect.companyIndustry.toLowerCase()) ||
             prospect.companyIndustry.toLowerCase().includes(item.industry.toLowerCase());
    }
    
    return true;
  }).slice(0, 5); // Limit to 5 most relevant items
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
3. **USE content from the Content Library Resources above to enhance the email** (if provided)
4. Connect their specific challenges to our solution value
5. Include personalization factors naturally throughout
6. Use the recommended tone and approach
7. End with a relevant call-to-action
8. Keep under 150 words for medium length
9. Include professional signature

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
  
  console.log(`📝 Using fallback personalization for ${prospect.firstName} at ${company}`);
  
  return {
    subject: `Quick question about ${company}`,
    content: generateFallbackEmailBody(prospect),
    personalizationScore: 50,
    personalizationFactors: ["Prospect name", "Company name"],
    reasoning: "Generated using fallback template (AI unavailable)",
    keyInsights: ["Basic prospect information"],
    followUpRecommendation: "Follow up in 3 days if no response",
    personalizationSource: 'fallback' as const
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
