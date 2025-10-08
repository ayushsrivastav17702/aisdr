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

export async function generateEmail(request: EmailGenerationRequest): Promise<GeneratedEmail> {
  try {
    const prospect = await storage.getProspect(request.prospectId);
    if (!prospect) {
      throw new Error(`Prospect with ID ${request.prospectId} not found`);
    }

    const context = buildPromptContext(prospect, request);
    const template = getPromptTemplate(request.emailType);
    const prompt = interpolatePrompt(template, context);

    const response = await openaiHelper.callWithFallback((client) =>
      client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert sales development representative with years of experience writing high-converting cold emails. Always respond with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1000
      })
    );

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    const personalizationFactors = [
      'Prospect name and title',
      prospect.companyName ? 'Company information' : null,
      'Industry-specific context',
      'Role-appropriate messaging'
    ].filter(Boolean) as string[];
    
    const confidenceScore = calculateConfidenceScore(prospect, request);
    
    return {
      subject: result.subject || `Quick question about ${prospect.companyName || 'your business'}`,
      body: result.body || generateFallbackEmailBody(prospect),
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
  request: EmailGenerationRequest
): PromptContext {
  return {
    prospectName: `${prospect.firstName || ""} ${prospect.lastName || ""}`.trim(),
    prospectTitle: prospect.jobTitle || 'Professional',
    prospectCompany: prospect.companyName || 'their company',
    prospectIndustry: extractIndustry(prospect),
    prospectSeniority: extractSeniority(prospect.jobTitle || ''),
    companySize: 'Unknown',
    companyRevenue: 'Unknown',
    recentNews: undefined,
    painPoints: generatePainPoints(prospect),
    previousEmails: request.previousEmails,
    sequenceStep: request.sequenceStep,
    tone: request.tone || 'professional',
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
