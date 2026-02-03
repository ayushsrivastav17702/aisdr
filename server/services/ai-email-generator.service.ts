import { openaiHelper } from "./openai-helper";
import { storage, type RequestContext } from "../storage";
import type { Prospect, ContentLibraryItem } from "@shared/schema";
import { 
  getPromptTemplate, 
  interpolatePrompt, 
  EMAIL_TYPES,
  getTemplateForContext,
  AI_DECISION_ENGINE_RULES,
  EMAIL_TEMPLATE_LIBRARY,
  type PromptContext,
  type EmailType 
} from "./ai-prompt-templates";

// Filter content library items by industry relevance
function filterContentByIndustry(contentItems: ContentLibraryItem[], prospect: Prospect): ContentLibraryItem[] {
  return contentItems.filter(item => {
    // Include if no specific industry filter on the item
    if (!item.industry) return true;
    
    // Match industry if prospect has industry info
    if (prospect.companyIndustry && item.industry) {
      const prospectIndustry = prospect.companyIndustry.toLowerCase();
      const itemIndustry = item.industry.toLowerCase();
      return itemIndustry.includes(prospectIndustry) || prospectIndustry.includes(itemIndustry);
    }
    
    // Include general content if no prospect industry
    return true;
  }).slice(0, 5); // Limit to 5 most relevant items
}

/**
 * Verified signals from trusted external sources.
 * AI can ONLY reference claims present in this object.
 * Prevents hallucinated funding, hiring, or news claims.
 */
export interface VerifiedSignals {
  funding?: {
    amount?: string;
    round?: string;
    date?: string;
    source?: string;
  };
  hiring?: {
    roles?: string[];
    department?: string;
    source?: string;
  };
  expansion?: {
    type?: 'geographic' | 'product' | 'team';
    details?: string;
    source?: string;
  };
  news?: {
    headline?: string;
    date?: string;
    source?: string;
  };
  custom?: Record<string, string>;
}

export interface EmailGenerationRequest {
  prospectId: string;
  emailType: EmailType;
  sequenceStep?: number;
  previousEmails?: string[];
  customContext?: Partial<PromptContext>;
  tone?: 'professional' | 'casual' | 'urgent' | 'friendly';
  contentItemIds?: string[]; // User-selected content library items
  // AI Decision Engine context
  campaignStage?: 'first_touch' | 'follow_up' | 'objection' | 'post_demo' | 'breakup' | 're_engagement';
  daysSinceLastTouch?: number;
  replyType?: 'positive' | 'neutral' | 'objection' | 'no_reply' | 'silence';
  triggerDetected?: 'hiring' | 'funding' | 'expansion' | 'new_role' | 'none';
  icpType?: 'smb' | 'mid_market' | 'enterprise';
  userRole?: 'sdr' | 'manager' | 'founder' | 'revops';
  // Source-based validation: AI can only reference verified signals
  verifiedSignals?: VerifiedSignals;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  reasoning: string;
  personalizationFactors: string[];
  confidenceScore: number;
  // AI Decision Engine outputs
  templateRecommendation?: {
    templateName: string;
    reasoning: string;
  };
  warnings?: string[]; // Guardrail violations
  // Source-based validation
  isBlocked?: boolean; // True if email contains unverified claims
  claimViolations?: UnverifiedClaimValidation['violations'];
}

export interface EmailVariant {
  id: string;
  email: GeneratedEmail;
  approach: string;
}

/**
 * UNVERIFIED CLAIMS PATTERNS
 * These patterns detect AI-generated claims that require verified source data.
 */
const UNVERIFIED_CLAIM_PATTERNS = {
  funding: [
    /\b(series\s+[a-z])\b/i,
    /\braised\s+\$?\d+/i,
    /\bfunding\s+(round|announcement)/i,
    /\brecent(ly)?\s+(raised|funding|investment)/i,
    /\$\d+[mb]?\s+(round|funding|raise)/i,
  ],
  hiring: [
    /\b(hiring|recruiting|growing\s+the\s+team)\b/i,
    /\bopen\s+(roles?|positions?)\b/i,
    /\bgrowing\s+(rapidly|fast|the\s+team)/i,
    /\bheadcount\s+(expansion|growth)/i,
  ],
  expansion: [
    /\b(expansion|expanding)\s+(into|to|plans?)/i,
    /\bnew\s+(office|location|market)/i,
    /\bentering\s+(new\s+)?market/i,
    /\bgeographic\s+expansion/i,
  ],
  news: [
    /\b(announced|launched|unveiled)\s+(today|recently|this\s+week)/i,
    /\bsaw\s+(the\s+news|your\s+announcement)/i,
    /\bcongratulations\s+on\s+(the|your)\s+(news|announcement|launch)/i,
    /\brecent\s+(news|announcement|press\s+release)/i,
  ],
};

export interface UnverifiedClaimValidation {
  isBlocked: boolean;
  violations: Array<{
    type: 'funding' | 'hiring' | 'expansion' | 'news';
    matchedText: string;
    reason: string;
  }>;
}

/**
 * Validates that AI-generated content only references verified signals.
 * BLOCKS sending if unverified claims are detected.
 */
export function validateUnverifiedClaims(
  body: string,
  subject: string,
  verifiedSignals?: VerifiedSignals
): UnverifiedClaimValidation {
  const violations: UnverifiedClaimValidation['violations'] = [];
  const combinedText = `${subject} ${body}`.toLowerCase();

  // Check for funding claims without verified source
  if (!verifiedSignals?.funding) {
    for (const pattern of UNVERIFIED_CLAIM_PATTERNS.funding) {
      const match = combinedText.match(pattern);
      if (match) {
        violations.push({
          type: 'funding',
          matchedText: match[0],
          reason: 'Email references funding but no verified funding signal exists. Add verifiedSignals.funding or remove claim.',
        });
        break; // One violation per type is enough
      }
    }
  }

  // Check for hiring claims without verified source
  if (!verifiedSignals?.hiring) {
    for (const pattern of UNVERIFIED_CLAIM_PATTERNS.hiring) {
      const match = combinedText.match(pattern);
      if (match) {
        violations.push({
          type: 'hiring',
          matchedText: match[0],
          reason: 'Email references hiring but no verified hiring signal exists. Add verifiedSignals.hiring or remove claim.',
        });
        break;
      }
    }
  }

  // Check for expansion claims without verified source
  if (!verifiedSignals?.expansion) {
    for (const pattern of UNVERIFIED_CLAIM_PATTERNS.expansion) {
      const match = combinedText.match(pattern);
      if (match) {
        violations.push({
          type: 'expansion',
          matchedText: match[0],
          reason: 'Email references expansion but no verified expansion signal exists. Add verifiedSignals.expansion or remove claim.',
        });
        break;
      }
    }
  }

  // Check for news claims without verified source
  if (!verifiedSignals?.news) {
    for (const pattern of UNVERIFIED_CLAIM_PATTERNS.news) {
      const match = combinedText.match(pattern);
      if (match) {
        violations.push({
          type: 'news',
          matchedText: match[0],
          reason: 'Email references news/announcement but no verified news signal exists. Add verifiedSignals.news or remove claim.',
        });
        break;
      }
    }
  }

  return {
    isBlocked: violations.length > 0,
    violations,
  };
}

// AI Decision Engine: Validate email against guardrails
function validateEmailGuardrails(body: string, subject: string, request: EmailGenerationRequest): string[] {
  const warnings: string[] = [];
  const wordCount = body.split(/\s+/).length;
  
  // Word count check
  if (wordCount > 130) {
    warnings.push(`Email exceeds 130 words (${wordCount} words). Consider shortening for better response rates.`);
  }
  
  // Multiple CTAs check
  const questionMarks = (body.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    warnings.push('Multiple questions detected. Stick to ONE question per email for clarity.');
  }
  
  // Calendar link in first touch
  if (request.campaignStage === 'first_touch' || request.emailType === 'cold_outreach') {
    if (body.toLowerCase().includes('calendly') || body.toLowerCase().includes('calendar link') || body.includes('/schedule')) {
      warnings.push('Calendar links in first touch emails reduce reply rates. Remove and ask a question instead.');
    }
  }
  
  // Pitch detection in first touch
  if (request.campaignStage === 'first_touch' || request.emailType === 'cold_outreach') {
    const pitchPhrases = ['our solution', 'we offer', 'our platform', 'our product', 'we provide', 'our services'];
    const hasPitch = pitchPhrases.some(phrase => body.toLowerCase().includes(phrase));
    if (hasPitch) {
      warnings.push('First touch emails should start conversations, not pitch products. Consider reframing around their problem.');
    }
  }
  
  // Fake personalization check
  if (body.includes('{{') || body.includes('}}') || body.includes('[Company]') || body.includes('[Name]')) {
    warnings.push('Unresolved personalization tokens detected. Ensure all placeholders are replaced.');
  }

  // Source-based validation: Block unverified claims
  const claimValidation = validateUnverifiedClaims(body, subject, request.verifiedSignals);
  if (claimValidation.isBlocked) {
    for (const violation of claimValidation.violations) {
      warnings.push(`🚫 BLOCKED: ${violation.reason} (detected: "${violation.matchedText}")`);
    }
  }
  
  return warnings;
}

/**
 * Builds a context string for verified signals to include in AI prompts.
 * Only includes signals that have been verified from external sources.
 */
function buildVerifiedSignalsContext(signals?: VerifiedSignals): string {
  if (!signals) {
    return 'VERIFIED SIGNALS: None provided. Do not fabricate any claims about funding, hiring, expansion, or news.';
  }

  const parts: string[] = ['VERIFIED SIGNALS (you may reference these facts):'];

  if (signals.funding) {
    const fundingDetails = [
      signals.funding.round ? `Round: ${signals.funding.round}` : null,
      signals.funding.amount ? `Amount: ${signals.funding.amount}` : null,
      signals.funding.date ? `Date: ${signals.funding.date}` : null,
      signals.funding.source ? `Source: ${signals.funding.source}` : null,
    ].filter(Boolean).join(', ');
    parts.push(`- Funding: ${fundingDetails}`);
  }

  if (signals.hiring) {
    const hiringDetails = [
      signals.hiring.roles?.length ? `Roles: ${signals.hiring.roles.join(', ')}` : null,
      signals.hiring.department ? `Department: ${signals.hiring.department}` : null,
      signals.hiring.source ? `Source: ${signals.hiring.source}` : null,
    ].filter(Boolean).join(', ');
    parts.push(`- Hiring: ${hiringDetails}`);
  }

  if (signals.expansion) {
    const expansionDetails = [
      signals.expansion.type ? `Type: ${signals.expansion.type}` : null,
      signals.expansion.details ? `Details: ${signals.expansion.details}` : null,
      signals.expansion.source ? `Source: ${signals.expansion.source}` : null,
    ].filter(Boolean).join(', ');
    parts.push(`- Expansion: ${expansionDetails}`);
  }

  if (signals.news) {
    const newsDetails = [
      signals.news.headline ? `Headline: ${signals.news.headline}` : null,
      signals.news.date ? `Date: ${signals.news.date}` : null,
      signals.news.source ? `Source: ${signals.news.source}` : null,
    ].filter(Boolean).join(', ');
    parts.push(`- News: ${newsDetails}`);
  }

  if (signals.custom) {
    for (const [key, value] of Object.entries(signals.custom)) {
      parts.push(`- ${key}: ${value}`);
    }
  }

  if (parts.length === 1) {
    return 'VERIFIED SIGNALS: None provided. Do not fabricate any claims about funding, hiring, expansion, or news.';
  }

  return parts.join('\n');
}

// AI Decision Engine: Get recommended template based on context
function getAIRecommendedTemplate(request: EmailGenerationRequest): { templateName: string; reasoning: string } | undefined {
  if (!request.campaignStage) return undefined;
  
  const templateSelection = getTemplateForContext({
    campaignStage: request.campaignStage,
    daysSinceLastTouch: request.daysSinceLastTouch,
    replyType: request.replyType,
    triggerDetected: request.triggerDetected,
    icpType: request.icpType,
    userRole: request.userRole
  });
  
  return {
    templateName: templateSelection.templateName,
    reasoning: templateSelection.reasoning
  };
}

// Helper function to format email body with proper spacing
function formatEmailBody(body: string): string {
  // If body already has proper double line breaks, return as is
  if (body.includes('\n\n')) {
    return body;
  }
  
  // Split by single line breaks and rejoin with double line breaks
  // This adds proper spacing between sentences/paragraphs
  const lines = body.split('\n').filter(line => line.trim().length > 0);
  
  // If there are multiple lines, add spacing between them
  if (lines.length > 1) {
    return lines.join('\n\n');
  }
  
  // If it's a single block, try to split by periods followed by capital letters
  // This handles cases where AI puts everything in one line
  const sentences = body.split(/\.\s+(?=[A-Z])/);
  if (sentences.length > 1) {
    // Group sentences into paragraphs (roughly 1-2 sentences per paragraph)
    const paragraphs = [];
    for (let i = 0; i < sentences.length; i++) {
      let sentence = sentences[i].trim();
      if (!sentence.endsWith('.') && !sentence.endsWith('?') && !sentence.endsWith('!')) {
        sentence += '.';
      }
      paragraphs.push(sentence);
    }
    return paragraphs.join('\n\n');
  }
  
  return body;
}

export async function generateEmail(request: EmailGenerationRequest, prospectData?: Prospect, ctx?: RequestContext): Promise<GeneratedEmail> {
  try {
    // Use passed prospect data if available, otherwise fetch from storage
    let prospect: Prospect | null | undefined = prospectData;
    
    // Create a default context if not provided (for backward compatibility)
    const reqCtx: RequestContext = ctx || { userId: prospectData?.userId || 'system', roles: [] };
    
    if (!prospect) {
      prospect = await storage.getProspect(reqCtx, request.prospectId);
    }
    
    if (!prospect) {
      throw new Error(`Prospect with ID ${request.prospectId} not found`);
    }

    // Check if prospect has minimal data - warn if enrichment needed
    const hasMinimalData = !prospect.jobTitle || !prospect.companyIndustry;
    if (hasMinimalData) {
      console.warn(`⚠️ Prospect ${prospect.id} has limited data. Consider enriching for better personalization.`);
    }

    // Fetch content library items - use selected IDs if provided, otherwise filter by industry
    const allContentLibraryItems = await storage.getContentLibraryItems(reqCtx);
    let contentLibraryItems;
    
    if (request.contentItemIds && request.contentItemIds.length > 0) {
      // Use specifically selected content items
      contentLibraryItems = allContentLibraryItems.filter(item => 
        request.contentItemIds!.includes(item.id.toString())
      );
    } else {
      // Fall back to industry-based filtering
      contentLibraryItems = filterContentByIndustry(allContentLibraryItems, prospect);
    }
    
    const promptContext = buildPromptContext(prospect, request, contentLibraryItems);
    const template = getPromptTemplate(request.emailType);
    let prompt = interpolatePrompt(template, promptContext);
    
    // AI Decision Engine: Get recommended template and enhance prompt
    const templateSelection = request.campaignStage ? getTemplateForContext({
      campaignStage: request.campaignStage,
      daysSinceLastTouch: request.daysSinceLastTouch,
      replyType: request.replyType,
      triggerDetected: request.triggerDetected,
      icpType: request.icpType,
      userRole: request.userRole
    }) : null;
    
    // Enhance prompt with template pattern if available
    if (templateSelection?.template?.body) {
      const templateGuidance = `
📋 AI DECISION ENGINE RECOMMENDATION:
Template Pattern: ${templateSelection.templateName}
Reasoning: ${templateSelection.reasoning}

REFERENCE PATTERN (use this style and structure):
${templateSelection.template.body}

Apply this pattern style to the specific prospect context below. Do NOT copy verbatim - adapt the approach and tone.`;
      
      prompt = templateGuidance + '\n\n' + prompt;
    }

    // Build verified signals context for AI prompt
    const verifiedSignalsContext = buildVerifiedSignalsContext(request.verifiedSignals);
    
    // System prompt with source-based validation rules
    const systemPrompt = `You are an expert sales development representative for Increff with years of experience writing high-converting cold emails. Always respond with valid JSON and follow the exact structure and constraints provided.

CRITICAL SOURCE-BASED VALIDATION RULES:
1. You can ONLY reference facts from these sources:
   - Prospect data provided in the prompt (name, title, company, industry)
   - Verified signals (if provided below)
   - Content library data
2. DO NOT fabricate or assume any claims about:
   - Funding rounds (Series A, B, C, raised $X)
   - Hiring activity or headcount growth
   - Geographic or product expansion
   - Recent news, announcements, or launches
3. If no verified signals are provided, focus on role-based personalization and industry insights only.

${verifiedSignalsContext}

When given an AI Decision Engine recommendation, prioritize its template pattern and style.`;

    const response = await openaiHelper.callWithFallback(
      // Primary OpenAI call
      (client) =>
        client.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 1000
        }),
      // Anthropic fallback
      (anthropic) =>
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          temperature: 0.7,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\nRespond with valid JSON only.`
            }
          ]
        }) as any,
      // OpenRouter fallback - uses OpenAI-compatible API
      (client) => {
        const openRouterModel = process.env.OPENROUTER_MODEL || "openai/gpt-4o";
        
        // JSON Mode Compatibility: Only OpenAI and Anthropic models support response_format
        // See AI_PROVIDER.md for full compatibility matrix
        const supportsJsonMode = openRouterModel.includes('openai/') || openRouterModel.includes('anthropic/');
        
        const requestParams: any = {
          model: openRouterModel,
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        };
        
        // Only add response_format for models that support it
        if (supportsJsonMode) {
          requestParams.response_format = { type: "json_object" };
        }
        
        return client.chat.completions.create(requestParams);
      }
    );

    // Handle both OpenAI and Anthropic response formats
    let result;
    if ('choices' in response) {
      // OpenAI format
      const rawContent = (response as any).choices[0].message.content || '{}';
      result = JSON.parse(rawContent);
    } else {
      // Anthropic format
      const content = (response as any).content[0];
      if (content.type === 'text') {
        const text = content.text;
        // Strip markdown code blocks if present
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : text;
        result = JSON.parse(jsonText.trim());
      }
    }
    
    const personalizationFactors = [
      'Prospect name and title',
      prospect.companyName ? 'Company information' : null,
      'Industry-specific context',
      'Role-appropriate messaging',
      contentLibraryItems.length > 0 ? 'Content library data' : null
    ].filter(Boolean) as string[];
    
    const confidenceScore = calculateConfidenceScore(prospect, request);
    
    // Format email body with proper spacing
    const formattedBody = formatEmailBody(result.body || generateFallbackEmailBody(prospect));
    const finalSubject = result.subject || `Quick question about ${prospect.companyName || 'your business'}`;
    
    // AI Decision Engine: Validate against guardrails
    const warnings = validateEmailGuardrails(formattedBody, finalSubject, request);
    
    // AI Decision Engine: Get template recommendation
    const templateRecommendation = getAIRecommendedTemplate(request);
    
    // Source-based validation: Check for unverified claims
    const claimValidation = validateUnverifiedClaims(formattedBody, finalSubject, request.verifiedSignals);
    
    return {
      subject: finalSubject,
      body: formattedBody,
      reasoning: result.reasoning || 'AI-generated personalized email',
      personalizationFactors,
      confidenceScore,
      templateRecommendation,
      warnings: warnings.length > 0 ? warnings : undefined,
      isBlocked: claimValidation.isBlocked,
      claimViolations: claimValidation.isBlocked ? claimValidation.violations : undefined
    };
    
  } catch (error) {
    console.error('Email generation failed:', error);
    // Create a system context for fallback retrieval
    const fallbackCtx: RequestContext = { userId: 'system', roles: [] };
    const fallbackProspect = await storage.getProspect(fallbackCtx, request.prospectId);
    if (fallbackProspect) {
      return generateFallbackEmail(fallbackProspect, request);
    }
    throw error;
  }
}

export async function generateEmailVariants(
  request: EmailGenerationRequest,
  variantCount: number = 2
): Promise<EmailVariant[]> {
  const variants: EmailVariant[] = [];
  
  try {
    const approaches = [
      { tone: 'professional', approach: 'Value-focused' },
      { tone: 'friendly', approach: 'Relationship-building' },
      { tone: 'urgent', approach: 'Urgency-driven' }
    ];
    
    for (let i = 0; i < Math.min(variantCount, approaches.length); i++) {
      const variantRequest: EmailGenerationRequest = {
        ...request,
        tone: approaches[i].tone as 'professional' | 'friendly' | 'urgent'
      };
      
      const email = await generateEmail(variantRequest);
      
      variants.push({
        id: `variant_${i + 1}`,
        email,
        approach: approaches[i].approach
      });
    }
    
    return variants;
    
  } catch (error) {
    console.error('Email variant generation failed:', error);
    throw error;
  }
}

export async function generateFollowUp(
  prospectId: string,
  previousEmails: string[],
  sequenceStep: number
): Promise<GeneratedEmail> {
  const request: EmailGenerationRequest = {
    prospectId,
    emailType: EMAIL_TYPES.FOLLOW_UP,
    sequenceStep,
    previousEmails,
    tone: sequenceStep >= 3 ? 'professional' : 'friendly'
  };
  
  return generateEmail(request);
}

export async function generateBreakupEmail(prospectId: string): Promise<GeneratedEmail> {
  const request: EmailGenerationRequest = {
    prospectId,
    emailType: EMAIL_TYPES.BREAKUP,
    tone: 'professional'
  };
  
  return generateEmail(request);
}

function buildPromptContext(
  prospect: Prospect, 
  request: EmailGenerationRequest,
  contentLibraryItems: any[] = []
): PromptContext {
  // Format content library data for the prompt
  let contentLibrary = '';
  if (contentLibraryItems.length > 0) {
    contentLibrary = contentLibraryItems.map((item: any) => {
      return `${item.title || 'Untitled'}:\n${item.content || ''}`;
    }).join('\n\n');
  } else {
    contentLibrary = 'Increff provides merchandising solutions for fashion and retail, including demand forecasting, inventory allocation, and markdown optimization.';
  }

  // Use actual seniority from prospect if available, otherwise extract from job title
  const seniority = prospect.seniority || extractSeniority(prospect.jobTitle || '');
  
  // Extract LinkedIn context if URL is available
  const linkedinContext = prospect.linkedinUrl 
    ? `LinkedIn: ${prospect.linkedinUrl}` 
    : '';

  // Build comprehensive prospect context
  const prospectContext = [
    prospect.jobTitle ? `Title: ${prospect.jobTitle}` : '',
    prospect.department ? `Department: ${prospect.department}` : '',
    seniority ? `Seniority: ${seniority}` : '',
    prospect.companyName ? `Company: ${prospect.companyName}` : '',
    prospect.companyIndustry ? `Industry: ${prospect.companyIndustry}` : '',
    prospect.companySize ? `Company Size: ${prospect.companySize}` : '',
    prospect.companyLocation ? `Location: ${prospect.companyLocation}` : '',
    linkedinContext
  ].filter(Boolean).join('\n');

  // Format previous emails properly for the AI prompt
  let formattedPreviousEmails = '';
  if (request.previousEmails && Array.isArray(request.previousEmails) && request.previousEmails.length > 0) {
    formattedPreviousEmails = request.previousEmails
      .filter(email => email && email.trim().length > 0)
      .map((email, index) => `Email ${index + 1}:\n${email}`)
      .join('\n\n---\n\n');
  } else {
    formattedPreviousEmails = 'No previous email conversation';
  }

  return {
    prospectName: `${prospect.firstName || ""} ${prospect.lastName || ""}`.trim(),
    prospectTitle: prospect.jobTitle || 'Professional',
    prospectCompany: prospect.companyName || 'their company',
    prospectIndustry: prospect.companyIndustry || extractIndustry(prospect),
    prospectSeniority: seniority,
    companySize: prospect.companySize || undefined,
    companyRevenue: undefined,
    recentNews: undefined,
    painPoints: generatePainPoints(prospect),
    previousEmails: formattedPreviousEmails,
    sequenceStep: request.sequenceStep,
    tone: request.tone || 'professional',
    contentLibrary,
    prospectContext, // Add comprehensive context
    linkedinUrl: prospect.linkedinUrl || undefined,
    ...request.customContext
  };
}

function extractIndustry(prospect: Prospect): string {
  if (prospect.companyIndustry) {
    return prospect.companyIndustry;
  }
  return 'Unknown Industry';
}

function extractSeniority(jobTitle: string): string {
  const title = jobTitle.toLowerCase();
  
  if (title.includes('ceo') || title.includes('founder') || title.includes('president')) {
    return 'C-Level';
  }
  if (title.includes('vp') || title.includes('vice president') || title.includes('cto') || title.includes('cfo')) {
    return 'VP-Level';
  }
  if (title.includes('director') || title.includes('head of')) {
    return 'Director-Level';
  }
  if (title.includes('manager') || title.includes('lead')) {
    return 'Manager-Level';
  }
  if (title.includes('senior') || title.includes('sr')) {
    return 'Senior-Level';
  }
  
  return 'Individual Contributor';
}

function generatePainPoints(prospect: Prospect): string[] {
  const title = (prospect.jobTitle || '').toLowerCase();
  const painPoints: string[] = [];
  
  if (title.includes('sales') || title.includes('revenue')) {
    painPoints.push('Pipeline generation', 'Lead quality', 'Sales efficiency');
  } else if (title.includes('marketing')) {
    painPoints.push('Lead generation', 'Campaign ROI', 'Brand awareness');
  } else if (title.includes('operations') || title.includes('ops')) {
    painPoints.push('Process efficiency', 'Cost reduction', 'Scalability');
  } else if (title.includes('tech') || title.includes('engineer')) {
    painPoints.push('Technical debt', 'System scalability', 'Team productivity');
  } else {
    painPoints.push('Business growth', 'Operational efficiency', 'Cost optimization');
  }
  
  return painPoints;
}

function calculateConfidenceScore(
  prospect: Prospect, 
  request: EmailGenerationRequest
): number {
  let score = 30;
  
  if (prospect.companyName) score += 20;
  if (prospect.jobTitle) score += 20;
  if (prospect.firstName && prospect.lastName) score += 15;
  if (prospect.companyIndustry) score += 10;
  if (request.customContext && Object.keys(request.customContext).length > 0) score += 5;
  
  return Math.min(100, score);
}

function generateFallbackEmail(prospect: Prospect, request: EmailGenerationRequest): GeneratedEmail {
  const name = `${prospect.firstName || ""} ${prospect.lastName || ""}`.trim() || 'there';
  const company = prospect.companyName || 'your company';
  
  return {
    subject: `Quick question about ${company}`,
    body: generateFallbackEmailBody(prospect),
    reasoning: 'Generated using fallback template (OpenAI unavailable)',
    personalizationFactors: ['Prospect name', 'Company name'],
    confidenceScore: 50
  };
}

function generateFallbackEmailBody(prospect: Prospect): string {
  const name = prospect.firstName || 'there';
  const company = prospect.companyName || 'your company';
  const title = prospect.jobTitle || 'your role';
  
  return `Hi ${name},

I noticed ${company} and thought you might be interested in how we help companies in ${title} positions streamline their operations.

Would you be open to a quick 15-minute call to discuss how we could help?

Best regards`;
}

export class EmailGenerationService {
  private cache = new Map<string, GeneratedEmail>();
  private rateLimiter = new Map<string, number>();
  
  async generateWithRetry(
    request: EmailGenerationRequest, 
    maxRetries: number = 3
  ): Promise<GeneratedEmail> {
    const key = `${request.prospectId}_${request.emailType}`;
    const lastRequest = this.rateLimiter.get(key) || 0;
    const now = Date.now();
    
    if (now - lastRequest < 60000) {
      throw new Error('Rate limit exceeded. Please wait before generating another email.');
    }
    
    const cacheKey = this.generateCacheKey(request);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await generateEmail(request);
        
        this.cache.set(cacheKey, result);
        this.rateLimiter.set(key, now);
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`Email generation attempt ${attempt} failed:`, (error as Error).message);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    throw new Error(`Email generation failed after ${maxRetries} attempts: ${lastError?.message}`);
  }
  
  private generateCacheKey(request: EmailGenerationRequest): string {
    return `${request.prospectId}_${request.emailType}_${request.sequenceStep || 0}_${request.tone || 'default'}`;
  }
  
  clearCache(): void {
    this.cache.clear();
  }
}

export const emailGenerationService = new EmailGenerationService();
