export interface PromptContext {
  prospectName: string;
  prospectTitle: string;
  prospectCompany: string;
  prospectIndustry?: string;
  prospectSeniority?: string;
  companySize?: string;
  companyRevenue?: string;
  recentNews?: string;
  painPoints?: string[];
  previousEmails?: string[];
  sequenceStep?: number;
  tone?: 'professional' | 'casual' | 'urgent' | 'friendly';
  contentLibrary?: string;
  prospectContext?: string;
  linkedinUrl?: string;
}

export const COLD_EMAIL_PROMPT = `You are an expert sales development representative for Increff, writing personalized cold emails. Generate a compelling cold outreach email using the following information:

PROSPECT DETAILS:
{{prospectContext}}

INCREFF SOLUTIONS (use these specific details):
{{contentLibrary}}

CRITICAL RULES:
1. **Use ONLY the prospect information provided above** - if a field is missing, DO NOT make assumptions or add generic details
2. **Reference their SPECIFIC role/company** - use their actual job title and company name
3. **Match their industry** - if they're in fashion/retail/footwear, mention relevant Increff solutions for that vertical
4. **Be direct and specific** - no fluff, no generic praise, no assumptions

EMAIL STRUCTURE (80 words maximum):
1. **Subject**: Specific to their role + a clear benefit (e.g., "{{prospectTitle}} - reduce markdown by 26%")
2. **Opening**: Address them by name, reference their specific role at their company (1 sentence)
3. **Problem**: State ONE pain point relevant to their role (1 sentence, be specific)
4. **Solution**: What Increff does in ONE sentence with a specific number from the content library
5. **CTA**: Ask ONE simple question to start a conversation

FORMATTING REQUIREMENTS:
- Add a blank line between each paragraph/section for better readability
- Each section (Opening, Problem, Solution, CTA) should be separated by \n\n
- The body should have proper spacing: "Opening paragraph\n\nProblem paragraph\n\nSolution paragraph\n\nCTA question"

FORBIDDEN PHRASES:
❌ "I hope this email finds you well"
❌ "I was impressed by"  
❌ "reaching out to"
❌ "leading company"
❌ "innovative solutions"
❌ Any generic industry assumptions

REQUIRED:
✅ Use their exact job title
✅ Use their exact company name  
✅ Include specific numbers from content library (13%, 26%, 36%, etc.)
✅ End with a question mark
✅ Keep it under 80 words
✅ Focus on THEIR problem, not our product

RESPONSE FORMAT:
{
  "subject": "Subject line here",
  "body": "Email body here",
  "reasoning": "Brief explanation of personalization choices"
}

Generate the email now:`;

export const FOLLOW_UP_PROMPT = `You are writing a follow-up email as part of a sales sequence. This is step {{sequenceStep}} in the sequence.

PROSPECT CONTEXT:
- Name: {{prospectName}}
- Title: {{prospectTitle}}
- Company: {{prospectCompany}}
- Industry: {{prospectIndustry}}

PREVIOUS EMAIL CONTEXT:
{{previousEmails}}

FOLLOW-UP REQUIREMENTS:
1. Reference or build upon the previous email naturally
2. Introduce a NEW angle or value proposition
3. Keep it even shorter than the first email (2-3 sentences)
4. Create gentle urgency without being pushy
5. Include a different call-to-action
6. Tone: {{tone}}

If this is step 3 or higher, acknowledge the lack of response professionally and offer an easy out.

FORMATTING REQUIREMENTS:
- Add blank lines between paragraphs for readability
- Separate each sentence/section with \n\n for proper spacing

RESPONSE FORMAT:
{
  "subject": "Subject line here",
  "body": "Email body here",
  "reasoning": "Brief explanation of approach for this follow-up"
}

Generate the follow-up email:`;

export const BREAKUP_EMAIL_PROMPT = `You are writing a final "breakup" email in a sales sequence. This should professionally close the loop while leaving the door open.

PROSPECT CONTEXT:
- Name: {{prospectName}}
- Title: {{prospectTitle}}
- Company: {{prospectCompany}}

BREAKUP EMAIL REQUIREMENTS:
1. Acknowledge you've reached out several times
2. Respect their time and decision
3. Offer valuable resource with no strings attached
4. Leave door open for future contact
5. Professional and gracious tone
6. 2-3 sentences maximum

RESPONSE FORMAT:
{
  "subject": "Subject line here",
  "body": "Email body here",
  "reasoning": "Brief explanation of approach"
}

Generate the breakup email:`;

export const RESPONSE_ANALYSIS_PROMPT = `Analyze the following email response from a sales prospect and provide detailed insights:

ORIGINAL EMAIL SENT:
{{originalEmail}}

PROSPECT RESPONSE:
{{prospectResponse}}

PROSPECT CONTEXT:
- Name: {{prospectName}}
- Title: {{prospectTitle}}
- Company: {{prospectCompany}}

ANALYSIS REQUIREMENTS:
Analyze the response for:
1. Sentiment (positive, negative, neutral)
2. Intent (interested, not_interested, needs_more_info, pricing_request, meeting_request, out_of_office, unsubscribe)
3. Confidence level (0-100)
4. Key points mentioned
5. Objections or concerns raised
6. Urgency indicators
7. Decision-making authority signals

RESPONSE FORMAT:
{
  "sentiment": "positive|negative|neutral",
  "intent": "interested|not_interested|needs_more_info|pricing_request|meeting_request|out_of_office|unsubscribe",
  "confidence": 85,
  "keyPoints": ["point1", "point2"],
  "objections": ["objection1"],
  "urgencyIndicators": ["indicator1"],
  "decisionMakingAuthority": "high|medium|low",
  "nextSteps": ["suggested action 1", "suggested action 2"],
  "reasoning": "Detailed explanation of analysis"
}

Analyze the response:`;

export function getPromptTemplate(emailType: string): string {
  switch (emailType) {
    case 'cold_outreach':
      return COLD_EMAIL_PROMPT;
    case 'follow_up':
      return FOLLOW_UP_PROMPT;
    case 'breakup':
      return BREAKUP_EMAIL_PROMPT;
    case 'response_analysis':
      return RESPONSE_ANALYSIS_PROMPT;
    default:
      return COLD_EMAIL_PROMPT;
  }
}

export function interpolatePrompt(template: string, context: PromptContext): string {
  let interpolated = template;
  
  Object.entries(context).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    const replacement = Array.isArray(value) ? value.join(', ') : String(value || '');
    interpolated = interpolated.replace(new RegExp(placeholder, 'g'), replacement);
  });
  
  return interpolated;
}

export const EMAIL_TYPES = {
  COLD_OUTREACH: 'cold_outreach',
  FOLLOW_UP: 'follow_up',
  BREAKUP: 'breakup',
  RESPONSE_ANALYSIS: 'response_analysis'
} as const;

export type EmailType = typeof EMAIL_TYPES[keyof typeof EMAIL_TYPES];
