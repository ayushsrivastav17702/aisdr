// ─── server/services/rule-engine.service.ts ──────────────────────────────────
// Evaluates a compiled DSL AST against a prospect's evidence vault.
// Returns a deterministic match result + full per-rule trace.
//
// Phase 2 MVP: single-prospect evaluation, synchronous, no caching.
// Phase 3: batch evaluation, Redis-cached evidence windows, worker queue.

import { db } from "../db";
import { intentVersions, intentMatches, ruleExecutionLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { evidenceService } from "./evidence.service";

// ─── AST node types (must match validate-dsl schema) ─────────────────────────

type Operator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "exists" | "not_exists";

interface TimeWindow {
  value: number;
  unit: "hours" | "days" | "weeks" | "months";
}

interface ConditionNode {
  type: "condition";
  signal: string;
  operator: Operator;
  value?: number | string | boolean;
  timeWindow?: TimeWindow;
}

interface AndNode {
  type: "and";
  children: AstNode[];
}

interface OrNode {
  type: "or";
  children: AstNode[];
}

interface NotNode {
  type: "not";
  child: AstNode;
}

type AstNode = ConditionNode | AndNode | OrNode | NotNode;

interface ScoringRule {
  signal: string;
  weight: number;
  label?: string;
}

interface DslAst {
  version: "1.0";
  name: string;
  match: AstNode;
  score?: {
    rules: ScoringRule[];
    maxScore?: number;
  };
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RuleTrace {
  ruleId:         string;
  ruleLabel:      string | null;
  passed:         boolean;
  signal:         string;
  operator:       string;
  evaluatedValue: unknown;
  expectedValue:  unknown;
  evidenceIds:    string[];
  executionMs:    number;
}

export interface EvaluationResult {
  matched:        boolean;
  score:          number;          // 0–100
  scoreBreakdown: Record<string, number>;
  trace:          RuleTrace[];
  errorMessage?:  string;
}

// ─── Time window helper ───────────────────────────────────────────────────────

function windowToMs(tw: TimeWindow): number {
  const multipliers = { hours: 3600000, days: 86400000, weeks: 604800000, months: 2592000000 };
  return tw.value * multipliers[tw.unit];
}

// ─── Core evaluator ───────────────────────────────────────────────────────────

class RuleEvaluator {
  private traces: RuleTrace[] = [];
  private evidence: Awaited<ReturnType<typeof evidenceService.getForEntity>>;

  constructor(evidence: Awaited<ReturnType<typeof evidenceService.getForEntity>>) {
    this.evidence = evidence;
  }

  evaluate(node: AstNode, nodeId = "root"): boolean {
    switch (node.type) {
      case "condition": return this.evaluateCondition(node, nodeId);
      case "and":       return this.evaluateAnd(node, nodeId);
      case "or":        return this.evaluateOr(node, nodeId);
      case "not":       return this.evaluateNot(node, nodeId);
      default:          return false;
    }
  }

  private evaluateCondition(node: ConditionNode, nodeId: string): boolean {
    const start = Date.now();

    // Filter evidence to the relevant signal type and time window
    const cutoff = node.timeWindow
      ? new Date(Date.now() - windowToMs(node.timeWindow))
      : undefined;

    const relevant = this.evidence.filter((e) => {
      if (e.signalType !== node.signal) return false;
      if (cutoff && new Date(e.sourceTimestamp) < cutoff) return false;
      return true;
    });

    const evidenceIds = relevant.map((e) => e.id);
    const count = relevant.length;
    let passed = false;
    let evaluatedValue: unknown = count;

    switch (node.operator) {
      case "exists":     passed = count > 0;                       evaluatedValue = count; break;
      case "not_exists": passed = count === 0;                     evaluatedValue = count; break;
      case "gt":         passed = count > Number(node.value);      break;
      case "gte":        passed = count >= Number(node.value);     break;
      case "lt":         passed = count < Number(node.value);      break;
      case "lte":        passed = count <= Number(node.value);     break;
      case "eq":         passed = count === Number(node.value);    break;
      case "neq":        passed = count !== Number(node.value);    break;
    }

    this.traces.push({
      ruleId:         nodeId,
      ruleLabel:      `${node.signal} ${node.operator} ${node.value ?? ""}`.trim(),
      passed,
      signal:         node.signal,
      operator:       node.operator,
      evaluatedValue,
      expectedValue:  node.value ?? null,
      evidenceIds,
      executionMs:    Date.now() - start,
    });

    return passed;
  }

  private evaluateAnd(node: AndNode, nodeId: string): boolean {
    // Short-circuit: stop at first false
    for (let i = 0; i < node.children.length; i++) {
      const result = this.evaluate(node.children[i], `${nodeId}.and[${i}]`);
      if (!result) return false;
    }
    return true;
  }

  private evaluateOr(node: OrNode, nodeId: string): boolean {
    // Short-circuit: stop at first true
    for (let i = 0; i < node.children.length; i++) {
      const result = this.evaluate(node.children[i], `${nodeId}.or[${i}]`);
      if (result) return true;
    }
    return false;
  }

  private evaluateNot(node: NotNode, nodeId: string): boolean {
    return !this.evaluate(node.child, `${nodeId}.not`);
  }

  getTraces(): RuleTrace[] {
    return this.traces;
  }
}

// ─── Scoring calculator ───────────────────────────────────────────────────────

function calculateScore(
  evidence: Awaited<ReturnType<typeof evidenceService.getForEntity>>,
  scoringRules: ScoringRule[],
  maxScore: number
): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let raw = 0;

  for (const rule of scoringRules) {
    const count = evidence.filter((e) => e.signalType === rule.signal).length;
    const contribution = count > 0 ? rule.weight : 0;
    breakdown[rule.signal] = contribution;
    raw += contribution;
  }

  // Normalise to maxScore
  const totalWeight = scoringRules.reduce((s, r) => s + r.weight, 0);
  const score = totalWeight > 0
    ? Math.min(Math.round((raw / totalWeight) * maxScore), maxScore)
    : 0;

  return { score, breakdown };
}

// ─── Main service ─────────────────────────────────────────────────────────────

export const ruleEngineService = {

  async evaluate(
    tenantId:        string,
    entityId:        string,
    intentVersionId: string,
    options: { isReplay?: boolean } = {}
  ): Promise<EvaluationResult> {

    const { isReplay = false } = options;

    // 1. Load intent version + compiled AST
    const [version] = await db
      .select()
      .from(intentVersions)
      .where(
        and(
          eq(intentVersions.id, intentVersionId),
          eq(intentVersions.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!version) {
      return {
        matched: false, score: 0, scoreBreakdown: {}, trace: [],
        errorMessage: `Intent version ${intentVersionId} not found`,
      };
    }

    if (!version.isValid || !version.compiledAst) {
      return {
        matched: false, score: 0, scoreBreakdown: {}, trace: [],
        errorMessage: "Intent version has no valid compiled AST",
      };
    }

    const ast = version.compiledAst as unknown as DslAst;

    // 2. Fetch evidence for this entity
    const evidence = await evidenceService.getForEntity(tenantId, entityId);

    // 3. Evaluate match
    const evaluator = new RuleEvaluator(evidence);
    let matched = false;
    let errorMessage: string | undefined;

    try {
      matched = evaluator.evaluate(ast.match);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "Rule evaluation error";
      matched = false;
    }

    // 4. Calculate score (only meaningful when matched, but compute always)
    const { score, breakdown } = ast.score
      ? calculateScore(evidence, ast.score.rules, ast.score.maxScore ?? 100)
      : { score: matched ? 100 : 0, breakdown: {} };

    const trace = evaluator.getTraces();

    // 5. Persist — skip writes for replay runs
    if (!isReplay) {
      await persistEvaluation({
        tenantId,
        entityId,
        intentId:        version.intentId,
        intentVersionId: version.id,
        matched,
        score:           matched ? score : 0,
        scoreBreakdown:  breakdown,
        trace,
        errorMessage,
      });
    }

    return {
      matched,
      score: matched ? score : 0,
      scoreBreakdown: breakdown,
      trace,
      errorMessage,
    };
  },
};

// ─── Persistence ──────────────────────────────────────────────────────────────

async function persistEvaluation(args: {
  tenantId:        string;
  entityId:        string;
  intentId:        string;
  intentVersionId: string;
  matched:         boolean;
  score:           number;
  scoreBreakdown:  Record<string, number>;
  trace:           RuleTrace[];
  errorMessage?:   string;
}): Promise<void> {
  const {
    tenantId, entityId, intentId, intentVersionId,
    matched, score, scoreBreakdown, trace, errorMessage,
  } = args;

  // Write intent_matches row
  const [match] = await db
    .insert(intentMatches)
    .values({
      tenantId,
      intentId,
      intentVersionId,
      entityId,
      entityType:     "contact",
      result:         errorMessage ? "error" : matched ? "matched" : "unmatched",
      score:          matched ? score : null,
      scoreBreakdown,
      isReplay:       false,
      errorMessage:   errorMessage ?? null,
    })
    .returning({ id: intentMatches.id });

  // Write one rule_execution_logs row per trace entry
  if (trace.length > 0) {
    await db.insert(ruleExecutionLogs).values(
      trace.map((t) => ({
        tenantId,
        matchId:        match.id,
        ruleId:         t.ruleId,
        ruleLabel:      t.ruleLabel,
        passed:         t.passed,
        evidenceIds:    t.evidenceIds,
        evaluatedValue: { value: t.evaluatedValue, signal: t.signal, operator: t.operator },
        expectedValue:  { value: t.expectedValue },
        executionMs:    t.executionMs,
      }))
    );
  }
}
