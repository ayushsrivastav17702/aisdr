import { openaiHelper } from "./openai-helper";
import type { Prospect } from "@shared/schema";

export interface TokenResolutionResult {
  resolvedContent: string;
  unresolvedTokens: string[];
  warnings: string[];
  customAiLineGenerated: boolean;
}

export interface TokenContext {
  prospect: Prospect;
  senderName?: string;
  companyName?: string;
  sequenceStep?: number;
  sequenceName?: string;
}

const STANDARD_TOKENS: Record<string, (ctx: TokenContext) => string | undefined> = {
  'first_name': (ctx) => ctx.prospect.firstName || undefined,
  'last_name': (ctx) => ctx.prospect.lastName || undefined,
  'full_name': (ctx) => ctx.prospect.fullName || `${ctx.prospect.firstName || ''} ${ctx.prospect.lastName || ''}`.trim() || undefined,
  'company': (ctx) => ctx.prospect.companyName || undefined,
  'company_name': (ctx) => ctx.prospect.companyName || undefined,
  'job_title': (ctx) => ctx.prospect.jobTitle || undefined,
  'title': (ctx) => ctx.prospect.jobTitle || undefined,
  'industry': (ctx) => ctx.prospect.companyIndustry || undefined,
  'company_size': (ctx) => ctx.prospect.companySize || undefined,
  'location': (ctx) => ctx.prospect.contactLocation || ctx.prospect.companyLocation || undefined,
  'city': (ctx) => extractCity(ctx.prospect.contactLocation || ctx.prospect.companyLocation),
  'email': (ctx) => ctx.prospect.primaryEmail || undefined,
  'phone': (ctx) => ctx.prospect.phoneNumber || undefined,
  'linkedin_url': (ctx) => ctx.prospect.linkedinUrl || undefined,
  'department': (ctx) => ctx.prospect.department || undefined,
  'seniority': (ctx) => ctx.prospect.seniority || undefined,
  'sender_name': (ctx) => ctx.senderName || undefined,
  'sender_company': (ctx) => ctx.companyName || 'Increff',
  'sequence_step': (ctx) => ctx.sequenceStep?.toString() || undefined,
  'sequence_name': (ctx) => ctx.sequenceName || undefined,
};

const TOKEN_FALLBACKS: Record<string, string> = {
  'first_name': 'there',
  'last_name': '',
  'full_name': 'there',
  'company': 'your company',
  'company_name': 'your company',
  'job_title': 'your role',
  'title': 'your role',
  'industry': 'your industry',
  'company_size': 'your organization',
  'location': 'your area',
  'city': 'your city',
  'department': 'your team',
  'seniority': 'professional',
  'sender_name': 'Your Account Team',
  'sender_company': 'Increff',
};

function extractCity(location: string | undefined | null): string | undefined {
  if (!location) return undefined;
  const parts = location.split(',');
  return parts[0]?.trim() || undefined;
}

export async function resolveTokens(
  content: string,
  context: TokenContext
): Promise<TokenResolutionResult> {
  const warnings: string[] = [];
  const unresolvedTokens: string[] = [];
  let customAiLineGenerated = false;
  let resolvedContent = content;

  const tokenPattern = /\{\{([a-zA-Z_]+)\}\}/g;
  const foundTokens = new Set<string>();
  
  let match;
  while ((match = tokenPattern.exec(content)) !== null) {
    foundTokens.add(match[1].toLowerCase());
  }

  for (const tokenName of Array.from(foundTokens)) {
    const tokenPlaceholder = new RegExp(`\\{\\{${tokenName}\\}\\}`, 'gi');

    if (tokenName === 'custom_ai_line') {
      try {
        const aiLine = await generateCustomAiLine(context);
        resolvedContent = resolvedContent.replace(tokenPlaceholder, aiLine);
        customAiLineGenerated = true;
        console.log(`✅ Generated custom AI line for prospect ${context.prospect.id}`);
      } catch (error) {
        const fallback = generateFallbackAiLine(context);
        resolvedContent = resolvedContent.replace(tokenPlaceholder, fallback);
        warnings.push(`custom_ai_line: AI generation failed, using fallback`);
        console.warn(`⚠️ Custom AI line generation failed for prospect ${context.prospect.id}:`, error);
      }
      continue;
    }

    const resolver = STANDARD_TOKENS[tokenName];
    if (resolver) {
      const value = resolver(context);
      if (value) {
        resolvedContent = resolvedContent.replace(tokenPlaceholder, value);
      } else {
        const fallback = TOKEN_FALLBACKS[tokenName];
        if (fallback !== undefined) {
          resolvedContent = resolvedContent.replace(tokenPlaceholder, fallback);
          warnings.push(`${tokenName}: missing value, using fallback "${fallback}"`);
          console.warn(`⚠️ Token {{${tokenName}}} missing for prospect ${context.prospect.id}, using fallback`);
        } else {
          unresolvedTokens.push(tokenName);
          warnings.push(`${tokenName}: no value or fallback available`);
          console.warn(`⚠️ Token {{${tokenName}}} unresolved for prospect ${context.prospect.id}`);
        }
      }
    } else {
      unresolvedTokens.push(tokenName);
      warnings.push(`${tokenName}: unknown token`);
      console.warn(`⚠️ Unknown token {{${tokenName}}} in content`);
    }
  }

  return {
    resolvedContent,
    unresolvedTokens,
    warnings,
    customAiLineGenerated,
  };
}

async function generateCustomAiLine(context: TokenContext): Promise<string> {
  const { prospect } = context;
  
  const prompt = `Generate a single personalized opening line for a sales email to this prospect.

PROSPECT DATA:
- Name: ${prospect.firstName || 'Unknown'} ${prospect.lastName || ''}
- Company: ${prospect.companyName || 'Unknown'}
- Title: ${prospect.jobTitle || 'Unknown'}
- Industry: ${prospect.companyIndustry || 'Unknown'}
- Company Size: ${prospect.companySize || 'Unknown'}

RULES:
1. Keep it to ONE sentence (15-25 words max)
2. Reference something specific about their role, company, or industry
3. Do NOT make up facts about the company - use only what is provided
4. Do NOT use generic phrases like "I hope this finds you well"
5. Make it feel natural and personalized

EXAMPLES OF GOOD LINES:
- "As Head of Merchandising at [Company], you're likely managing inventory allocation across multiple channels."
- "With [Company]'s expansion in the retail space, optimizing markdown strategies must be a key focus."
- "Given your role in demand planning, reducing stockouts while minimizing overstock is probably top of mind."

IF COMPANY IS UNKNOWN:
- Focus on role-specific challenges instead
- Use phrases like "In your role as [title]..." or "As a [title] professional..."

Return ONLY the personalized line, no quotes, no explanation.`;

  const response = await openaiHelper.callWithFallback(
    (client) =>
      client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at writing personalized email opening lines. Be specific but never fabricate information."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 100
      }),
    (anthropic) =>
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }]
      }) as any,
    (client) =>
      client.chat.completions.create({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at writing personalized email opening lines. Be specific but never fabricate information."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 100
      })
  );

  if ('choices' in response) {
    return (response as any).choices[0].message.content?.trim() || generateFallbackAiLine(context);
  } else {
    const content = (response as any).content[0];
    return content.type === 'text' ? content.text.trim() : generateFallbackAiLine(context);
  }
}

function generateFallbackAiLine(context: TokenContext): string {
  const { prospect } = context;
  
  if (prospect.jobTitle && prospect.companyName) {
    return `As ${prospect.jobTitle} at ${prospect.companyName}, you're likely focused on driving operational efficiency.`;
  }
  
  if (prospect.jobTitle) {
    return `In your role as ${prospect.jobTitle}, optimizing processes is likely a key priority.`;
  }
  
  if (prospect.companyName) {
    return `I noticed ${prospect.companyName} and thought you might be interested in how we help similar companies.`;
  }
  
  return `I thought you might be interested in how we help companies optimize their operations.`;
}

export function previewTokenResolution(
  content: string,
  context: TokenContext
): { preview: string; tokens: Array<{ token: string; value: string | null; hasFallback: boolean }> } {
  const tokens: Array<{ token: string; value: string | null; hasFallback: boolean }> = [];
  const tokenPattern = /\{\{([a-zA-Z_]+)\}\}/g;
  
  let match;
  while ((match = tokenPattern.exec(content)) !== null) {
    const tokenName = match[1].toLowerCase();
    
    if (tokenName === 'custom_ai_line') {
      tokens.push({
        token: tokenName,
        value: '[AI Generated Line - Preview Not Available]',
        hasFallback: true
      });
      continue;
    }
    
    const resolver = STANDARD_TOKENS[tokenName];
    if (resolver) {
      const value = resolver(context);
      const fallback = TOKEN_FALLBACKS[tokenName];
      tokens.push({
        token: tokenName,
        value: value || null,
        hasFallback: fallback !== undefined
      });
    } else {
      tokens.push({
        token: tokenName,
        value: null,
        hasFallback: false
      });
    }
  }

  let preview = content;
  for (const { token, value } of tokens) {
    const placeholder = new RegExp(`\\{\\{${token}\\}\\}`, 'gi');
    if (value) {
      preview = preview.replace(placeholder, value);
    } else {
      const fallback = TOKEN_FALLBACKS[token];
      if (fallback !== undefined) {
        preview = preview.replace(placeholder, `[${fallback}]`);
      } else {
        preview = preview.replace(placeholder, `[UNRESOLVED: ${token}]`);
      }
    }
  }

  return { preview, tokens };
}

export const tokenResolutionService = {
  resolveTokens,
  previewTokenResolution,
  generateCustomAiLine,
  STANDARD_TOKENS: Object.keys(STANDARD_TOKENS),
  TOKEN_FALLBACKS,
};

export default tokenResolutionService;
