// ─── server/routes/intents.routes.ts ─────────────────────────────────────────
// Phase 1: POST /v1/intents/validate-dsl
// Phase 2: POST /v1/intents/:id/evaluate
//          POST /v1/intents/:id/simulate

import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware";
import { ruleEngineService } from "../services/rule-engine.service";
import { db } from "../db";
import { intentDefinitions } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export const intentsRouter = Router();

// ─── Tenant guard (reused across all routes) ─────────────────────────────────
// This codebase has no separate "requireTenant" middleware — tenant context
// comes from req.user.organizationId, set by `authenticate`.

function getTenantId(req: Request): string | null {
  const user = (req as any).user;
  return user?.organizationId ?? null;
}

// ─── DSL schema (unchanged from Phase 1) ─────────────────────────────────────

const ConditionSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type:       z.literal("condition"),
      signal:     z.string().min(1),
      operator:   z.enum(["gt", "gte", "lt", "lte", "eq", "neq", "exists", "not_exists"]),
      value:      z.union([z.number(), z.string(), z.boolean()]).optional(),
      timeWindow: z.object({
        value: z.number().positive(),
        unit:  z.enum(["hours", "days", "weeks", "months"]),
      }).optional(),
    }),
    z.object({ type: z.literal("and"), children: z.array(ConditionSchema).min(2) }),
    z.object({ type: z.literal("or"),  children: z.array(ConditionSchema).min(2) }),
    z.object({ type: z.literal("not"), child: ConditionSchema }),
  ])
);

const DslPayloadSchema = z.object({
  version:     z.literal("1.0"),
  name:        z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  match:       ConditionSchema,
  score: z.object({
    rules:    z.array(z.object({ signal: z.string(), weight: z.number().min(0).max(100), label: z.string().optional() })).min(1),
    maxScore: z.number().min(1).max(100).default(100),
  }).optional(),
  metadata: z.object({ tags: z.array(z.string()).max(10).optional(), owner: z.string().optional() }).optional(),
});

function countAstNodes(node: any): number {
  if (!node) return 0;
  if (node.type === "condition") return 1;
  if (node.type === "not") return 1 + countAstNodes(node.child);
  if (node.type === "and" || node.type === "or")
    return 1 + (node.children || []).reduce((s: number, c: any) => s + countAstNodes(c), 0);
  return 0;
}

function calculateDepth(node: any, depth = 0): number {
  if (!node) return depth;
  if (node.type === "condition") return depth + 1;
  if (node.type === "not") return calculateDepth(node.child, depth + 1);
  if (node.type === "and" || node.type === "or")
    return Math.max(...(node.children || []).map((c: any) => calculateDepth(c, depth + 1)));
  return depth;
}

// ─── POST /v1/intents/validate-dsl ───────────────────────────────────────────

intentsRouter.post("/validate-dsl", authenticate, async (req: Request, res: Response) => {
  if (!getTenantId(req)) return res.status(403).json({ error: "No tenant context for this user" });

  const { dsl } = req.body;
  if (!dsl) return res.status(400).json({ valid: false, errors: [{ field: "dsl", message: "dsl field is required" }] });

  let parsed: unknown;
  if (typeof dsl === "string") {
    try { parsed = JSON.parse(dsl); }
    catch { return res.status(400).json({ valid: false, errors: [{ field: "dsl", message: "DSL must be valid JSON" }] }); }
  } else {
    parsed = dsl;
  }

  const result = DslPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return res.status(422).json({
      valid: false,
      errors: result.error.errors.map((e) => ({ field: e.path.join(".") || "root", message: e.message })),
      ast: null, complexity: null,
    });
  }

  const complexityScore = countAstNodes(result.data.match);
  const warnings: string[] = [];
  if (complexityScore > 50) {
    return res.status(422).json({ valid: false, errors: [{ field: "match", message: `DSL exceeds complexity limit (${complexityScore} nodes, max 50)` }], ast: result.data, complexity: complexityScore });
  }
  if (complexityScore > 30) warnings.push(`High complexity (${complexityScore} nodes). Consider simplifying.`);

  return res.status(200).json({
    valid: true, errors: [], warnings, ast: result.data, complexity: complexityScore,
    meta: { nodeCount: complexityScore, hasScoring: !!result.data.score, conditionDepth: calculateDepth(result.data.match) },
  });
});

// ─── POST /v1/intents/:id/evaluate ───────────────────────────────────────────
// Evaluates a published intent version against a specific prospect.
// Writes to intent_matches + rule_execution_logs (production evaluation).
//
// Body: { prospectId: string, intentVersionId?: string }
// If intentVersionId omitted, uses the active version on the intent.

intentsRouter.post("/:id/evaluate", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "No tenant context" });

  const { prospectId, intentVersionId } = req.body;
  if (!prospectId) return res.status(400).json({ error: "prospectId is required" });

  const intentId = req.params.id;

  try {
    // Resolve which version to evaluate
    let resolvedVersionId = intentVersionId;
    if (!resolvedVersionId) {
      const [intent] = await db
        .select({ activeVersionId: intentDefinitions.activeVersionId })
        .from(intentDefinitions)
        .where(and(eq(intentDefinitions.id, intentId), eq(intentDefinitions.tenantId, tenantId)))
        .limit(1);

      if (!intent) return res.status(404).json({ error: "Intent not found" });
      if (!intent.activeVersionId) return res.status(422).json({ error: "Intent has no active version. Publish a version first." });
      resolvedVersionId = intent.activeVersionId;
    }

    const result = await ruleEngineService.evaluate(tenantId, prospectId, resolvedVersionId);

    return res.status(200).json({
      intentId,
      intentVersionId: resolvedVersionId,
      prospectId,
      matched:         result.matched,
      score:           result.score,
      scoreBreakdown:  result.scoreBreakdown,
      trace:           result.trace,
      errorMessage:    result.errorMessage ?? null,
      evaluatedAt:     new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/evaluate]", err);
    return res.status(500).json({ error: "Evaluation failed", detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── POST /v1/intents/:id/simulate ───────────────────────────────────────────
// Sandbox replay: evaluates intent against historical evidence without
// writing to intent_matches. Safe to run on draft/testing versions.
//
// Body: { intentVersionId: string, prospectIds: string[], since?: ISO date }

intentsRouter.post("/:id/simulate", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "No tenant context" });

  const schema = z.object({
    intentVersionId: z.string().uuid(),
    prospectIds:     z.array(z.string()).min(1).max(100),
    since:           z.string().datetime().optional(),
  });

  const body = schema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Invalid request", detail: body.error.errors });
  }

  const { intentVersionId, prospectIds } = body.data;

  try {
    // Run evaluations in parallel (isReplay=true skips persistence)
    const results = await Promise.allSettled(
      prospectIds.map((pid) =>
        ruleEngineService.evaluate(tenantId, pid, intentVersionId, { isReplay: true })
      )
    );

    const matched:   { prospectId: string; score: number; trace: any[] }[] = [];
    const unmatched: { prospectId: string }[] = [];
    const errors:    { prospectId: string; error: string }[] = [];

    results.forEach((r, i) => {
      const pid = prospectIds[i];
      if (r.status === "rejected") {
        errors.push({ prospectId: pid, error: String(r.reason) });
      } else if (r.value.matched) {
        matched.push({ prospectId: pid, score: r.value.score, trace: r.value.trace });
      } else {
        unmatched.push({ prospectId: pid });
      }
    });

    return res.status(200).json({
      intentVersionId,
      isReplay:      true,
      summary: {
        total:        prospectIds.length,
        matched:      matched.length,
        unmatched:    unmatched.length,
        errors:       errors.length,
        matchRate:    `${Math.round((matched.length / prospectIds.length) * 100)}%`,
      },
      matched:   matched.slice(0, 10),   // sample: first 10 matches
      unmatched: unmatched.slice(0, 10), // sample: first 10 non-matches
      errors,
    });
  } catch (err) {
    console.error("[/simulate]", err);
    return res.status(500).json({ error: "Simulation failed", detail: err instanceof Error ? err.message : "Unknown error" });
  }
});
