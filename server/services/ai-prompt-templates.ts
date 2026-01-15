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
  previousEmails?: string;  // Changed from string[] to string for better formatting
  sequenceStep?: number;
  tone?: 'professional' | 'casual' | 'urgent' | 'friendly';
  contentLibrary?: string;
  prospectContext?: string;
  linkedinUrl?: string;
  campaignStage?: 'first_touch' | 'follow_up' | 'objection' | 'post_demo' | 'breakup' | 're_engagement';
  daysSinceLastTouch?: number;
  replyType?: 'positive' | 'neutral' | 'objection' | 'no_reply' | 'silence';
  triggerDetected?: 'hiring' | 'funding' | 'expansion' | 'new_role' | 'none';
  icpType?: 'smb' | 'mid_market' | 'enterprise';
  userRole?: 'sdr' | 'manager' | 'founder' | 'revops';
}

// ============================================================================
// AI DECISION ENGINE RULES - Best Practices for Message Selection
// ============================================================================

export const AI_DECISION_ENGINE_RULES = `
🎯 CORE OBJECTIVE
For every message, answer: "What is the single best message to send to this prospect right now?"

📋 HARD ELIMINATION (NON-NEGOTIABLE)
Immediately discard messages that:
- Don't match campaign stage
- Don't match user role appropriateness
- Were used in the last 7 days
- Repeat the same CTA as last message
- Exceed 120 words
- Pitch product in First Touch or Follow-up
- Contain multiple questions

🧠 DECISION TABLE (FIXED RULES)

FIRST TOUCH:
- Founder + Enterprise → Founder-to-Founder intro
- SDR + Trigger → Trigger-based email
- SDR + No trigger → Assumption-based diagnostic email
- Manager → Stakeholder-mapping email
- RevOps → RevOps Angle email

FOLLOW-UP (NO REPLY):
- Day ≤ 3 → Soft nudge
- Day 4–6 → Priority check
- Day 7–9 → Value reframe
- Day ≥ 10 → Breakup

OBJECTION RECEIVED:
- "Not a priority" → Urgency reframe (Not a Priority template)
- "Send info" → Clarifying question (Send Me Info Pushback - block decks)
- "We use X" → Tool vs process reframing (We Already Have a Tool)
- Vague response → Question-based follow-up

POST-DEMO SILENCE:
- Use silence breaker
- Never re-pitch features
- Ask one prioritization question

RE-ENGAGEMENT (OLD LEADS):
- Cold thread → Old Thread Revival
- Unknown status → Still Relevant? Email
- Last chance → Permission-Based Close

🎯 SINGLE INTENT MATCHING
Each stage has ONE allowed intent:
- First Touch → Start a conversation
- Follow-up → Force prioritization
- Objection → Reframe thinking
- Post-demo → Restore urgency
- Breakup → Trigger response
- Re-engagement → Validate relevance

📊 TEMPLATE CATEGORIES (30 PROVEN PATTERNS)
Templates are NOT a flat list. They are:
- Tagged by intent (first_touch, follow_up, objection, breakup, re_engagement)
- Mapped to sequence stage (day range, trigger, user role)
- Recommended by AI based on prospect context and user action

CATEGORY MAPPING:
A. First-Touch Advanced (3): Assumption-Based, Negative Persona, Funnel Analysis
B. Trigger-Based (3): Hiring Signal, Market Expansion, Recently Funded
C. Founder-Led (2): Founder-to-Founder, Why We Built This
D. Enterprise-Safe (2): Exec Neutral, Stakeholder Mapping
E. Follow-Ups (4): Soft Nudge, Priority Check, Value Reframe, Breakup
F. Objection-Based (3): Already Have Tool, Send Me Info, Not Priority
G. Re-Engagement (2): Old Thread Revival, Still Relevant
H. Multi-Channel (3): LinkedIn Connection, After Email, Soft CTA
I. Psychological (3): Pattern Interrupt, Curiosity Gap, Social Proof
J. Manager/RevOps (2): Manager Pain, RevOps Angle
K. Last-Chance (3): Final Check, Permission Close, Honest Exit

🚫 HARD GUARDRAILS (BLOCK IF VIOLATED)
- Message sounds like a pitch in First Touch
- More than one CTA exists
- Message repeats previous CTA
- Message is longer than 130 words
- Calendar links are used in first email
- Fake personalization tokens detected
- Template shown without context match
`;

// ============================================================================
// PROVEN EMAIL TEMPLATES BY CATEGORY
// ============================================================================

export const EMAIL_TEMPLATE_LIBRARY = {
  // A. FIRST-TOUCH ADVANCED CONTEXT-LED
  first_touch: {
    assumption_diagnostic: {
      name: "Assumption-Based Diagnostic Email (Gong-style)",
      subject: "Quick check on outbound at {{Company}}",
      body: `{{FirstName}},

I might be wrong, but teams at {{CompanySize}} usually reach a point where outbound volume increases but reply quality drops.

Is improving outbound quality something you're actively focused on, or not a priority right now?

– {{SenderName}}`,
      why: "Invites correction → conversation"
    },
    negative_persona: {
      name: "Negative Persona Disqualification",
      subject: "Probably not relevant",
      body: `{{FirstName}},

This is likely irrelevant if outbound isn't a serious growth lever at {{Company}}.

But if reply rates or personalization quality matter, happy to share what we're seeing work.

– {{SenderName}}`,
      why: "Reverse psychology (Gong-tested)"
    },
    funnel_analysis: {
      name: "I Looked at Your Funnel Email",
      subject: "Question about your outbound funnel",
      body: `{{FirstName}},

Took a look at how {{Company}} approaches outbound.

Most teams optimize volume first, then realize context is the real bottleneck.

Curious where you are on that curve.

– {{SenderName}}`
    }
  },

  // B. TRIGGER-BASED (DEEL-INSPIRED)
  trigger_based: {
    hiring_signal: {
      name: "Hiring Signal (SDR/GTM roles)",
      subject: "Hiring SDRs?",
      body: `{{FirstName}},

Saw {{Company}} is hiring SDRs.

Teams usually hit a point where headcount scales faster than message quality.

Is that something you're solving right now?

– {{SenderName}}`
    },
    market_expansion: {
      name: "New Market/Geography Expansion",
      subject: "Scaling outbound into new markets?",
      body: `{{FirstName}},

When teams expand into new regions, templates tend to break before tooling does.

Worth a quick chat if outbound quality matters globally.

– {{SenderName}}`
    },
    recently_funded: {
      name: "Recently Funded",
      subject: "After your recent round",
      body: `{{FirstName}},

Congrats on the raise.

Post-funding, most teams increase outbound volume — and lose relevance in the process.

Happy to share what avoids that trap.

– {{SenderName}}`
    }
  },

  // C. FOUNDER-LED (HIGH-TRUST)
  founder_led: {
    founder_to_founder: {
      name: "Founder → Founder",
      subject: "Founder to founder",
      body: `{{FirstName}},

Founder here.

Built this after watching teams fake personalization at scale.

If outbound quality is even mildly important for {{Company}}, happy to compare notes.

– {{SenderName}}`
    },
    why_we_built: {
      name: "Why We Built This",
      subject: "Why we built this",
      body: `{{FirstName}},

We didn't build another outreach tool.

We built a system that refuses to send emails without real context.

Worth a short conversation if that resonates.

– {{SenderName}}`
    }
  },

  // D. ENTERPRISE-SAFE (NO HYPE)
  enterprise: {
    exec_neutral: {
      name: "Exec Neutral Intro",
      subject: "Quick introduction",
      body: `{{FirstName}},

Reaching out briefly.

We work with teams improving outbound relevance at scale.

If this sits in your remit, open to a short intro call.

– {{SenderName}}`
    },
    stakeholder_mapping: {
      name: "Stakeholder Mapping Email",
      subject: "Who owns outbound quality?",
      body: `{{FirstName}},

Quick question — who typically owns outbound quality at {{Company}}?

Want to be respectful of the right owner.

– {{SenderName}}`
    }
  },

  // E. FOLLOW-UPS (WHERE DEALS ARE WON)
  follow_up: {
    soft_nudge: {
      name: "Soft Nudge",
      dayRange: [1, 3],
      body: "Just checking if this is relevant, or if I should close the loop."
    },
    priority_check: {
      name: "Priority Check (Gong top performer)",
      dayRange: [4, 6],
      body: "Should I assume this isn't a priority right now?"
    },
    value_reframe: {
      name: "Value Reframe Follow-up",
      dayRange: [7, 9],
      body: `Most teams come to us after realizing automation scaled volume — not relevance.

Does that resonate at all?`
    },
    breakup: {
      name: "Breakup (High Reply Rate)",
      dayRange: [10, 999],
      body: `I'll pause outreach for now.

If outbound quality becomes a priority, happy to reconnect.`
    }
  },

  // F. OBJECTION-BASED OUTREACH
  objection: {
    already_have_tool: {
      name: "We Already Have a Tool",
      trigger: "We use X",
      body: `Totally fair — most teams do.

The issue usually isn't tooling, it's how context is created before sending.

Worth exploring?`
    },
    send_me_info: {
      name: "Send Me Info Pushback",
      trigger: "send info",
      body: `Happy to — quick question first:

What are you hoping to understand better?`
    },
    not_priority: {
      name: "Not a Priority",
      trigger: "not a priority",
      body: `Understood.

When outbound becomes important, this usually becomes urgent fast.

Should I check back later?`
    }
  },

  // G. RE-ENGAGEMENT / REVIVAL
  re_engagement: {
    old_thread_revival: {
      name: "Old Thread Revival",
      body: `We spoke earlier about outbound quality.

Has anything changed since then, or should I close the loop?`
    },
    still_relevant: {
      name: "Still Relevant? Email",
      body: "Quick check — is this still relevant, or should I move on?"
    }
  },

  // H. MULTI-CHANNEL SUPPORT
  multi_channel: {
    linkedin_connection: {
      name: "LinkedIn Connection (No Pitch)",
      channel: "linkedin",
      body: "{{FirstName}}, following your work at {{Company}} — would be great to connect."
    },
    linkedin_after_email: {
      name: "LinkedIn After Email",
      channel: "linkedin",
      body: "Sent a short note over email. Sharing context here in case it got buried."
    },
    linkedin_soft_cta: {
      name: "LinkedIn Soft CTA",
      channel: "linkedin",
      body: "Curious if outbound quality is something you're actively improving?"
    }
  },

  // I. ADVANCED PSYCHOLOGICAL ANGLES
  psychological: {
    pattern_interrupt: {
      name: "Pattern Interrupt",
      body: "This isn't a template. Most emails pretend to be."
    },
    curiosity_gap: {
      name: "Curiosity Gap",
      body: "Most teams fix outbound too late. Happy to explain why."
    },
    social_proof_soft: {
      name: "Social Proof (Soft)",
      body: "Seeing this come up repeatedly with teams like yours. Worth comparing notes?"
    }
  },

  // J. MANAGER / REVOPS OUTREACH
  manager_revops: {
    manager_pain: {
      name: "Manager Pain Email",
      body: `Most managers tell us outbound looks fine — until they read the actual emails.

Is that true for your team?`
    },
    revops_angle: {
      name: "RevOps Angle",
      body: `Outbound performance often breaks before dashboards show it.

Is that something you're seeing?`
    }
  },

  // K. LAST-CHANCE / DECISION EMAILS
  last_chance: {
    final_check: {
      name: "Final Check",
      body: "Before I close this out — should we talk, or not relevant?"
    },
    permission_close: {
      name: "Permission-Based Close",
      body: "Would it be okay if I stopped reaching out?"
    },
    honest_exit: {
      name: "Honest Exit",
      body: "Feels like timing isn't right. I'll step back unless you say otherwise."
    }
  }
};

export const COLD_EMAIL_PROMPT = `You are an expert sales development representative for Increff, writing personalized cold emails. Generate a compelling cold outreach email using the following information:

PROSPECT DETAILS:
{{prospectContext}}

INCREFF SOLUTIONS (use these specific details):
{{contentLibrary}}

TONE SETTING: {{tone}}
- If "professional": Use formal language, complete sentences, avoid contractions
- If "casual": Use conversational language, contractions allowed, friendly but not unprofessional
- If "friendly": Warm and approachable, like reaching out to a colleague
- If "urgent": Direct and action-oriented, emphasize time-sensitivity

🎯 AI DECISION ENGINE RULES (FOLLOW STRICTLY):
Your job is to decide what message to send, not just generate copy.

FIRST TOUCH DECISION TABLE:
- Founder + Enterprise → Use Founder-to-Founder intro style
- SDR + Trigger detected → Use trigger-based email (hiring, funding, expansion)
- SDR + No trigger → Use assumption-based diagnostic email
- Manager → Use stakeholder-mapping email style

SINGLE INTENT: First Touch emails have ONE goal - Start a conversation
- DO NOT pitch product features
- DO NOT use multiple CTAs
- DO use assumption-based diagnostic questions that invite correction

PROVEN FIRST-TOUCH PATTERNS:
1. Assumption-Based Diagnostic: "I might be wrong, but teams at [size] usually..." - invites correction
2. Negative Persona: "This is likely irrelevant if X isn't a priority..." - reverse psychology
3. Funnel Analysis: "Most teams optimize volume first, then realize context is the bottleneck" - curiosity gap

CRITICAL RULES:
1. **Use ONLY the prospect information provided above** - if a field is missing, DO NOT make assumptions or add generic details
2. **Reference their SPECIFIC role/company** - use their actual job title and company name
3. **Match their industry** - if they're in fashion/retail/footwear, mention relevant Increff solutions for that vertical
4. **Be direct and specific** - no fluff, no generic praise, no assumptions

HALLUCINATION PREVENTION (CRITICAL):
⚠️ If company name is "Unknown" or missing: Use "your company" instead
⚠️ If industry is "Unknown" or missing: Use role-based language only, do NOT guess the industry
⚠️ NEVER fabricate company achievements, revenue, news, or recent events
⚠️ NEVER claim to know specific challenges unless explicitly provided
⚠️ When data is limited, focus on ROLE-SPECIFIC challenges that are universal to that job title
⚠️ Do NOT write phrases like "I noticed [company] recently..." unless recent news is explicitly provided

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
❌ "I noticed [company] recently..." (unless recent news is provided)
❌ Any fabricated claims about the company
❌ Any generic industry assumptions

REQUIRED:
✅ Use their exact job title
✅ Use their exact company name (or "your company" if unknown)
✅ Include specific numbers from content library (13%, 26%, 36%, etc.)
✅ End with a question mark
✅ Keep it under 80 words
✅ Focus on THEIR problem, not our product
✅ Match the specified TONE throughout

RESPONSE FORMAT:
{
  "subject": "Subject line here",
  "body": "Email body here",
  "reasoning": "Brief explanation of personalization choices and tone adherence"
}

Generate the email now:`;

export const FOLLOW_UP_PROMPT = `You are writing a follow-up email as part of a sales sequence. This is step {{sequenceStep}} in the sequence.

PROSPECT CONTEXT:
- Name: {{prospectName}}
- Title: {{prospectTitle}}
- Company: {{prospectCompany}}
- Industry: {{prospectIndustry}}

PREVIOUS EMAIL CONVERSATION:
{{previousEmails}}

TONE SETTING: {{tone}}
- If "professional": Use formal language, complete sentences, avoid contractions
- If "casual": Use conversational language, contractions allowed, friendly but not unprofessional  
- If "friendly": Warm and approachable, like reaching out to a colleague
- If "urgent": Direct and action-oriented, emphasize time-sensitivity

🎯 AI DECISION ENGINE - FOLLOW-UP RULES (FOLLOW STRICTLY):

SINGLE INTENT: Follow-up emails have ONE goal - Force prioritization
- DO NOT re-pitch features
- DO NOT send generic "checking in" messages
- DO use psychological contrast from previous message

FOLLOW-UP DECISION TABLE (BASED ON DAYS SINCE LAST TOUCH):
- Day 1-3 → Soft Nudge: "Just checking if this is relevant, or if I should close the loop."
- Day 4-6 → Priority Check: "Should I assume this isn't a priority right now?" (Gong top performer)
- Day 7-9 → Value Reframe: "Most teams come to us after realizing automation scaled volume — not relevance. Does that resonate?"
- Day 10+ → Breakup: "I'll pause outreach for now. If this becomes a priority, happy to reconnect."

PATTERN BREAK SELECTION:
Between valid options, choose the message that:
- Changes tone vs last message
- Changes question type
- Reduces word count
- Increases psychological contrast
Prefer difference over creativity.

CRITICAL FOLLOW-UP REQUIREMENTS:
1. **MUST reference the previous email's topic/content** - Show you're following up on the same conversation
2. Build naturally upon what was discussed in the previous email
3. Add a NEW angle, insight, or value proposition related to the original topic
4. Keep it brief (2-3 sentences maximum)
5. Create gentle urgency without being pushy
6. Include a different but related call-to-action
7. Match the specified TONE throughout

HALLUCINATION PREVENTION (CRITICAL):
⚠️ If company is "Unknown": Use "your company" instead
⚠️ NEVER fabricate what happened since the last email
⚠️ NEVER claim to have found news or updates about the company
⚠️ Do NOT invent meetings, calls, or interactions that didn't happen
⚠️ Stick to role-based value propositions when company data is limited

EXAMPLE GOOD FOLLOW-UP:
Previous: Discussed inventory challenges at scale
Follow-up: "Hi {{prospectName}}, following up on inventory allocation - wanted to share how [specific example] reduced stockouts by 36%. Quick 15-min call to discuss your current setup?"

FORBIDDEN:
❌ Starting fresh with a completely new topic
❌ Ignoring what was discussed in the previous email
❌ Generic "just checking in" messages
❌ Not referencing the previous conversation
❌ Fabricating company news or events

If this is step 3 or higher, acknowledge the lack of response professionally and offer an easy out.

FORMATTING REQUIREMENTS:
- Add blank lines between paragraphs for readability
- Separate each sentence/section with \n\n for proper spacing

RESPONSE FORMAT:
{
  "subject": "Re: [Reference to previous subject]",
  "body": "Email body here",
  "reasoning": "Brief explanation of how this follow-up builds on the previous email and adheres to tone"
}

Generate the follow-up email that clearly references and builds upon the previous conversation:`;

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

export const OBJECTION_RESPONSE_PROMPT = `You are crafting a response to a prospect objection. Your goal is to reframe their thinking, not overcome resistance.

PROSPECT CONTEXT:
- Name: {{prospectName}}
- Title: {{prospectTitle}}
- Company: {{prospectCompany}}

OBJECTION RECEIVED:
{{prospectResponse}}

PREVIOUS CONVERSATION:
{{previousEmails}}

🎯 AI DECISION ENGINE - OBJECTION HANDLING (FOLLOW STRICTLY):

SINGLE INTENT: Objection emails have ONE goal - Reframe thinking
- DO NOT become defensive or pushy
- DO NOT dump more features/benefits
- DO ask ONE clarifying question
- DO acknowledge their perspective first

OBJECTION DECISION TABLE:
- "Not a priority" → Urgency Reframe: "Understood. When outbound becomes important, this usually becomes urgent fast. Should I check back later?"
- "Send me info" → Clarifying Question (BLOCK DECKS): "Happy to — quick question first: What are you hoping to understand better?"
- "We already use X" → Tool vs Process Reframe: "Totally fair — most teams do. The issue usually isn't tooling, it's how context is created before sending. Worth exploring?"
- Vague response → Question-based follow-up: Ask ONE specific question about their situation

HARD GUARDRAILS:
🚫 NEVER send attachments or decks when they ask "send me info"
🚫 NEVER use multiple CTAs
🚫 NEVER exceed 60 words for objection responses
🚫 NEVER re-pitch features in response to objections

RESPONSE PATTERNS:
1. Acknowledge → Reframe → Single Question
2. Keep response under 60 words
3. End with ONE question mark

RESPONSE FORMAT:
{
  "subject": "Re: [Previous subject]",
  "body": "Your response here - under 60 words, ONE question only",
  "reasoning": "Why this reframe works for this specific objection"
}

Generate the objection response:`;

export const RE_ENGAGEMENT_PROMPT = `You are writing a re-engagement email to revive a cold thread with a prospect you've previously contacted.

PROSPECT CONTEXT:
- Name: {{prospectName}}
- Title: {{prospectTitle}}
- Company: {{prospectCompany}}

TIME SINCE LAST CONTACT: Significant time has passed since your last outreach.

PREVIOUS CONVERSATION:
{{previousEmails}}

🎯 AI DECISION ENGINE - RE-ENGAGEMENT RULES:

SINGLE INTENT: Re-engagement has ONE goal - Check if situation has changed
- DO NOT reference specific time periods (they know it's been a while)
- DO acknowledge previous conversation exists
- DO give them an easy exit option

PROVEN RE-ENGAGEMENT PATTERNS:
1. Old Thread Revival: "We spoke earlier about [topic]. Has anything changed since then, or should I close the loop?"
2. Still Relevant Check: "Quick check — is this still relevant, or should I move on?"
3. Permission-Based Close: "Would it be okay if I stopped reaching out?"

HARD GUARDRAILS:
🚫 NEVER apologize for reaching out
🚫 NEVER re-pitch from scratch
🚫 Keep under 40 words

RESPONSE FORMAT:
{
  "subject": "Re: [Previous subject] - quick check",
  "body": "Your re-engagement message - under 40 words",
  "reasoning": "Why this approach works for revival"
}

Generate the re-engagement email:`;

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
    case 'objection_response':
      return OBJECTION_RESPONSE_PROMPT;
    case 're_engagement':
      return RE_ENGAGEMENT_PROMPT;
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

export function getTemplateForContext(context: Partial<PromptContext>): {
  template: any;
  templateName: string;
  reasoning: string;
} {
  const { campaignStage, daysSinceLastTouch, replyType, triggerDetected, icpType, userRole } = context;
  
  if (campaignStage === 'first_touch') {
    if (userRole === 'founder' && icpType === 'enterprise') {
      return {
        template: EMAIL_TEMPLATE_LIBRARY.founder_led.founder_to_founder,
        templateName: 'Founder → Founder',
        reasoning: 'Founder reaching out to enterprise - use high-trust founder-to-founder intro'
      };
    }
    if (triggerDetected && triggerDetected !== 'none') {
      const triggerTemplates: Record<string, any> = {
        hiring: EMAIL_TEMPLATE_LIBRARY.trigger_based.hiring_signal,
        funding: EMAIL_TEMPLATE_LIBRARY.trigger_based.recently_funded,
        expansion: EMAIL_TEMPLATE_LIBRARY.trigger_based.market_expansion,
        new_role: EMAIL_TEMPLATE_LIBRARY.first_touch.assumption_diagnostic
      };
      return {
        template: triggerTemplates[triggerDetected] || EMAIL_TEMPLATE_LIBRARY.first_touch.assumption_diagnostic,
        templateName: `Trigger-based (${triggerDetected})`,
        reasoning: `Detected ${triggerDetected} trigger - use relevant trigger-based email`
      };
    }
    if (userRole === 'manager') {
      return {
        template: EMAIL_TEMPLATE_LIBRARY.enterprise.stakeholder_mapping,
        templateName: 'Stakeholder Mapping',
        reasoning: 'Manager role - use stakeholder mapping to find right owner'
      };
    }
    return {
      template: EMAIL_TEMPLATE_LIBRARY.first_touch.assumption_diagnostic,
      templateName: 'Assumption-Based Diagnostic',
      reasoning: 'Default first touch - use assumption-based diagnostic that invites correction'
    };
  }
  
  if (campaignStage === 'follow_up' && replyType === 'no_reply') {
    const days = daysSinceLastTouch || 0;
    if (days <= 3) {
      return {
        template: EMAIL_TEMPLATE_LIBRARY.follow_up.soft_nudge,
        templateName: 'Soft Nudge',
        reasoning: `Day ${days} - use soft nudge without pressure`
      };
    }
    if (days <= 6) {
      return {
        template: EMAIL_TEMPLATE_LIBRARY.follow_up.priority_check,
        templateName: 'Priority Check',
        reasoning: `Day ${days} - use Gong-tested priority check question`
      };
    }
    if (days <= 9) {
      return {
        template: EMAIL_TEMPLATE_LIBRARY.follow_up.value_reframe,
        templateName: 'Value Reframe',
        reasoning: `Day ${days} - reframe value proposition with new angle`
      };
    }
    return {
      template: EMAIL_TEMPLATE_LIBRARY.follow_up.breakup,
      templateName: 'Breakup',
      reasoning: `Day ${days}+ - time for breakup email (high reply rate)`
    };
  }
  
  if (campaignStage === 'objection' || replyType === 'objection') {
    return {
      template: EMAIL_TEMPLATE_LIBRARY.objection.not_priority,
      templateName: 'Objection Response',
      reasoning: 'Objection received - use reframing approach'
    };
  }
  
  if (campaignStage === 're_engagement') {
    return {
      template: EMAIL_TEMPLATE_LIBRARY.re_engagement.old_thread_revival,
      templateName: 'Old Thread Revival',
      reasoning: 'Re-engagement - check if situation has changed'
    };
  }
  
  return {
    template: EMAIL_TEMPLATE_LIBRARY.first_touch.assumption_diagnostic,
    templateName: 'Assumption-Based Diagnostic',
    reasoning: 'Default fallback - use safe assumption-based approach'
  };
}

export const EMAIL_TYPES = {
  COLD_OUTREACH: 'cold_outreach',
  FOLLOW_UP: 'follow_up',
  BREAKUP: 'breakup',
  RESPONSE_ANALYSIS: 'response_analysis',
  OBJECTION_RESPONSE: 'objection_response',
  RE_ENGAGEMENT: 're_engagement'
} as const;

export type EmailType = typeof EMAIL_TYPES[keyof typeof EMAIL_TYPES];
