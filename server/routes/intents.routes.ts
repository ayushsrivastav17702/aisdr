// ─── server/routes/intents.routes.ts ─────────────────────────────────────────
// Phase 1: POST /v1/intents/validate-dsl
// Phase 2: POST /v1/intents/:id/evaluate
//          POST /v1/intents/:id/simulate
// Phase 4: CRUD + versioning for intents, evidence read API
//
// Two routers live in this file: `intentsRouter` (mounted at /v1/intents)
// and `evidenceRouter` (mounted at /v1/evidence). There's no separate
// evidence.routes.ts in this codebase and every other route file groups by
// a single domain prefix (one router per file) — the evidence endpoint here
// doesn't share the /v1/intents prefix, so it gets its own router exported
// from this file rather than being nested under intentsRouter at the wrong
// path. See server/routes.ts for both mount points.

import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware";
import { ruleEngineService } from "../services/rule-engine.service";
import { evidenceService } from "../services/evidence.service";
import { db } from "../db";
import { intentDefinitions, intentVersions } from "@shared/schema";
import { eq, and, desc, ilike, count, sql as drizzleSql } from "drizzle-orm";

export const intentsRouter = Router();
export const evidenceRouter = Router();

// ─── Response envelope ────────────────────────────────────────────────────────
// All new (Phase 4) endpoints respond with { data } on success or { error }
// on failure. The pre-existing validate-dsl/evaluate/simulate endpoints above
// keep their original flat shapes — not touched, per instructions.

function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data });
}

function fail(res: Response, status: number, error: string, extra?: Record<string, unknown>) {
  return res.status(status).json({ error, ...extra });
}

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

// ─── Shared DSL parsing/validation helper (Phase 4) ──────────────────────────
// Reuses the same DslPayloadSchema + complexity checks as /validate-dsl above.

interface DslValidationResult {
  ok: boolean;
  parsed?: z.infer<typeof DslPayloadSchema>;
  dslSource?: string;
  complexity?: number;
  errors?: { field: string; message: string }[];
}

function parseAndValidateDsl(dslText: unknown): DslValidationResult {
  let parsed: unknown;
  if (typeof dslText === "string") {
    try {
      parsed = JSON.parse(dslText);
    } catch {
      return { ok: false, errors: [{ field: "dsl_text", message: "dsl_text must be valid JSON" }] };
    }
  } else {
    parsed = dslText;
  }

  const result = DslPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.errors.map((e) => ({ field: e.path.join(".") || "root", message: e.message })),
    };
  }

  const complexity = countAstNodes(result.data.match);
  if (complexity > 50) {
    return {
      ok: false,
      errors: [{ field: "match", message: `DSL exceeds complexity limit (${complexity} nodes, max 50)` }],
    };
  }

  return {
    ok: true,
    parsed: result.data,
    dslSource: JSON.stringify(result.data),
    complexity,
  };
}

function deriveVersionStatus(v: { publishedAt: Date | null }): "draft" | "published" {
  return v.publishedAt ? "published" : "draft";
}

// ─── GET /v1/intents ──────────────────────────────────────────────────────────

const ListIntentsQuerySchema = z.object({
  status: z.enum(["draft", "testing", "approved", "production", "deprecated", "archived"]).optional(),
  scope:  z.string().optional(),
  search: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

intentsRouter.get("/", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return fail(res, 401, "No tenant context");

  const query = ListIntentsQuerySchema.safeParse(req.query);
  if (!query.success) return fail(res, 400, "Invalid query params", { detail: query.error.errors });
  const { status, scope, search, limit, offset } = query.data;

  try {
    const conditions = [eq(intentDefinitions.tenantId, tenantId)];
    if (status) conditions.push(eq(intentDefinitions.status, status));
    if (scope) conditions.push(eq(intentDefinitions.scope, scope));
    if (search) conditions.push(ilike(intentDefinitions.name, `%${search}%`));
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(intentDefinitions).where(where).orderBy(desc(intentDefinitions.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(intentDefinitions).where(where),
    ]);

    const intents = await Promise.all(rows.map(async (intent) => {
      const currentVersion = await resolveCurrentVersion(intent);
      return {
        id: intent.id,
        name: intent.name,
        description: intent.description,
        scope: intent.scope,
        status: intent.status,
        currentVersion: currentVersion ? {
          versionNumber: currentVersion.versionNumber,
          publishedAt:   currentVersion.publishedAt,
          status:        deriveVersionStatus(currentVersion),
        } : null,
      };
    }));

    return ok(res, { intents, total, limit, offset });
  } catch (err) {
    console.error("[GET /v1/intents]", err);
    return fail(res, 500, "Failed to list intents", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// Resolves the "current version" for an intent: its active (published)
// version if set, else the most recent version by versionNumber.
async function resolveCurrentVersion(intent: { id: string; tenantId: string; activeVersionId: string | null }) {
  if (intent.activeVersionId) {
    const [v] = await db.select().from(intentVersions)
      .where(and(eq(intentVersions.id, intent.activeVersionId), eq(intentVersions.tenantId, intent.tenantId)))
      .limit(1);
    if (v) return v;
  }
  const [latest] = await db.select().from(intentVersions)
    .where(eq(intentVersions.intentId, intent.id))
    .orderBy(desc(intentVersions.versionNumber))
    .limit(1);
  return latest ?? null;
}

// ─── POST /v1/intents ─────────────────────────────────────────────────────────

const CreateIntentSchema = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  scope:       z.enum(["account", "contact"]).default("account"),
  dsl_text:    z.union([z.string(), z.record(z.any())]),
  tags:        z.array(z.string()).max(10).optional(),
});

intentsRouter.post("/", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = (req as any).user?.id;
  if (!tenantId || !userId) return fail(res, 401, "No tenant context");

  const body = CreateIntentSchema.safeParse(req.body);
  if (!body.success) return fail(res, 400, "Invalid request body", { detail: body.error.errors });

  const dslResult = parseAndValidateDsl(body.data.dsl_text);
  if (!dslResult.ok) return fail(res, 422, "Invalid DSL", { detail: dslResult.errors });

  try {
    const [intent] = await db.insert(intentDefinitions).values({
      tenantId,
      name: body.data.name,
      description: body.data.description ?? null,
      scope: body.data.scope,
      tags: body.data.tags ?? [],
      status: "draft",
      createdBy: userId,
    }).returning();

    const [version] = await db.insert(intentVersions).values({
      intentId: intent.id,
      tenantId,
      versionNumber: 1,
      dslSource: dslResult.dslSource!,
      compiledAst: dslResult.parsed,
      complexityScore: dslResult.complexity,
      isValid: true,
      createdBy: userId,
    }).returning();

    return ok(res, { intentId: intent.id, versionId: version.id, status: "draft" }, 201);
  } catch (err) {
    console.error("[POST /v1/intents]", err);
    return fail(res, 500, "Failed to create intent", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── GET /v1/intents/:id ──────────────────────────────────────────────────────
// NOTE: registered after /validate-dsl and before the more specific
// /:id/evaluate, /:id/simulate, /:id/publish, /:id/versions* routes defined
// elsewhere in this file — Express matches in registration order, and none
// of those other paths collide with a bare GET /:id.

intentsRouter.get("/:id", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return fail(res, 401, "No tenant context");

  try {
    const [intent] = await db.select().from(intentDefinitions)
      .where(and(eq(intentDefinitions.id, req.params.id), eq(intentDefinitions.tenantId, tenantId)))
      .limit(1);
    if (!intent) return fail(res, 404, "Intent not found");

    const currentVersion = await resolveCurrentVersion(intent);

    return ok(res, {
      id: intent.id,
      name: intent.name,
      description: intent.description,
      scope: intent.scope,
      status: intent.status,
      currentVersion: currentVersion ? {
        id:            currentVersion.id,
        versionNumber: currentVersion.versionNumber,
        dslText:       currentVersion.dslSource,
        compiledAst:   currentVersion.compiledAst,
        status:        deriveVersionStatus(currentVersion),
        publishedAt:   currentVersion.publishedAt,
        createdAt:     currentVersion.createdAt,
      } : null,
      tags: intent.tags,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    });
  } catch (err) {
    console.error("[GET /v1/intents/:id]", err);
    return fail(res, 500, "Failed to fetch intent", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── PUT /v1/intents/:id ──────────────────────────────────────────────────────

const UpdateIntentSchema = z.object({
  name:        z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  scope:       z.enum(["account", "contact"]).optional(),
  dsl_text:    z.union([z.string(), z.record(z.any())]).optional(),
  tags:        z.array(z.string()).max(10).optional(),
});

intentsRouter.put("/:id", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = (req as any).user?.id;
  if (!tenantId || !userId) return fail(res, 401, "No tenant context");

  const body = UpdateIntentSchema.safeParse(req.body);
  if (!body.success) return fail(res, 400, "Invalid request body", { detail: body.error.errors });

  try {
    const [intent] = await db.select().from(intentDefinitions)
      .where(and(eq(intentDefinitions.id, req.params.id), eq(intentDefinitions.tenantId, tenantId)))
      .limit(1);
    if (!intent) return fail(res, 404, "Intent not found");

    const fieldUpdates: Record<string, unknown> = {};
    if (body.data.name !== undefined) fieldUpdates.name = body.data.name;
    if (body.data.description !== undefined) fieldUpdates.description = body.data.description;
    if (body.data.scope !== undefined) fieldUpdates.scope = body.data.scope;
    if (body.data.tags !== undefined) fieldUpdates.tags = body.data.tags;

    if (Object.keys(fieldUpdates).length > 0) {
      fieldUpdates.updatedAt = new Date();
      await db.update(intentDefinitions).set(fieldUpdates).where(eq(intentDefinitions.id, intent.id));
    }

    let resultVersionId: string;
    let resultStatus: "draft" | "published";

    if (body.data.dsl_text !== undefined) {
      const dslResult = parseAndValidateDsl(body.data.dsl_text);
      if (!dslResult.ok) return fail(res, 422, "Invalid DSL", { detail: dslResult.errors });

      const [latest] = await db.select().from(intentVersions)
        .where(eq(intentVersions.intentId, intent.id))
        .orderBy(desc(intentVersions.versionNumber))
        .limit(1);

      const changed = !latest || latest.dslSource !== dslResult.dslSource;

      if (changed) {
        const [newVersion] = await db.insert(intentVersions).values({
          intentId: intent.id,
          tenantId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          dslSource: dslResult.dslSource!,
          compiledAst: dslResult.parsed,
          complexityScore: dslResult.complexity,
          isValid: true,
          createdBy: userId,
        }).returning();

        resultVersionId = newVersion.id;
        resultStatus = "draft";
      } else {
        resultVersionId = latest.id;
        resultStatus = deriveVersionStatus(latest);
      }
    } else {
      const currentVersion = await resolveCurrentVersion({ ...intent, ...fieldUpdates } as typeof intent);
      if (!currentVersion) return fail(res, 422, "Intent has no version yet");
      resultVersionId = currentVersion.id;
      resultStatus = deriveVersionStatus(currentVersion);
    }

    return ok(res, { intentId: intent.id, versionId: resultVersionId, status: resultStatus });
  } catch (err) {
    console.error("[PUT /v1/intents/:id]", err);
    return fail(res, 500, "Failed to update intent", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── DELETE /v1/intents/:id ───────────────────────────────────────────────────
// Soft-delete: sets status = "archived". Does not touch deletedAt or remove
// any version history.

intentsRouter.delete("/:id", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return fail(res, 401, "No tenant context");

  try {
    const [intent] = await db.select().from(intentDefinitions)
      .where(and(eq(intentDefinitions.id, req.params.id), eq(intentDefinitions.tenantId, tenantId)))
      .limit(1);
    if (!intent) return fail(res, 404, "Intent not found");

    await db.update(intentDefinitions)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(intentDefinitions.id, intent.id));

    return ok(res, { success: true });
  } catch (err) {
    console.error("[DELETE /v1/intents/:id]", err);
    return fail(res, 500, "Failed to archive intent", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── POST /v1/intents/:id/publish ────────────────────────────────────────────

const PublishSchema = z.object({
  versionId: z.string().optional(),
});

intentsRouter.post("/:id/publish", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = (req as any).user?.id;
  if (!tenantId || !userId) return fail(res, 401, "No tenant context");

  const body = PublishSchema.safeParse(req.body ?? {});
  if (!body.success) return fail(res, 400, "Invalid request body", { detail: body.error.errors });

  try {
    const [intent] = await db.select().from(intentDefinitions)
      .where(and(eq(intentDefinitions.id, req.params.id), eq(intentDefinitions.tenantId, tenantId)))
      .limit(1);
    if (!intent) return fail(res, 404, "Intent not found");

    let version;
    if (body.data.versionId) {
      [version] = await db.select().from(intentVersions)
        .where(and(eq(intentVersions.id, body.data.versionId), eq(intentVersions.intentId, intent.id), eq(intentVersions.tenantId, tenantId)))
        .limit(1);
      if (!version) return fail(res, 404, "Version not found for this intent");
    } else {
      // Default: latest draft (unpublished) version
      const drafts = await db.select().from(intentVersions)
        .where(and(eq(intentVersions.intentId, intent.id), drizzleSql`${intentVersions.publishedAt} IS NULL`))
        .orderBy(desc(intentVersions.versionNumber))
        .limit(1);
      version = drafts[0];
      if (!version) return fail(res, 422, "No draft version available to publish");
    }

    // Re-validate DSL + complexity before publishing
    const dslResult = parseAndValidateDsl(version.dslSource);
    if (!dslResult.ok) return fail(res, 422, "Cannot publish: version has invalid DSL", { detail: dslResult.errors });

    const publishedAt = new Date();
    await db.update(intentVersions)
      .set({ isValid: true, publishedAt, publishedBy: userId })
      .where(eq(intentVersions.id, version.id));

    // The newly published version becomes the active version for evaluation,
    // and the intent itself moves to "production" status.
    await db.update(intentDefinitions)
      .set({ activeVersionId: version.id, status: "production", updatedAt: publishedAt })
      .where(eq(intentDefinitions.id, intent.id));

    return ok(res, { versionId: version.id, publishedAt });
  } catch (err) {
    console.error("[POST /v1/intents/:id/publish]", err);
    return fail(res, 500, "Failed to publish version", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── GET /v1/intents/:id/versions ─────────────────────────────────────────────

intentsRouter.get("/:id/versions", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return fail(res, 401, "No tenant context");

  try {
    const [intent] = await db.select({ id: intentDefinitions.id }).from(intentDefinitions)
      .where(and(eq(intentDefinitions.id, req.params.id), eq(intentDefinitions.tenantId, tenantId)))
      .limit(1);
    if (!intent) return fail(res, 404, "Intent not found");

    const rows = await db.select().from(intentVersions)
      .where(eq(intentVersions.intentId, intent.id))
      .orderBy(desc(intentVersions.versionNumber));

    const versions = rows.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: deriveVersionStatus(v),
      // No changelog column exists on intent_versions — nothing populates
      // this yet, so it's always null. Kept in the response shape for
      // forward compatibility with the documented contract.
      changelog: null as string | null,
      publishedAt: v.publishedAt,
      createdAt: v.createdAt,
    }));

    return ok(res, { versions });
  } catch (err) {
    console.error("[GET /v1/intents/:id/versions]", err);
    return fail(res, 500, "Failed to list versions", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── POST /v1/intents/:id/versions/:vid/rollback ─────────────────────────────

intentsRouter.post("/:id/versions/:vid/rollback", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = (req as any).user?.id;
  if (!tenantId || !userId) return fail(res, 401, "No tenant context");

  try {
    const [intent] = await db.select({ id: intentDefinitions.id }).from(intentDefinitions)
      .where(and(eq(intentDefinitions.id, req.params.id), eq(intentDefinitions.tenantId, tenantId)))
      .limit(1);
    if (!intent) return fail(res, 404, "Intent not found");

    const [source] = await db.select().from(intentVersions)
      .where(and(eq(intentVersions.id, req.params.vid), eq(intentVersions.intentId, intent.id), eq(intentVersions.tenantId, tenantId)))
      .limit(1);
    if (!source) return fail(res, 404, "Version not found for this intent");

    const [latest] = await db.select().from(intentVersions)
      .where(eq(intentVersions.intentId, intent.id))
      .orderBy(desc(intentVersions.versionNumber))
      .limit(1);

    const [newVersion] = await db.insert(intentVersions).values({
      intentId: intent.id,
      tenantId,
      versionNumber: (latest?.versionNumber ?? source.versionNumber) + 1,
      dslSource: source.dslSource,
      compiledAst: source.compiledAst,
      complexityScore: source.complexityScore,
      isValid: source.isValid,
      createdBy: userId,
      // publishedAt intentionally omitted — rollback always creates a draft
    }).returning();

    return ok(res, { newVersionId: newVersion.id, status: "draft" }, 201);
  } catch (err) {
    console.error("[POST /v1/intents/:id/versions/:vid/rollback]", err);
    return fail(res, 500, "Failed to rollback version", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── GET /v1/intents/:id/versions/:vid/diff ──────────────────────────────────
// Minimal dependency-free line diff (LCS-based) over pretty-printed DSL JSON.
// Not a general-purpose diff library — sufficient for short DSL documents.

function lineDiff(a: string, b: string): string {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const n = linesA.length;
  const m = linesB.length;

  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = linesA[i] === linesB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (linesA[i] === linesB[j]) {
      out.push(`  ${linesA[i]}`);
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`- ${linesA[i]}`);
      i++;
    } else {
      out.push(`+ ${linesB[j]}`);
      j++;
    }
  }
  while (i < n) { out.push(`- ${linesA[i]}`); i++; }
  while (j < m) { out.push(`+ ${linesB[j]}`); j++; }

  return out.join("\n");
}

function prettyDsl(dslSource: string): string {
  try {
    return JSON.stringify(JSON.parse(dslSource), null, 2);
  } catch {
    return dslSource;
  }
}

intentsRouter.get("/:id/versions/:vid/diff", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return fail(res, 401, "No tenant context");

  try {
    const [intent] = await db.select().from(intentDefinitions)
      .where(and(eq(intentDefinitions.id, req.params.id), eq(intentDefinitions.tenantId, tenantId)))
      .limit(1);
    if (!intent) return fail(res, 404, "Intent not found");

    const [versionA] = await db.select().from(intentVersions)
      .where(and(eq(intentVersions.id, req.params.vid), eq(intentVersions.intentId, intent.id), eq(intentVersions.tenantId, tenantId)))
      .limit(1);
    if (!versionA) return fail(res, 404, "Version not found for this intent");

    const compareToId = typeof req.query.compareTo === "string" ? req.query.compareTo : intent.activeVersionId;
    if (!compareToId) return fail(res, 422, "No published version to compare against — supply compareTo");

    const [versionB] = await db.select().from(intentVersions)
      .where(and(eq(intentVersions.id, compareToId), eq(intentVersions.intentId, intent.id), eq(intentVersions.tenantId, tenantId)))
      .limit(1);
    if (!versionB) return fail(res, 404, "compareTo version not found for this intent");

    return ok(res, {
      versionA: { id: versionA.id, dslText: versionA.dslSource },
      versionB: { id: versionB.id, dslText: versionB.dslSource },
      diff: lineDiff(prettyDsl(versionB.dslSource), prettyDsl(versionA.dslSource)),
    });
  } catch (err) {
    console.error("[GET /v1/intents/:id/versions/:vid/diff]", err);
    return fail(res, 500, "Failed to diff versions", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── GET /v1/evidence/entity/:entityId ────────────────────────────────────────
// Mounted separately at /v1/evidence (see server/routes.ts) — see file header.

const ListEvidenceQuerySchema = z.object({
  signalTypes: z.union([z.string(), z.array(z.string())]).optional(),
  sourceTypes: z.union([z.string(), z.array(z.string())]).optional(),
  since:       z.string().datetime().optional(),
  limit:       z.coerce.number().int().min(1).max(200).default(50),
});

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

evidenceRouter.get("/entity/:entityId", authenticate, async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return fail(res, 401, "No tenant context");

  const query = ListEvidenceQuerySchema.safeParse(req.query);
  if (!query.success) return fail(res, 400, "Invalid query params", { detail: query.error.errors });

  const signalTypes = toArray(query.data.signalTypes);
  const sourceTypes = toArray(query.data.sourceTypes);
  const since = query.data.since ? new Date(query.data.since) : undefined;

  try {
    let rows = await evidenceService.getForEntity(tenantId, req.params.entityId, {
      signalTypes,
      since,
      limit: query.data.limit,
    });

    // evidenceService doesn't filter by sourceType natively — done here to
    // avoid changing that service's existing signature/behavior.
    if (sourceTypes && sourceTypes.length > 0) {
      rows = rows.filter((r) => sourceTypes.includes(r.sourceType));
    }

    const evidence = rows.map((r) => ({
      id: r.id,
      signalType: r.signalType,
      sourceType: r.sourceType,
      sourceTimestamp: r.sourceTimestamp,
      payload: r.payload,
      trustScore: r.trustScore,
      createdAt: r.createdAt,
    }));

    return ok(res, { evidence });
  } catch (err) {
    console.error("[GET /v1/evidence/entity/:entityId]", err);
    return fail(res, 500, "Failed to fetch evidence", { detail: err instanceof Error ? err.message : "Unknown error" });
  }
});
