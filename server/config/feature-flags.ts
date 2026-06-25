// ─── server/config/feature-flags.ts ──────────────────────────────────────────
// Centralised feature flag registry.
// Phase 1: env-var driven (no UI, no DB).
// Phase 3: swap to DB-backed flags per tenant (tenantConfiguration table already exists).
//
// Usage:
//   import { flags } from "../config/feature-flags";
//   if (flags.INTENT_ENGINE_ENABLED) { ... } else { /* legacy path */ }

export interface FeatureFlags {
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
}

function readBoolEnv(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val.toLowerCase() === "true" || val === "1";
}

export const flags: FeatureFlags = {
  INTENT_ENGINE_ENABLED:          readBoolEnv("FEATURE_INTENT_ENGINE", false),
  LEGACY_EXCLUSION_RULES_ENABLED: readBoolEnv("FEATURE_LEGACY_EXCLUSION_RULES", true),
  EXCLUSION_SHADOW_MODE:          readBoolEnv("FEATURE_EXCLUSION_SHADOW_MODE", false),
};

// Enforce invariant: if Intent Engine is on and shadow mode is off,
// disable legacy path automatically.
if (flags.INTENT_ENGINE_ENABLED && !flags.EXCLUSION_SHADOW_MODE) {
  flags.LEGACY_EXCLUSION_RULES_ENABLED = false;
}

// Log active flags on startup (visible in server logs)
console.log("[FeatureFlags]", JSON.stringify(flags, null, 2));
