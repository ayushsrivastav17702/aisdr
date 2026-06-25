// ─── server/middleware/intent-engine-gate.middleware.ts ──────────────────────
// Drop this on any /v1/intents/* route that shouldn't be reachable
// until FEATURE_INTENT_ENGINE=true is set.

import { Request, Response, NextFunction } from "express";
import { flags } from "../config/feature-flags";

export function requireIntentEngine(req: Request, res: Response, next: NextFunction) {
  if (!flags.INTENT_ENGINE_ENABLED) {
    return res.status(503).json({
      error: "INTENT_ENGINE_DISABLED",
      message: "The Intent Definition Engine is not yet enabled for this environment. Set FEATURE_INTENT_ENGINE=true to activate.",
    });
  }
  next();
}
