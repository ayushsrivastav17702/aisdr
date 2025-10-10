import { openaiHelper } from "./openai-helper";
import { storage } from "../storage";
import type { Prospect } from "@shared/schema";
import { 
  getPromptTemplate, 
  interpolatePrompt, 
  EMAIL_TYPES,
  type PromptContext,
  type EmailType 
} from "./ai-prompt-templates";

export interface EmailGenerationRequest {
  prospectId: string;
  emailType: EmailType;
  sequenceStep?: number;
  previousEmails?: string[];
  customContext?: Partial<PromptContext>;
  tone?: 'professional' | 'casual' | 'urgent' | 'friendly';
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  reasoning: string;
  personalizationFactors: string[];
  confidenceScore: number;
}

export interface EmailVariant {
  id: string;
  email: GeneratedEmail;
  approach: string;
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

export async function generateEmail(request: EmailGenerationRequest): Promise<GeneratedEmail> {
  try {
    const prospect = await storage.getProspect(request.prospectId);
    if (!prospect) {
      throw new Error(`Prospect with ID ${request.prospectId} not found`);
    }

    // Check if prospect has minimal data - warn if enrichment needed
    const hasMinimalData = !prospect.jobTitle || !prospect.companyIndustry;
    if (hasMinimalData) {
      console.warn(`⚠️ Prospect ${prospect.id} has limited data. Consider enriching for better personalization.`);
    }

    // Fetch content library items
    const contentLibraryItems = await storage.getContentLibraryItems();
    
    const context = buildPromptContext(prospect, request, contentLibraryItems);
    const template = getPromptTemplate(request.emailType);
    const prompt = interpolatePrompt(template, context);

    const response = await openaiHelper.callWithFallback(
      (client) =>
        client.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert sales development representative for Increff with years of experience writing high-converting cold emails. Always respond with valid JSON and follow the exact structure and constraints provided."
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
      // Anthropic fallback - cast to any to avoid type mismatch
      (anthropic) =>
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          temperature: 0.7,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\nRespond with valid JSON only.`
            }
          ]
        }) as any
    );

    // Handle both OpenAI and Anthropic response formats
    let result;
    if ('choices' in response) {
      // OpenAI format
      const rawContent = (response as any).choices[0].message.content || '{}';
      console.log('📧 AI Response (OpenAI):', rawContent.substring(0, 300));
      result = JSON.parse(rawContent);
    } else {
      // Anthropic format
      const content = (response as any).content[0];
      if (content.type === 'text') {
        const text = content.text;
        console.log('📧 AI Response (Anthropic):', text.substring(0, 300));
        // Strip markdown code blocks if present
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : text;
        result = JSON.parse(jsonText.trim());
      }
    }
    
    console.log('📧 Parsed result - subject:', result.subject?.substring(0, 50), 'body length:', result.body?.length || 0);
    
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
    
    return {
      subject: result.subject || `Quick question about ${prospect.companyName || 'your business'}`,
      body: formattedBody,
      reasoning: result.reasoning || 'AI-generated personalized email',
      personalizationFactors,
      confidenceScore
    };
    
  } catch (error) {
    console.error('Email generation failed:', error);
    const prospect = await storage.getProspect(request.prospectId);
    if (prospect) {
      return generateFallbackEmail(prospect, request);
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
    previousEmails: request.previousEmails,
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
