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
  {
    categorySlug: "email-templates",
    title: "Cold Outreach - Value Proposition",
    description: "A proven template for initial cold outreach focusing on value",
    contentType: "template",
    templateSubject: "Quick question about {{companyName}}'s growth",
    templateBody: `<p>Hi {{firstName}},</p>
<p>I noticed {{companyName}} is expanding in the {{industry}} space - congratulations on the growth!</p>
<p>I'm reaching out because we've helped similar companies like [Competitor/Similar Company] achieve [Specific Result] in just [Timeframe].</p>
<p>Would you be open to a quick 15-minute call this week to explore if we could help {{companyName}} achieve similar results?</p>
<p>Best,</p>`,
    templateVariables: ["firstName", "companyName", "industry"],
    difficulty: "beginner",
    estimatedReadTime: 2,
    tags: ["cold-outreach", "value-prop", "sdr"],
  },
  {
    categorySlug: "email-templates",
    title: "Follow-up - After No Response",
    description: "Gentle follow-up when you haven't received a reply",
    contentType: "template",
    templateSubject: "Re: {{previousSubject}}",
    templateBody: `<p>Hi {{firstName}},</p>
<p>I wanted to follow up on my previous email. I understand you're busy, so I'll keep this brief.</p>
<p>We recently helped [Similar Company] solve [Problem] and achieve [Result]. I think we could do the same for {{companyName}}.</p>
<p>Do you have 15 minutes this week for a quick call?</p>
<p>Thanks!</p>`,
    templateVariables: ["firstName", "companyName", "previousSubject"],
    difficulty: "beginner",
    estimatedReadTime: 2,
    tags: ["follow-up", "persistence", "sdr"],
  },
  {
    categorySlug: "objection-handling",
    title: "Handling 'Not Interested' Response",
    description: "How to respond professionally when a prospect says they're not interested",
    contentType: "guide",
    content: `# Handling "Not Interested" Responses

## The Key Principle
Never burn bridges. A "not interested" today doesn't mean "never interested."

## Recommended Response

**Step 1: Acknowledge**
"I completely understand, and I appreciate you taking the time to respond."

**Step 2: Ask for Permission**
"Would it be okay if I followed up in [3-6 months] to see if things have changed?"

**Step 3: Offer Value**
"In the meantime, I'd love to send you [relevant resource] - no strings attached."

## What NOT to Do
- Don't argue or push back
- Don't immediately pitch again
- Don't guilt-trip the prospect

## Pro Tips
1. Add to a long-term nurture sequence
2. Set a reminder to follow up later
3. Connect on LinkedIn for soft touches`,
    difficulty: "intermediate",
    estimatedReadTime: 5,
    tags: ["objection-handling", "rejection", "persistence"],
  },
  {
    categorySlug: "subject-lines",
    title: "High-Converting Subject Lines",
    description: "Collection of subject lines with proven high open rates",
    contentType: "article",
    content: `# High-Converting Subject Lines for Cold Outreach

## Question-Based Subject Lines
- "Quick question about {{companyName}}"
- "Struggling with {{painPoint}}?"
- "Is {{companyName}} using {{technology}}?"

## Curiosity-Driven Subject Lines
- "Idea for {{companyName}}"
- "Noticed something about {{companyName}}"
- "[Mutual Connection] suggested I reach out"

## Value-Focused Subject Lines
- "Helped [Competitor] achieve [Result]"
- "15 minutes → [Specific Benefit]"
- "{{companyName}} + [Your Company] = [Result]"

## Break-Up Subject Lines (Last Touch)
- "Should I close your file?"
- "Permission to close the loop?"
- "Last attempt"

## Tips for Better Subject Lines
1. Keep under 50 characters
2. Use personalization tokens
3. Avoid spam trigger words
4. Test with A/B testing
5. Match subject to email content`,
    difficulty: "beginner",
    estimatedReadTime: 4,
    tags: ["subject-lines", "open-rate", "cold-email"],
  },
  {
    categorySlug: "meeting-booking",
    title: "The Art of Booking More Meetings",
    description: "Comprehensive guide to increasing your meeting booking rate",
    contentType: "guide",
    content: `# The Complete Guide to Booking More Meetings

## Before the Outreach

### 1. Research Your Prospect
- Check LinkedIn for recent posts or job changes
- Look for company news or funding announcements
- Identify mutual connections

### 2. Personalize Your Approach
- Reference something specific about them
- Connect your solution to their likely challenges
- Use their language and terminology

## During the Outreach

### 3. Make It Easy to Say Yes
- Offer specific time slots
- Include a calendar link
- Keep the ask small (15 minutes)

### 4. Create Urgency (Authentically)
- Limited availability this week
- New feature launching soon
- Relevant industry event coming up

## The Follow-Up Sequence

### 5. Optimal Timing
- Day 1: Initial email
- Day 3: First follow-up
- Day 7: Second follow-up with new angle
- Day 14: Break-up email

## After the Meeting is Booked

### 6. Confirm and Prepare
- Send calendar invite immediately
- Include meeting agenda
- Send reminder 24 hours before`,
    difficulty: "intermediate",
    estimatedReadTime: 8,
    tags: ["meetings", "booking", "sales"],
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
