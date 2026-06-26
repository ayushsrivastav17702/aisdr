// ─── server/routes/extractors.routes.ts ──────────────────────────────────────
// Manual trigger for evidence extractors. Currently: Apify LinkedIn job
// postings. Mounted at /v1/extractors (see server/routes.ts) — doesn't share
// a URL prefix with intentsRouter/evidenceRouter, so it gets its own file,
// matching the one-router-per-file convention used everywhere except
// intents.routes.ts (which has a documented reason for being the exception).

import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware";
import { flags } from "../config/feature-flags";
import { fetchAndIngestJobPostings } from "../services/apify-jobs.service";
import { db } from "../db";
import { targetAccounts } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export const extractorsRouter = Router();

function getTenantId(req: Request): string | null {
  const user = (req as any).user;
  return user?.organizationId ?? null;
}

const TriggerJobsSchema = z.object({
  domain:   z.string().min(3),
  keywords: z.array(z.string()).default([]),
});

// ─── POST /v1/extractors/jobs ─────────────────────────────────────────────────

extractorsRouter.post("/jobs", authenticate, async (req: Request, res: Response) => {
  if (!flags.EVIDENCE_INGESTION_ENABLED) {
    return res.status(503).json({
      error: "EVIDENCE_INGESTION_DISABLED",
      message: "Evidence ingestion is not enabled for this environment. Set FEATURE_EVIDENCE_INGESTION=true to activate.",
    });
  }

  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "No tenant context" });

  const body = TriggerJobsSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Invalid request body", detail: body.error.errors });
  }

  const { domain, keywords } = body.data;

  try {
    // Look up or create the target_accounts row for this (tenantId, domain)
    let [account] = await db.select().from(targetAccounts)
      .where(and(eq(targetAccounts.tenantId, tenantId), eq(targetAccounts.domain, domain)))
      .limit(1);

    if (!account) {
      [account] = await db.insert(targetAccounts).values({
        tenantId,
        domain,
      }).returning();
    }

    // Phase 1: domain doubles as entityId. Phase 2 will resolve this to a
    // canonical company UUID once entity resolution exists.
    const entityId = domain;

    const result = await fetchAndIngestJobPostings(tenantId, entityId, domain, keywords);

    const processedAt = new Date();
    await db.update(targetAccounts)
      .set({ processedAt })
      .where(eq(targetAccounts.id, account.id));

    return res.status(200).json({
      domain,
      ingested: result.ingested,
      deduplicated: result.deduplicated,
      errors: result.errors,
      processedAt,
    });
  } catch (err) {
    console.error("[POST /v1/extractors/jobs]", err);
    return res.status(500).json({
      error: "Extraction failed",
      detail: err instanceof Error ? err.message : "Unknown error",
    });
  }
});
