import { Router } from "express";
import { db } from "../db";
import { 
  bestPractices, 
  bestPracticeCategories, 
  bestPracticeRatings,
  users
} from "@shared/schema";
import { eq, and, desc, sql, like, or, ilike } from "drizzle-orm";
import { authenticate, forbidManager, blockSuperAdminFromSDR, requireAdmin } from "../middleware/auth.middleware";
import { z } from "zod";

const router = Router();

const DEFAULT_CATEGORIES = [
  { name: "Email Templates", slug: "email-templates", description: "Ready-to-use email templates for various scenarios", icon: "Mail", color: "#2196F3" },
  { name: "Subject Lines", slug: "subject-lines", description: "High-performing subject line examples", icon: "Type", color: "#FF9800" },
  { name: "Objection Handling", slug: "objection-handling", description: "Responses to common sales objections", icon: "Shield", color: "#F44336" },
  { name: "Industry Guides", slug: "industry-guides", description: "Industry-specific sales strategies", icon: "Briefcase", color: "#4CAF50" },
  { name: "Cold Outreach", slug: "cold-outreach", description: "Best practices for cold emails and calls", icon: "PhoneOutgoing", color: "#9C27B0" },
  { name: "Follow-up Strategies", slug: "follow-up", description: "Effective follow-up techniques", icon: "RefreshCw", color: "#00BCD4" },
  { name: "Meeting Booking", slug: "meeting-booking", description: "Tips for booking more meetings", icon: "Calendar", color: "#E91E63" },
  { name: "Video Tutorials", slug: "video-tutorials", description: "Video guides and walkthroughs", icon: "Video", color: "#673AB7" },
];

const DEFAULT_TEMPLATES = [
  // ═══════════════════════════════════════════════════════════════
  // A. FIRST-TOUCH ADVANCED (3 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "email-templates",
    title: "Assumption-Based Diagnostic Email (Gong-style)",
    description: "Invites correction to start a conversation - proven Gong technique",
    contentType: "template",
    templateSubject: "Quick check on outbound at {{companyName}}",
    templateBody: `<p>{{firstName}},</p>
<p>I might be wrong, but teams at {{companySize}} usually reach a point where outbound volume increases but reply quality drops.</p>
<p>Is improving outbound quality something you're actively focused on, or not a priority right now?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "companyName", "companySize", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 2,
    tags: ["first-touch", "gong-style", "diagnostic", "conversation-starter"],
    isFeatured: true,
  },
  {
    categorySlug: "email-templates",
    title: "Negative Persona Disqualification",
    description: "Reverse psychology technique - Gong-tested pattern",
    contentType: "template",
    templateSubject: "Probably not relevant",
    templateBody: `<p>{{firstName}},</p>
<p>This is likely irrelevant if outbound isn't a serious growth lever at {{companyName}}.</p>
<p>But if reply rates or personalization quality matter, happy to share what we're seeing work.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "companyName", "senderName"],
    difficulty: "advanced",
    estimatedReadTime: 2,
    tags: ["first-touch", "reverse-psychology", "pattern-interrupt"],
    isFeatured: true,
  },
  {
    categorySlug: "email-templates",
    title: "I Looked at Your Funnel Email",
    description: "Shows you've done research on their outbound approach",
    contentType: "template",
    templateSubject: "Question about your outbound funnel",
    templateBody: `<p>{{firstName}},</p>
<p>Took a look at how {{companyName}} approaches outbound.</p>
<p>Most teams optimize volume first, then realize context is the real bottleneck.</p>
<p>Curious where you are on that curve.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "companyName", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 2,
    tags: ["first-touch", "research-based", "funnel-analysis"],
  },

  // ═══════════════════════════════════════════════════════════════
  // B. TRIGGER-BASED (3 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "email-templates",
    title: "Hiring Signal (SDR/GTM Roles)",
    description: "Trigger-based email when company is hiring SDRs",
    contentType: "template",
    templateSubject: "Hiring SDRs?",
    templateBody: `<p>{{firstName}},</p>
<p>Saw {{companyName}} is hiring SDRs.</p>
<p>Teams usually hit a point where headcount scales faster than message quality.</p>
<p>Is that something you're solving right now?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "companyName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 2,
    tags: ["trigger-based", "hiring-signal", "deel-inspired"],
    isFeatured: true,
  },
  {
    categorySlug: "email-templates",
    title: "New Market/Geography Expansion",
    description: "For companies expanding into new regions",
    contentType: "template",
    templateSubject: "Scaling outbound into new markets?",
    templateBody: `<p>{{firstName}},</p>
<p>When teams expand into new regions, templates tend to break before tooling does.</p>
<p>Worth a quick chat if outbound quality matters globally.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 2,
    tags: ["trigger-based", "market-expansion", "global"],
  },
  {
    categorySlug: "email-templates",
    title: "Recently Funded",
    description: "Trigger email for companies that just raised funding",
    contentType: "template",
    templateSubject: "After your recent round",
    templateBody: `<p>{{firstName}},</p>
<p>Congrats on the raise.</p>
<p>Post-funding, most teams increase outbound volume — and lose relevance in the process.</p>
<p>Happy to share what avoids that trap.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 2,
    tags: ["trigger-based", "funding", "congrats"],
  },

  // ═══════════════════════════════════════════════════════════════
  // C. FOUNDER-LED (2 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "email-templates",
    title: "Founder to Founder",
    description: "High-trust founder email for enterprise/senior prospects",
    contentType: "template",
    templateSubject: "Founder to founder",
    templateBody: `<p>{{firstName}},</p>
<p>Founder here.</p>
<p>Built this after watching teams fake personalization at scale.</p>
<p>If outbound quality is even mildly important for {{companyName}}, happy to compare notes.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "companyName", "senderName"],
    difficulty: "advanced",
    estimatedReadTime: 2,
    tags: ["founder-led", "high-trust", "enterprise"],
    isFeatured: true,
  },
  {
    categorySlug: "email-templates",
    title: "Why We Built This",
    description: "Origin story email for founder-led outreach",
    contentType: "template",
    templateSubject: "Why we built this",
    templateBody: `<p>{{firstName}},</p>
<p>We didn't build another outreach tool.</p>
<p>We built a system that refuses to send emails without real context.</p>
<p>Worth a short conversation if that resonates.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "advanced",
    estimatedReadTime: 2,
    tags: ["founder-led", "origin-story", "mission"],
  },

  // ═══════════════════════════════════════════════════════════════
  // D. ENTERPRISE-SAFE (2 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "email-templates",
    title: "Exec Neutral Intro",
    description: "Safe, professional intro for enterprise executives",
    contentType: "template",
    templateSubject: "Quick introduction",
    templateBody: `<p>{{firstName}},</p>
<p>Reaching out briefly.</p>
<p>We work with teams improving outbound relevance at scale.</p>
<p>If this sits in your remit, open to a short intro call.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 2,
    tags: ["enterprise-safe", "executive", "neutral"],
  },
  {
    categorySlug: "email-templates",
    title: "Stakeholder Mapping Email",
    description: "Find the right person to talk to at larger companies",
    contentType: "template",
    templateSubject: "Who owns outbound quality?",
    templateBody: `<p>{{firstName}},</p>
<p>Quick question — who typically owns outbound quality at {{companyName}}?</p>
<p>Want to be respectful of the right owner.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "companyName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 2,
    tags: ["enterprise-safe", "stakeholder-mapping", "navigation"],
  },

  // ═══════════════════════════════════════════════════════════════
  // E. FOLLOW-UPS (4 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "follow-up",
    title: "Soft Nudge (Day 1-3)",
    description: "Gentle first follow-up for early in the sequence",
    contentType: "template",
    templateSubject: "Re: {{previousSubject}}",
    templateBody: `<p>{{firstName}},</p>
<p>Just checking if this is relevant, or if I should close the loop.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "previousSubject", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["follow-up", "day-1-3", "soft-nudge"],
  },
  {
    categorySlug: "follow-up",
    title: "Priority Check (Day 4-6) - Gong Top Performer",
    description: "Ask if this is a priority - proven Gong high-performer technique",
    contentType: "template",
    templateSubject: "Re: {{previousSubject}}",
    templateBody: `<p>{{firstName}},</p>
<p>Should I assume this isn't a priority right now?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "previousSubject", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 1,
    tags: ["follow-up", "day-4-6", "priority-check", "gong-tested"],
    isFeatured: true,
  },
  {
    categorySlug: "follow-up",
    title: "Value Reframe (Day 7-9)",
    description: "Reframe the value proposition in follow-up",
    contentType: "template",
    templateSubject: "Re: {{previousSubject}}",
    templateBody: `<p>{{firstName}},</p>
<p>Most teams come to us after realizing automation scaled volume — not relevance.</p>
<p>Does that resonate at all?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "previousSubject", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 1,
    tags: ["follow-up", "day-7-9", "value-reframe"],
  },
  {
    categorySlug: "follow-up",
    title: "Breakup Email (Day 10+) - High Reply Rate",
    description: "Respectful close that often triggers replies",
    contentType: "template",
    templateSubject: "Re: {{previousSubject}}",
    templateBody: `<p>{{firstName}},</p>
<p>I'll pause outreach for now.</p>
<p>If outbound quality becomes a priority, happy to reconnect.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "previousSubject", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["follow-up", "day-10+", "breakup", "high-reply-rate"],
    isFeatured: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // F. OBJECTION-BASED (3 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "objection-handling",
    title: "We Already Have a Tool",
    description: "Reframe from product to process when they mention competitors",
    contentType: "template",
    templateSubject: "Re: {{previousSubject}}",
    templateBody: `<p>{{firstName}},</p>
<p>Totally fair — most teams do.</p>
<p>The issue usually isn't tooling, it's how context is created before sending.</p>
<p>Worth exploring?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "previousSubject", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 1,
    tags: ["objection-handling", "competitor", "reframe"],
    isFeatured: true,
  },
  {
    categorySlug: "objection-handling",
    title: "Send Me Info Pushback",
    description: "Block the deck request with a clarifying question",
    contentType: "template",
    templateSubject: "Re: {{previousSubject}}",
    templateBody: `<p>{{firstName}},</p>
<p>Happy to — quick question first:</p>
<p>What are you hoping to understand better?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "previousSubject", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 1,
    tags: ["objection-handling", "send-info", "clarifying-question"],
  },
  {
    categorySlug: "objection-handling",
    title: "Not a Priority Response",
    description: "Acknowledge timing and plant seed for future",
    contentType: "template",
    templateSubject: "Re: {{previousSubject}}",
    templateBody: `<p>{{firstName}},</p>
<p>Understood.</p>
<p>When outbound becomes important, this usually becomes urgent fast.</p>
<p>Should I check back later?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "previousSubject", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["objection-handling", "not-priority", "timing"],
  },

  // ═══════════════════════════════════════════════════════════════
  // G. RE-ENGAGEMENT (2 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "email-templates",
    title: "Old Thread Revival",
    description: "Re-engage cold leads from previous conversations",
    contentType: "template",
    templateSubject: "Following up from earlier",
    templateBody: `<p>{{firstName}},</p>
<p>We spoke earlier about outbound quality.</p>
<p>Has anything changed since then, or should I close the loop?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["re-engagement", "revival", "old-leads"],
  },
  {
    categorySlug: "email-templates",
    title: "Still Relevant? Email",
    description: "Check if the conversation is still worth having",
    contentType: "template",
    templateSubject: "Quick check",
    templateBody: `<p>{{firstName}},</p>
<p>Quick check — is this still relevant, or should I move on?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["re-engagement", "relevance-check", "brief"],
  },

  // ═══════════════════════════════════════════════════════════════
  // H. MULTI-CHANNEL (3 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "cold-outreach",
    title: "LinkedIn Connection (No Pitch)",
    description: "Simple LinkedIn connect request without selling",
    contentType: "template",
    templateSubject: "",
    templateBody: `<p>{{firstName}}, following your work at {{companyName}} — would be great to connect.</p>`,
    templateVariables: ["firstName", "companyName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["multi-channel", "linkedin", "connection-request"],
  },
  {
    categorySlug: "cold-outreach",
    title: "LinkedIn After Email",
    description: "Follow up on LinkedIn after sending email",
    contentType: "template",
    templateSubject: "",
    templateBody: `<p>Sent a short note over email. Sharing context here in case it got buried.</p>`,
    templateVariables: [],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["multi-channel", "linkedin", "email-follow-up"],
  },
  {
    categorySlug: "cold-outreach",
    title: "LinkedIn Soft CTA",
    description: "Low-pressure LinkedIn message with soft ask",
    contentType: "template",
    templateSubject: "",
    templateBody: `<p>Curious if outbound quality is something you're actively improving?</p>`,
    templateVariables: [],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["multi-channel", "linkedin", "soft-cta"],
  },

  // ═══════════════════════════════════════════════════════════════
  // I. PSYCHOLOGICAL (3 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "email-templates",
    title: "Pattern Interrupt",
    description: "Break expectations to stand out - use carefully",
    contentType: "template",
    templateSubject: "This isn't a template",
    templateBody: `<p>{{firstName}},</p>
<p>This isn't a template. Most emails pretend to be.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "advanced",
    estimatedReadTime: 1,
    tags: ["psychological", "pattern-interrupt", "advanced"],
  },
  {
    categorySlug: "email-templates",
    title: "Curiosity Gap",
    description: "Create an open loop that drives response",
    contentType: "template",
    templateSubject: "Most teams miss this",
    templateBody: `<p>{{firstName}},</p>
<p>Most teams fix outbound too late. Happy to explain why.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 1,
    tags: ["psychological", "curiosity-gap", "open-loop"],
  },
  {
    categorySlug: "email-templates",
    title: "Social Proof (Soft)",
    description: "Hint at what others are doing without name-dropping",
    contentType: "template",
    templateSubject: "Seeing this come up a lot",
    templateBody: `<p>{{firstName}},</p>
<p>Seeing this come up repeatedly with teams like yours. Worth comparing notes?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 1,
    tags: ["psychological", "social-proof", "peer-comparison"],
  },

  // ═══════════════════════════════════════════════════════════════
  // J. MANAGER/REVOPS (2 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "email-templates",
    title: "Manager Pain Email",
    description: "Speak to manager's oversight challenges",
    contentType: "template",
    templateSubject: "Outbound visibility",
    templateBody: `<p>{{firstName}},</p>
<p>Most managers tell us outbound looks fine — until they read the actual emails.</p>
<p>Is that true for your team?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 1,
    tags: ["manager", "oversight", "visibility"],
  },
  {
    categorySlug: "email-templates",
    title: "RevOps Angle",
    description: "Appeal to RevOps focus on metrics and performance",
    contentType: "template",
    templateSubject: "Outbound performance metrics",
    templateBody: `<p>{{firstName}},</p>
<p>Outbound performance often breaks before dashboards show it.</p>
<p>Is that something you're seeing?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "intermediate",
    estimatedReadTime: 1,
    tags: ["revops", "metrics", "performance"],
  },

  // ═══════════════════════════════════════════════════════════════
  // K. LAST-CHANCE (3 TEMPLATES)
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "email-templates",
    title: "Final Check",
    description: "Binary question to force a decision",
    contentType: "template",
    templateSubject: "Should we talk?",
    templateBody: `<p>{{firstName}},</p>
<p>Before I close this out — should we talk, or not relevant?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["last-chance", "binary", "decision"],
  },
  {
    categorySlug: "email-templates",
    title: "Permission-Based Close",
    description: "Ask permission to stop - often triggers response",
    contentType: "template",
    templateSubject: "Permission to close?",
    templateBody: `<p>{{firstName}},</p>
<p>Would it be okay if I stopped reaching out?</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["last-chance", "permission-based", "close"],
  },
  {
    categorySlug: "email-templates",
    title: "Honest Exit",
    description: "Transparent closing that respects their time",
    contentType: "template",
    templateSubject: "Stepping back",
    templateBody: `<p>{{firstName}},</p>
<p>Feels like timing isn't right. I'll step back unless you say otherwise.</p>
<p>– {{senderName}}</p>`,
    templateVariables: ["firstName", "senderName"],
    difficulty: "beginner",
    estimatedReadTime: 1,
    tags: ["last-chance", "honest", "exit"],
  },

  // ═══════════════════════════════════════════════════════════════
  // GUIDES & ARTICLES
  // ═══════════════════════════════════════════════════════════════
  {
    categorySlug: "subject-lines",
    title: "Subject Line Psychology + AI Decisioning",
    description: "Complete guide to subject line selection based on Gong + HubSpot research",
    contentType: "guide",
    content: `# Subject Lines — Psychology + AI Decisioning

## Core Truth (Gong + HubSpot)
Subject lines don't "sell". They remove friction to open.

Optimize for:
- **Cognitive ease** - Easy to understand at a glance
- **Expectation safety** - Doesn't trigger suspicion
- **Pattern disruption** - Without hype

---

## A. Curiosity (Unknown Buyer / Cold ICP)

**When to Use:**
- No prior engagement
- Mid-market or SMB
- First touch only

**Why It Works:** Humans open to close open loops, not to buy.

**High-Signal Variants:**
- "Quick question, {{firstName}}"
- "Worth exploring?"
- "Outbound at {{companyName}}"
- "Saw something interesting"

**When NOT to Use:**
- ❌ Enterprise
- ❌ CFO / Legal / Security personas
- ❌ Trigger-based outreach (wastes context)

---

## B. Pattern Interrupt (Gong-tested, NOT gimmicky)

**When to Use:**
- Buyer sees a lot of outbound
- SDR / RevOps / Sales leaders
- LinkedIn + Email combo

**Proven Variants:**
- "This is not a template"
- "No pitch inside"
- "Most teams miss this"

**⚠️ Risk Guardrail:** If email body sounds templated, this backfires badly.

---

## C. Data-Based (Credibility-Driven)

**When to Use:**
- RevOps, Ops, Growth roles
- Scale-stage companies
- Insight-led email body

**Why It Works:** Executives open emails that teach, not tease.

**Strong Variants:**
- "Where outbound breaks at scale"
- "Why reply rates drop after month 3"
- "A pattern we're seeing across SDR teams"

---

## D. Executive-Safe (Enterprise / Founder / CXO)

**When to Use:**
- Enterprise domain
- Title contains: CXO, VP, Head
- Founder-led sales

**Why It Works:** Executives punish hype. Neutral = safe.

**Proven Variants:**
- "15 mins?"
- "Brief intro"
- "Quick intro — {{companyName}}"

---

## Subject Line Decision Tree (AI-Ready)

\`\`\`
If persona = Enterprise OR CXO
  → Executive-Safe

Else if trigger_present = true
  → Context-based subject

Else if buyer_unknown = true
  → Curiosity

Else if founder_email = true
  → Plain text, no framing

Else
  → Data-based
\`\`\``,
    difficulty: "intermediate",
    estimatedReadTime: 8,
    tags: ["subject-lines", "psychology", "ai-decisioning", "gong", "hubspot"],
    isFeatured: true,
  },
  {
    categorySlug: "objection-handling",
    title: "Objection Handling — Real Sales (Gong Logic)",
    description: "How to handle common objections using Gong's proven methodology",
    contentType: "guide",
    content: `# Objection Handling — Real Sales (Gong Logic)

## Principle
Objections = interest with friction

**AI Must:**
- Never argue
- Never defend
- Never push feature-first

---

## Objection: "We already use a tool"

**What It Actually Means:**
- "Don't make me rethink my stack"
- "Switching cost anxiety"
- "I don't see delta value yet"

**❌ Bad Response (What to Avoid):**
"We integrate with your tools and offer better features…"

**✅ Soft Response (Conversation Unlock):**
"Makes sense — most teams do. Usually the issue isn't tools, it's how context is created before sending."

**✅ Direct Response (If Pushed):**
"Totally fair. AiSDR doesn't replace your stack — it replaces the manual thinking before outreach."

**Manager Coaching Rule:**
- Reframe process, not product
- If prospect defends tool → you went feature-first too early

---

## Objection: "Send me more info"

**Gong Insight:** This is NOT a buying signal.

**What It Really Means:**
- No urgency
- No clarity
- Polite deflection

**Best Response (Question > Deck):**
"Happy to — before I do, what are you hoping to learn?"

**If They Don't Reply:**
→ Send one short follow-up
→ Then disengage (respect > pressure)`,
    difficulty: "intermediate",
    estimatedReadTime: 6,
    tags: ["objection-handling", "gong", "sales-methodology"],
    isFeatured: true,
  },
  {
    categorySlug: "industry-guides",
    title: "Modern SaaS Outbound (HubSpot + Gong Synthesis)",
    description: "Why outbound broke and the winning model to fix it",
    contentType: "guide",
    content: `# Modern SaaS Outbound

## Why Outbound Broke
- Personalization became fake
- Automation removed relevance
- SDRs optimized for volume, not thought

## The Winning Model

\`\`\`
Context → Hypothesis → Question → Conversation
\`\`\`

## Execution Checklist (AI-Enforced)

✓ **1 insight per message** - Don't overload
✓ **1 persona per sequence** - Don't mix audiences
✓ **1 CTA per touch** - Clear next step
✓ **No pitch before reply** - Earn the right first

## Multi-Channel Sequence (Gong-backed)

| Day | Action |
|-----|--------|
| 1 | Context email |
| 3 | LinkedIn view + connect |
| 5 | Short follow-up (≤40 words) |
| 7 | LinkedIn message |
| 10 | Breakup |

## AI Guardrails
- No CTA repetition
- No channel spam
- No pitch before reply`,
    difficulty: "intermediate",
    estimatedReadTime: 6,
    tags: ["saas", "outbound", "methodology", "hubspot", "gong"],
  },
  {
    categorySlug: "industry-guides",
    title: "Founder-Led Sales (Deel Playbook)",
    description: "When and how founders should sell - based on Deel's approach",
    contentType: "guide",
    content: `# Founder-Led Sales (Deel Playbook)

## Why Founder Sales Works
- **Trust > polish** - Authenticity wins
- **Speed > process** - Move fast
- **Authority > collateral** - You ARE the credibility

## When Founders Should Sell
- New ICP exploration
- Enterprise pilots
- Early GTM (pre-product-market fit)

## Founder Email Rules (Hard Rules)

**❌ Don't:**
- Send decks
- Include case studies
- Use jargon

**✅ Do:**
- Write with clear thinking
- Use plain language
- Ask one sharp question

## Example Founder Email

> {{firstName}},
>
> Founder here.
>
> Built this after watching teams fake personalization at scale.
>
> If outbound quality is even mildly important for {{companyName}}, happy to compare notes.
>
> – {{senderName}}

## Key Insight
The founder's voice carries weight. Don't dilute it with marketing speak.`,
    difficulty: "advanced",
    estimatedReadTime: 5,
    tags: ["founder", "enterprise", "deel", "sales"],
  },
  {
    categorySlug: "follow-up",
    title: "Follow-Up Strategies (Where Deals Are Won)",
    description: "The science of follow-up - 80% of replies come after the 3rd touch",
    contentType: "guide",
    content: `# Follow-Up Strategies

## HubSpot Insight
**80% of replies come after the 3rd touch.**

Most salespeople give up too early. Persistence (done respectfully) wins.

---

## Follow-Up Types

### 1. Nudge (Day 1-3)
> "Just checking if this is relevant, or not worth pursuing right now."

**Purpose:** Light touch, easy to respond to

### 2. Priority Check (Day 4-6)
> "Should I assume outbound isn't a focus at the moment?"

**Purpose:** Force prioritization decision (Gong top performer)

### 3. Value Reframe (Day 7-9)
> "Most teams come to us after realizing automation scaled volume — not relevance."

**Purpose:** Reframe the value proposition

### 4. Breakup (Day 10+)
> "I'll pause outreach for now — feel free to reach out if this becomes relevant."

**Purpose:** Trigger response through scarcity

---

## AI Rule
Breakup emails increase replies when done respectfully.

---

## Tips
1. Never repeat the same CTA twice
2. Each follow-up should add new value or angle
3. Match urgency to their signals
4. Respect the "no" when it comes`,
    difficulty: "beginner",
    estimatedReadTime: 5,
    tags: ["follow-up", "persistence", "hubspot", "cadence"],
  },
  {
    categorySlug: "meeting-booking",
    title: "Meeting Booking — Execution Science",
    description: "CTA formulas and executive rules for booking more meetings",
    contentType: "guide",
    content: `# Meeting Booking — Execution Science

## CTA Formula

**❌ Don't say:**
"Let me know a good time"

**✅ Do say:**
"Open to a 15-min conversation this week?"

**Why:** Specificity removes friction. Vague asks get vague responses.

---

## Executive Rules

### 1. No Calendar Links in Email #1
Executives see calendar links as presumptuous. Earn the right first.

### 2. Time-Boxed Ask
Always specify: "15 minutes" or "20 minutes max"
This reduces perceived commitment.

### 3. Problem-First Framing
Lead with their problem, not your solution.

**❌ Wrong:** "I'd love to show you our platform"
**✅ Right:** "Quick sync on improving reply quality?"

---

## Booking Rate Optimization

| Factor | Impact |
|--------|--------|
| Personalization | +35% |
| Time-boxed ask | +22% |
| Problem framing | +18% |
| Same-week availability | +15% |

---

## After They Say Yes
1. Send calendar invite within 2 hours
2. Include brief agenda (3 bullet points max)
3. Send reminder 24 hours before`,
    difficulty: "beginner",
    estimatedReadTime: 4,
    tags: ["meetings", "booking", "cta", "executive"],
  },
  {
    categorySlug: "video-tutorials",
    title: "Video Learning Resources",
    description: "Curated video tutorials from HubSpot, Gong, and Deel",
    contentType: "article",
    content: `# Video Learning Resources

## HubSpot Videos

### Cold Email Best Practices
⏱ ~12 min | 🎯 Best for: SDRs
📘 Learn what actually drives opens & replies

### Follow-up Cadences That Convert
⏱ ~15 min | 🎯 Best for: SDRs / Managers
📘 Optimal timing and messaging for follow-ups

---

## Gong Labs Videos

### Top Objection Handling Calls
⏱ ~10 min | 🎯 Best for: SDRs
📘 Real call recordings with analysis

### Why Personalization Fails
⏱ ~8 min | 🎯 Best for: RevOps / Managers
📘 Data on what fake personalization costs you

---

## Deel Videos

### Founder-Led Sales Lessons
⏱ ~20 min | 🎯 Best for: Founders
📘 How Deel's founders approached enterprise sales

### Selling to Global Teams
⏱ ~18 min | 🎯 Best for: Founders / Enterprise sellers
📘 Cross-cultural selling best practices`,
    difficulty: "beginner",
    estimatedReadTime: 3,
    tags: ["video", "learning", "hubspot", "gong", "deel"],
  },
];

router.get("/api/best-practices/categories", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    let categories = await db.select().from(bestPracticeCategories).orderBy(bestPracticeCategories.sortOrder);

    if (categories.length === 0) {
      for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
        const cat = DEFAULT_CATEGORIES[i];
        await db.insert(bestPracticeCategories).values({
          ...cat,
          sortOrder: i,
          isActive: true,
        });
      }
      categories = await db.select().from(bestPracticeCategories).orderBy(bestPracticeCategories.sortOrder);
    }

    res.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.get("/api/best-practices", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const { category, contentType, search, featured } = req.query;

    let query = db
      .select({
        id: bestPractices.id,
        categoryId: bestPractices.categoryId,
        title: bestPractices.title,
        slug: bestPractices.slug,
        description: bestPractices.description,
        contentType: bestPractices.contentType,
        author: bestPractices.author,
        industry: bestPractices.industry,
        difficulty: bestPractices.difficulty,
        estimatedReadTime: bestPractices.estimatedReadTime,
        viewCount: bestPractices.viewCount,
        useCount: bestPractices.useCount,
        rating: bestPractices.rating,
        ratingCount: bestPractices.ratingCount,
        tags: bestPractices.tags,
        isFeatured: bestPractices.isFeatured,
        publishedAt: bestPractices.publishedAt,
        categoryName: bestPracticeCategories.name,
        categoryIcon: bestPracticeCategories.icon,
        categoryColor: bestPracticeCategories.color,
      })
      .from(bestPractices)
      .leftJoin(bestPracticeCategories, eq(bestPractices.categoryId, bestPracticeCategories.id))
      .where(eq(bestPractices.isPublished, true))
      .orderBy(desc(bestPractices.isFeatured), desc(bestPractices.viewCount));

    const practices = await query;

    let filtered = practices;
    if (category && category !== "all") {
      filtered = filtered.filter(p => p.categoryId === category);
    }
    if (contentType && contentType !== "all") {
      filtered = filtered.filter(p => p.contentType === contentType);
    }
    if (search) {
      const searchLower = (search as string).toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower) ||
        p.tags?.some(t => t.toLowerCase().includes(searchLower))
      );
    }
    if (featured === "true") {
      filtered = filtered.filter(p => p.isFeatured);
    }

    res.json({ practices: filtered });
  } catch (error) {
    console.error("Error fetching best practices:", error);
    res.status(500).json({ error: "Failed to fetch best practices" });
  }
});

router.get("/api/best-practices/:slug", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const { slug } = req.params;

    const practice = await db.query.bestPractices.findFirst({
      where: eq(bestPractices.slug, slug),
    });

    if (!practice) {
      return res.status(404).json({ error: "Best practice not found" });
    }

    await db.update(bestPractices)
      .set({ viewCount: (practice.viewCount || 0) + 1 })
      .where(eq(bestPractices.id, practice.id));

    const category = practice.categoryId 
      ? await db.query.bestPracticeCategories.findFirst({
          where: eq(bestPracticeCategories.id, practice.categoryId)
        })
      : null;

    res.json({ practice: { ...practice, category } });
  } catch (error) {
    console.error("Error fetching best practice:", error);
    res.status(500).json({ error: "Failed to fetch best practice" });
  }
});

router.post("/api/best-practices/:id/use", authenticate, forbidManager, async (req, res) => {
  try {
    const { id } = req.params;

    const practice = await db.query.bestPractices.findFirst({
      where: eq(bestPractices.id, id),
    });

    if (!practice) {
      return res.status(404).json({ error: "Best practice not found" });
    }

    await db.update(bestPractices)
      .set({ useCount: (practice.useCount || 0) + 1 })
      .where(eq(bestPractices.id, id));

    res.json({ 
      success: true,
      templateSubject: practice.templateSubject,
      templateBody: practice.templateBody,
      templateVariables: practice.templateVariables,
    });
  } catch (error) {
    console.error("Error using template:", error);
    res.status(500).json({ error: "Failed to use template" });
  }
});

router.post("/api/best-practices/:id/rate", authenticate, forbidManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.userId) {
      return res.status(403).json({ error: "Authentication required" });
    }

    const { id } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const existingRating = await db.query.bestPracticeRatings.findFirst({
      where: and(
        eq(bestPracticeRatings.bestPracticeId, id),
        eq(bestPracticeRatings.userId, userContext.userId)
      )
    });

    if (existingRating) {
      await db.update(bestPracticeRatings)
        .set({ rating, feedback })
        .where(eq(bestPracticeRatings.id, existingRating.id));
    } else {
      await db.insert(bestPracticeRatings).values({
        bestPracticeId: id,
        userId: userContext.userId,
        rating,
        feedback,
      });
    }

    const [avgRating] = await db
      .select({
        avg: sql<number>`avg(${bestPracticeRatings.rating})::real`,
        count: sql<number>`count(*)::int`,
      })
      .from(bestPracticeRatings)
      .where(eq(bestPracticeRatings.bestPracticeId, id));

    await db.update(bestPractices)
      .set({
        rating: avgRating.avg || 0,
        ratingCount: avgRating.count || 0,
      })
      .where(eq(bestPractices.id, id));

    res.json({ success: true, newRating: avgRating.avg, ratingCount: avgRating.count });
  } catch (error) {
    console.error("Error rating best practice:", error);
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

router.post("/api/best-practices/seed", authenticate, requireAdmin, async (req, res) => {
  try {
    const categories = await db.select().from(bestPracticeCategories);
    const categoryMap = new Map(categories.map(c => [c.slug, c.id]));

    for (const template of DEFAULT_TEMPLATES) {
      const categoryId = categoryMap.get(template.categorySlug);
      const slug = template.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const existing = await db.query.bestPractices.findFirst({
        where: eq(bestPractices.slug, slug)
      });

      if (!existing) {
        await db.insert(bestPractices).values({
          categoryId,
          title: template.title,
          slug,
          description: template.description,
          content: template.content,
          contentType: template.contentType,
          templateSubject: template.templateSubject,
          templateBody: template.templateBody,
          templateVariables: template.templateVariables,
          difficulty: template.difficulty,
          estimatedReadTime: template.estimatedReadTime,
          tags: template.tags,
          isPublished: true,
          isFeatured: false,
          publishedAt: new Date(),
        });
      }
    }

    res.json({ success: true, message: "Best practices seeded successfully" });
  } catch (error) {
    console.error("Error seeding best practices:", error);
    res.status(500).json({ error: "Failed to seed best practices" });
  }
});

export default router;
