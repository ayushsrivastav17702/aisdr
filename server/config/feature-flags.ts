// ─── server/config/feature-flags.ts ──────────────────────────────────────────
// Centralised feature flag registry.
// Phase 1: env-var driven (no UI, no DB).
// Phase 3: swap to DB-backed flags per tenant (tenantConfiguration table already exists).
//
// Usage:
//   import { flags } from "../config/feature-flags";
//   if (flags.INTENT_ENGINE_ENABLED) { ... } else { /* legacy path */ }

export interface FeatureFlags {
  // ── Phase 1 flags ──────────────────────────────────────────────────────────

  /**
   * Master switch for the Intent Definition Engine.
   * When true:
   *   - POST /v1/intents/* routes are active
   *   - Sequence exclusion logic reads from intent_matches instead of hardcoded exclusionRules
   * When false (default):
   *   - All IDE routes return 503 with a clear message
   *   - Legacy exclusionRules JSONB logic runs as before
   *
   * Set via env: FEATURE_INTENT_ENGINE=true
   */
  INTENT_ENGINE_ENABLED: boolean;

  /**
   * When true, the exclusionRules JSONB column on sequences is evaluated.
   * Automatically set to false when INTENT_ENGINE_ENABLED is true.
   * Can be overridden to run both in parallel during migration (shadow mode).
   *
   * Set via env: FEATURE_LEGACY_EXCLUSION_RULES=true
   */
  LEGACY_EXCLUSION_RULES_ENABLED: boolean;

  /**
   * Shadow mode: run BOTH the legacy exclusionRules AND the new intent engine,
   * log discrepancies, but use legacy result. Safe migration path.
   *
   * Set via env: FEATURE_EXCLUSION_SHADOW_MODE=true
   */
  EXCLUSION_SHADOW_MODE: boolean;

  // ── Phase 2 flags ──────────────────────────────────────────────────────────

  /**
   * Enables evidence ingestion from email webhooks → evidence_items table.
   * Safe to enable independently — purely additive, no existing logic touched.
   * Set: FEATURE_EVIDENCE_INGESTION=true
   */
  EVIDENCE_INGESTION_ENABLED: boolean;

  /**
   * Enables the rule engine scoring path alongside legacy ICP scoring.
   * Both run; legacy score is used as source of truth.
   * Discrepancies logged to auditLogs with module='intent_engine_scoring'.
   * Set: FEATURE_INTENT_ENGINE_SCORING=true
   */
  INTENT_ENGINE_SCORING_ENABLED: boolean;

  /**
   * Shadow mode for scoring: run both engines, log diffs, return legacy score.
   * Requires INTENT_ENGINE_SCORING_ENABLED=true.
   * Set: FEATURE_INTENT_ENGINE_SCORING_SHADOW=true
   */
  INTENT_ENGINE_SCORING_SHADOW: boolean;

  /**
   * Full cutover: use intent engine score as source of truth.
   * Only flip after shadow mode shows <5% discrepancy rate over 7+ days.
   * Set: FEATURE_INTENT_ENGINE_SCORING_ONLY=true
   */
  INTENT_ENGINE_SCORING_ONLY: boolean;

  /**
   * Enables the Apify LinkedIn job-postings extractor (hiring_signal evidence).
   * Checked in addition to EVIDENCE_INGESTION_ENABLED — both must be true.
   * Set: FEATURE_APIFY_EXTRACTION=true
   */
  APIFY_EXTRACTION_ENABLED: boolean;
}

function readBoolEnv(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val.toLowerCase() === "true" || val === "1";
}

export const flags: FeatureFlags = {
  // Phase 1
  INTENT_ENGINE_ENABLED:          readBoolEnv("FEATURE_INTENT_ENGINE", false),
  LEGACY_EXCLUSION_RULES_ENABLED: readBoolEnv("FEATURE_LEGACY_EXCLUSION_RULES", true),
  EXCLUSION_SHADOW_MODE:          readBoolEnv("FEATURE_EXCLUSION_SHADOW_MODE", false),

  // Phase 2
  EVIDENCE_INGESTION_ENABLED:     readBoolEnv("FEATURE_EVIDENCE_INGESTION", false),
  INTENT_ENGINE_SCORING_ENABLED:  readBoolEnv("FEATURE_INTENT_ENGINE_SCORING", false),
  INTENT_ENGINE_SCORING_SHADOW:   readBoolEnv("FEATURE_INTENT_ENGINE_SCORING_SHADOW", false),
  INTENT_ENGINE_SCORING_ONLY:     readBoolEnv("FEATURE_INTENT_ENGINE_SCORING_ONLY", false),

  APIFY_EXTRACTION_ENABLED:       readBoolEnv("FEATURE_APIFY_EXTRACTION", false),
};

// Enforce invariants
if (flags.INTENT_ENGINE_ENABLED && !flags.EXCLUSION_SHADOW_MODE) {
  flags.LEGACY_EXCLUSION_RULES_ENABLED = false;
}
if (flags.INTENT_ENGINE_SCORING_ONLY) {
  // Can't be scoring-only without the engine enabled
  flags.INTENT_ENGINE_SCORING_ENABLED = true;
}

// Log active flags on startup (visible in server logs)
console.log("[FeatureFlags]", JSON.stringify(flags, null, 2));
