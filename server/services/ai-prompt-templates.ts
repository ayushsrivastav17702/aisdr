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
}

export const COLD_EMAIL_PROMPT = `You are an expert sales development representative writing personalized cold emails. Generate a compelling cold outreach email based on the following context:

PROSPECT INFORMATION:
- Name: {{prospectName}}
- Title: {{prospectTitle}}
- Company: {{prospectCompany}}
- Industry: {{prospectIndustry}}
- Seniority Level: {{prospectSeniority}}
- Company Size: {{companySize}}

COMPANY CONTEXT:
- Recent News: {{recentNews}}
- Key Pain Points for {{prospectTitle}}: {{painPoints}}

EMAIL REQUIREMENTS:
1. Subject line should be personalized and curiosity-driven (5-8 words)
2. Email body should be 3-4 sentences maximum
3. Include specific reference to their company or recent developments
4. Focus on ONE clear value proposition relevant to their role
5. End with a soft, low-pressure call-to-action
6. Tone: {{tone}}
7. Avoid generic sales language and buzzwords

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
