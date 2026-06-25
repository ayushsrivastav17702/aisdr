// ─── server/services/exclusion.service.ts ────────────────────────────────────

import { flags } from "../config/feature-flags";
import { db } from "../db";
import { intentMatches, ruleExecutionLogs, auditLogs } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProspectContext {
  id: string;
  email?: string;
  domain?: string;
  organizationId?: string;
  [key: string]: any;
}

export interface SequenceContext {
  id: string;
  exclusionRules?: any[];       // legacy JSONB column
  linkedIntentIds?: string[];   // Phase 2: intents that gate this sequence
  intentVersionId?: string;     // active version being evaluated
  [key: string]: any;
}

export interface ExclusionResult {
  excluded: boolean;
  reason: string | null;
  source: "legacy" | "intent_engine" | "shadow";
}

// Returned by evaluateIntentEngine — includes the DSL trace for shadow logging
interface IntentEngineResult {
  excluded: boolean;
  reason: string | null;
  matchId: string | null;
  evaluatedRules: RuleTrace[];
}

export interface RuleTrace {
  ruleId: string;
  ruleLabel: string | null;
  passed: boolean;
  signal: string;
  operator: string;
  evaluatedValue: unknown;
  expectedValue: unknown;
  evidenceIds: string[];
  executionMs: number;
}

// ─── Main service ─────────────────────────────────────────────────────────────

export const exclusionService = {
  async isExcluded(
    prospect: ProspectContext,
    sequence: SequenceContext,
    tenantId: string
  ): Promise<ExclusionResult> {

    // ── Legacy-only (default) ─────────────────────────────────────────────────
    if (!flags.INTENT_ENGINE_ENABLED && !flags.EXCLUSION_SHADOW_MODE) {
      const result = flags.LEGACY_EXCLUSION_RULES_ENABLED
        ? evaluateLegacyRules(prospect, sequence.exclusionRules ?? [])
        : { excluded: false, reason: null };
      return { ...result, source: "legacy" };
    }

    // ── Run intent engine (always needed for shadow or engine-only) ───────────
    const intentResult = await evaluateIntentEngine(prospect, sequence, tenantId);

    // ── Shadow mode ───────────────────────────────────────────────────────────
    if (flags.EXCLUSION_SHADOW_MODE) {
      const legacyResult = evaluateLegacyRules(prospect, sequence.exclusionRules ?? []);

      if (legacyResult.excluded !== intentResult.excluded) {
        // Fire-and-forget — never block the hot path on a log write
        logDiscrepancy({
          tenantId,
          prospectId:      prospect.id,
          sequenceId:      sequence.id,
          intentVersionId: sequence.intentVersionId ?? null,
          legacyExcluded:  legacyResult.excluded,
          engineExcluded:  intentResult.excluded,
          legacyReason:    legacyResult.reason,
          engineReason:    intentResult.reason,
          evaluatedRules:  intentResult.evaluatedRules,
          matchId:         intentResult.matchId,
        }).catch((err) =>
          console.error("[ExclusionShadow] Failed to persist discrepancy log:", err)
        );
      }

      // Shadow mode always returns legacy result — engine is observer only
      return { ...legacyResult, source: "shadow" };
    }

    // ── Intent engine only ────────────────────────────────────────────────────
    return {
      excluded: intentResult.excluded,
      reason:   intentResult.reason,
      source:   "intent_engine",
    };
  },
};

// ─── Discrepancy logger ───────────────────────────────────────────────────────
// Writes to auditLogs (this codebase's append-only table: userId/action/module/details),
// tagged with module = 'exclusion_shadow'. No new migration needed.
//
// Query to check cutover readiness:
//   SELECT
//     COUNT(*)                                          AS total_discrepancies,
//     COUNT(*) FILTER (WHERE details->>'legacyExcluded' = 'true'
//                        AND details->>'engineExcluded' = 'false') AS legacy_blocked_engine_allowed,
//     COUNT(*) FILTER (WHERE details->>'legacyExcluded' = 'false'
//                        AND details->>'engineExcluded' = 'true') AS engine_blocked_legacy_allowed
//   FROM audit_logs
//   WHERE module = 'exclusion_shadow'
//     AND created_at > NOW() - INTERVAL '7 days';

interface DiscrepancyPayload {
  tenantId:        string;
  prospectId:      string;
  sequenceId:      string;
  intentVersionId: string | null;
  legacyExcluded:  boolean;
  engineExcluded:  boolean;
  legacyReason:    string | null;
  engineReason:    string | null;
  evaluatedRules:  RuleTrace[];   // full DSL trace — what the engine actually evaluated
  matchId:         string | null; // link to intent_matches row for sandbox replay
}

async function logDiscrepancy(payload: DiscrepancyPayload): Promise<void> {
  await db.insert(auditLogs).values({
    userId: null,                 // system action — no acting user
    action: "discrepancy_detected",
    module: "exclusion_shadow",
    details: {
      tenantId:        payload.tenantId,
      prospectId:      payload.prospectId,
      sequenceId:      payload.sequenceId,
      intentVersionId: payload.intentVersionId,
      legacyExcluded:  payload.legacyExcluded,
      engineExcluded:  payload.engineExcluded,
      legacyReason:    payload.legacyReason,
      engineReason:    payload.engineReason,
      // The full rule trace: replay this in the Sandbox to reproduce and fix
      evaluatedRules:  payload.evaluatedRules,
      matchId:         payload.matchId,
      // Convenience classification for dashboard queries
      discrepancyType: payload.legacyExcluded && !payload.engineExcluded
        ? "legacy_blocked_engine_allowed"
        : "engine_blocked_legacy_allowed",
    },
  });
}

// ─── Legacy evaluator ─────────────────────────────────────────────────────────
// NOTE: This evaluates the {field, operator, value}[] rule shape from the
// original spec. AiSDR's actual sequences.exclusionRules column is a DIFFERENT
// shape — {skipContacted, skipUnsubscribed, skipDuplicates, contactedWithinDays}
// (see server/services/exclusion-filter.service.ts). This function is kept
// byte-for-byte as provided for shadow-mode comparison purposes, but it does
// NOT understand AiSDR's real exclusion rule format — see integration notes.

function evaluateLegacyRules(
  prospect: ProspectContext,
  rules: any[]
): { excluded: boolean; reason: string | null } {
  if (!rules || rules.length === 0) return { excluded: false, reason: null };

  for (const rule of rules) {
    try {
      const fieldValue = prospect[rule.field];
      let matched = false;

      switch (rule.operator) {
        case "equals":     matched = fieldValue === rule.value; break;
        case "not_equals": matched = fieldValue !== rule.value; break;
        case "contains":
          matched = typeof fieldValue === "string" && fieldValue.includes(rule.value);
          break;
        case "exists":
          matched = fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
          break;
        case "not_exists":
          matched = fieldValue === undefined || fieldValue === null || fieldValue === "";
          break;
        default:
          console.warn("[ExclusionLegacy] Unknown operator:", rule.operator);
          continue;
      }

      if (matched) {
        return {
          excluded: true,
          reason: rule.reason ?? `Excluded by rule: ${rule.field} ${rule.operator} ${rule.value}`,
        };
      }
    } catch (err) {
      console.error("[ExclusionLegacy] Rule evaluation error:", err, rule);
    }
  }

  return { excluded: false, reason: null };
}

// ─── Intent Engine evaluator (stub — Phase 2 replaces body) ──────────────────
// Returns full RuleTrace[] so shadow logger has the DSL context it needs.

async function evaluateIntentEngine(
  prospect: ProspectContext,
  sequence: SequenceContext,
  tenantId: string
): Promise<IntentEngineResult> {
  const linkedIntentIds = sequence.linkedIntentIds ?? [];
  if (linkedIntentIds.length === 0) {
    return { excluded: false, reason: null, matchId: null, evaluatedRules: [] };
  }

  const startMs = Date.now();

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const matches = await db
      .select()
      .from(intentMatches)
      .where(
        and(
          eq(intentMatches.tenantId, tenantId),
          eq(intentMatches.entityId, prospect.id),
          gte(intentMatches.evaluatedAt, cutoff)
        )
      )
      .orderBy(desc(intentMatches.evaluatedAt))
      .limit(10);

    const relevantMatch = matches.find(
      (m) => linkedIntentIds.includes(m.intentId) && m.result === "matched"
    );

    // Fetch rule execution logs for this match so shadow logger has the full trace
    let evaluatedRules: RuleTrace[] = [];
    if (relevantMatch) {
      const logs = await db
        .select()
        .from(ruleExecutionLogs)
        .where(eq(ruleExecutionLogs.matchId, relevantMatch.id))
        .orderBy(ruleExecutionLogs.createdAt);

      evaluatedRules = logs.map((log) => ({
        ruleId:         log.ruleId,
        ruleLabel:      log.ruleLabel,
        passed:         log.passed,
        signal:         (log.evaluatedValue as any)?.signal ?? log.ruleId,
        operator:       (log.evaluatedValue as any)?.operator ?? "unknown",
        evaluatedValue: log.evaluatedValue,
        expectedValue:  log.expectedValue,
        evidenceIds:    log.evidenceIds ?? [],
        executionMs:    log.executionMs ?? (Date.now() - startMs),
      }));
    }

    if (relevantMatch) {
      return {
        excluded:       false,
        reason:         null,
        matchId:        relevantMatch.id,
        evaluatedRules,
      };
    }

    return {
      excluded:       true,
      reason:         "Prospect did not match required intent criteria",
      matchId:        null,
      evaluatedRules,
    };
  } catch (err) {
    // Fail open — never block a prospect due to engine error
    console.error("[ExclusionIntentEngine] Evaluation error, failing open:", err);
    return { excluded: false, reason: null, matchId: null, evaluatedRules: [] };
  }
}
