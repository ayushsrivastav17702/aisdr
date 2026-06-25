import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware";

export const intentsRouter = Router();

// This codebase has no separate "requireTenant" middleware — tenant context
// comes from req.user.organizationId, set by `authenticate`. Reject requests
// from users with no organization rather than introducing a new abstraction.
function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.organizationId) {
    return res.status(403).json({ error: "No tenant context for this user" });
  }
  next();
}

// ─── DSL Schema ───────────────────────────────────────────────────────────────
// Phase 1: structural validation only.
// Phase 2 (Sprint 5): swap in the real AST compiler here.

const ConditionSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    // Leaf condition — checks a signal against a threshold
    z.object({
      type:      z.literal("condition"),
      signal:    z.string().min(1, "signal is required"),
      operator:  z.enum(["gt", "gte", "lt", "lte", "eq", "neq", "exists", "not_exists"]),
      value:     z.union([z.number(), z.string(), z.boolean()]).optional(),
      timeWindow: z.object({
        value: z.number().positive(),
        unit:  z.enum(["hours", "days", "weeks", "months"]),
      }).optional(),
    }),
    // AND — all children must pass
    z.object({
      type:     z.literal("and"),
      children: z.array(ConditionSchema).min(2, "AND requires at least 2 children"),
    }),
    // OR — at least one child must pass
    z.object({
      type:     z.literal("or"),
      children: z.array(ConditionSchema).min(2, "OR requires at least 2 children"),
    }),
    // NOT — inverts a single child
    z.object({
      type:  z.literal("not"),
      child: ConditionSchema,
    }),
  ])
);

const ScoringRuleSchema = z.object({
  signal:  z.string().min(1),
  weight:  z.number().min(0).max(100),
  label:   z.string().optional(),
});

const DslPayloadSchema = z.object({
  version:  z.literal("1.0"),
  name:     z.string().min(1, "Intent name is required").max(255),
  description: z.string().max(1000).optional(),
  match:    ConditionSchema,
  score: z.object({
    rules:   z.array(ScoringRuleSchema).min(1, "At least one scoring rule is required"),
    maxScore: z.number().min(1).max(100).default(100),
  }).optional(),
  metadata: z.object({
    tags:   z.array(z.string()).max(10).optional(),
    owner:  z.string().optional(),
  }).optional(),
});

// ─── Complexity Scorer ────────────────────────────────────────────────────────
// Simple heuristic: counts AST nodes. Hard limit 50 nodes.
// Phase 3 (Sprint 9) replaces this with the full compile-time scorer.

function countAstNodes(node: any): number {
  if (!node || typeof node !== "object") return 0;
  if (node.type === "condition") return 1;
  if (node.type === "not") return 1 + countAstNodes(node.child);
  if (node.type === "and" || node.type === "or") {
    return 1 + (node.children || []).reduce((sum: number, c: any) => sum + countAstNodes(c), 0);
  }
  return 0;
}

const COMPLEXITY_HARD_LIMIT = 50;
const COMPLEXITY_WARN_THRESHOLD = 30;

// ─── POST /v1/intents/validate-dsl ───────────────────────────────────────────

intentsRouter.post(
  "/validate-dsl",
  authenticate,
  requireTenant,
  async (req: Request, res: Response) => {
    const { dsl } = req.body;

    // 1. Ensure DSL was provided
    if (!dsl) {
      return res.status(400).json({
        valid: false,
        errors: [{ field: "dsl", message: "dsl field is required" }],
      });
    }

    // 2. Parse JSON if sent as string
    let parsed: unknown;
    if (typeof dsl === "string") {
      try {
        parsed = JSON.parse(dsl);
      } catch (e) {
        return res.status(400).json({
          valid: false,
          errors: [{ field: "dsl", message: "DSL must be valid JSON" }],
        });
      }
    } else {
      parsed = dsl;
    }

    // 3. Structural validation via Zod
    const result = DslPayloadSchema.safeParse(parsed);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join(".") || "root",
        message: e.message,
      }));
      return res.status(422).json({
        valid: false,
        errors,
        ast: null,
        complexity: null,
      });
    }

    // 4. Complexity check
    const complexityScore = countAstNodes(result.data.match);
    const warnings: string[] = [];

    if (complexityScore > COMPLEXITY_HARD_LIMIT) {
      return res.status(422).json({
        valid: false,
        errors: [{
          field: "match",
          message: `DSL exceeds complexity limit (${complexityScore} nodes, max ${COMPLEXITY_HARD_LIMIT})`,
        }],
        ast: result.data,
        complexity: complexityScore,
      });
    }

    if (complexityScore > COMPLEXITY_WARN_THRESHOLD) {
      warnings.push(`High complexity (${complexityScore} nodes). Consider simplifying to improve evaluation performance.`);
    }

    // 5. Return validated AST
    return res.status(200).json({
      valid: true,
      errors: [],
      warnings,
      ast: result.data,
      complexity: complexityScore,
      meta: {
        nodeCount: complexityScore,
        hasScoring: !!result.data.score,
        conditionDepth: calculateDepth(result.data.match),
      },
    });
  }
);

function calculateDepth(node: any, depth = 0): number {
  if (!node) return depth;
  if (node.type === "condition") return depth + 1;
  if (node.type === "not") return calculateDepth(node.child, depth + 1);
  if (node.type === "and" || node.type === "or") {
    return Math.max(...(node.children || []).map((c: any) => calculateDepth(c, depth + 1)));
  }
  return depth;
}
