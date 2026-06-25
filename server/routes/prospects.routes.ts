// ─── server/routes/prospects.routes.ts ───────────────────────────────────────
// Phase 5: read-only prospect lookup for the Intent Studio simulation panel.
//
// NOTE on tenant isolation: the spec for this endpoint says to scope by
// req.user.organizationId, but `prospects` has no organizationId column in
// this schema (shared/schema.ts) — every prospect/sequence table in this
// codebase is scoped by `userId` instead (see prospects.userId,
// sequences.userId, sequenceProspects, etc.). Scoping by userId here matches
// that existing convention rather than introducing a different one.

import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware";
import { db } from "../db";
import { prospects, sequenceProspects } from "@shared/schema";
import { eq, and, gte, ilike, or, inArray, desc } from "drizzle-orm";

export const prospectsRouter = Router();

function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data });
}

function fail(res: Response, status: number, error: string, extra?: Record<string, unknown>) {
  return res.status(status).json({ error, ...extra });
}

const ListProspectsQuerySchema = z.object({
  sequenceId: z.string().optional(),
  since:      z.string().datetime().optional(),
  limit:      z.coerce.number().int().min(1).max(200).default(50),
  search:     z.string().optional(),
});

// ─── GET /v1/prospects ────────────────────────────────────────────────────────

prospectsRouter.get("/", authenticate, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return fail(res, 401, "Authentication required");

  const query = ListProspectsQuerySchema.safeParse(req.query);
  if (!query.success) return fail(res, 400, "Invalid query params", { detail: query.error.errors });
  const { sequenceId, limit, search } = query.data;

  // Default lookback window: 30 days ago
  const since = query.data.since
    ? new Date(query.data.since)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const conditions = [eq(prospects.userId, userId), gte(prospects.createdAt, since)];

    if (search) {
      conditions.push(or(
        ilike(prospects.primaryEmail, `%${search}%`),
        ilike(prospects.companyName, `%${search}%`),
      )!);
    }

    if (sequenceId) {
      const enrolled = await db
        .select({ prospectId: sequenceProspects.prospectId })
        .from(sequenceProspects)
        .where(eq(sequenceProspects.sequenceId, sequenceId));

      const enrolledIds = enrolled.map((e) => e.prospectId);
      if (enrolledIds.length === 0) {
        return ok(res, { prospects: [] });
      }
      conditions.push(inArray(prospects.id, enrolledIds));
    }

    const rows = await db
      .select()
      .from(prospects)
      .where(and(...conditions))
      .orderBy(desc(prospects.createdAt))
      .limit(limit);

    const result = rows.map((p) => ({
      id: p.id,
      email: p.primaryEmail,
      company: p.companyName,
      firstName: p.firstName,
      lastName: p.lastName,
      jobTitle: p.jobTitle,
      createdAt: p.createdAt,
    }));

    return ok(res, { prospects: result });
  } catch (err) {
    console.error("[GET /v1/prospects]", err);
    return fail(res, 500, "Failed to list prospects", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});
