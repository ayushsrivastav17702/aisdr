import { Router } from "express";
import { z } from "zod";
import { authenticate, forbidManager } from "../middleware/auth.middleware";
import { waterfallSearchService } from "../services/waterfall-search.service";
import type { WaterfallSearchCriteria } from "@shared/schema";

const router = Router();

const nlSearchSchema = z.object({
  query: z.string().min(1, "Search query required"),
  limit: z.number().min(1).max(200).optional(),
});

// Lightweight seniority/department keyword maps used to turn a free-text
// query into structured WaterfallSearchCriteria without requiring an
// extra LLM round-trip. This keeps the route functional even when no AI
// provider is configured.
const SENIORITY_KEYWORDS: Record<string, string> = {
  vp: "VP",
  "vice president": "VP",
  director: "Director",
  head: "Head",
  chief: "C-Level",
  ceo: "C-Level",
  cto: "C-Level",
  cfo: "C-Level",
  coo: "C-Level",
  founder: "Founder",
  manager: "Manager",
};

const DEPARTMENT_KEYWORDS: Record<string, string> = {
  sales: "Sales",
  marketing: "Marketing",
  engineering: "Engineering",
  product: "Product",
  hr: "Human Resources",
  finance: "Finance",
  operations: "Operations",
  procurement: "Procurement",
  sustainability: "Sustainability",
  esg: "Sustainability",
};

/**
 * Parse a natural-language lead-search query into structured
 * WaterfallSearchCriteria. This is intentionally simple (keyword-based)
 * rather than calling an LLM, so the endpoint always returns quickly and
 * works even without AI provider keys configured.
 */
function parseNaturalLanguageQuery(query: string, limit?: number): WaterfallSearchCriteria {
  const lower = query.toLowerCase();

  const seniority = Object.entries(SENIORITY_KEYWORDS)
    .filter(([keyword]) => lower.includes(keyword))
    .map(([, value]) => value);

  const departments = Object.entries(DEPARTMENT_KEYWORDS)
    .filter(([keyword]) => lower.includes(keyword))
    .map(([, value]) => value);

  // Extract job title phrases like "VP Sales" / "Director of Marketing"
  const jobTitles: string[] = [];
  const titleMatch = query.match(/(VP|Vice President|Director|Head|Chief|Founder|Manager)[\w\s]{0,30}/i);
  if (titleMatch) {
    jobTitles.push(titleMatch[0].trim());
  }

  return {
    keywords: query,
    jobTitles: jobTitles.length > 0 ? jobTitles : undefined,
    seniority: seniority.length > 0 ? Array.from(new Set(seniority)) : undefined,
    departments: departments.length > 0 ? Array.from(new Set(departments)) : undefined,
    limit: limit || 25,
  };
}

// POST /api/find-leads/nl-search
// Accepts a free-text lead search query, converts it into structured
// search criteria, and runs the existing waterfall prospect search.
router.post("/nl-search", authenticate, forbidManager, async (req, res) => {
  try {
    const { query, limit } = nlSearchSchema.parse(req.body);

    const criteria = parseNaturalLanguageQuery(query, limit);

    console.log('\n========== FIND LEADS NL SEARCH ==========');
    console.log('User:', req.userContext?.userId);
    console.log('Org:', req.userContext?.organizationId);
    console.log('Query:', query);
    console.log('Parsed Criteria:', JSON.stringify(criteria, null, 2));

    const result = await waterfallSearchService.search(
      criteria,
      req.userContext?.organizationId,
      req.userContext?.userId
    );

    res.json({
      success: true,
      query,
      criteria,
      ...result,
    });
  } catch (error) {
    console.error('[FindLeads] nl-search error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: "Invalid input", details: error.errors.map(e => e.message) });
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    });
  }
});

export default {
  path: '/api/find-leads',
  router,
};
