// ─── server/services/evidence.service.ts ─────────────────────────────────────
// Writes validated, deduplicated signals to evidence_items.
// Called by webhook handlers, email event processors, and manual ingestion.
//
// Idempotency: same (tenantId + sourceEventId) within 7 days = no-op, returns cached id.
// Trust scores: configurable per source type via TRUST_SCORES map below.
// Freshness: stored at 100 on write; a scheduled job decays it over time (Phase 3).

import { db } from "../db";
import { evidenceItems } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Trust score defaults per source ─────────────────────────────────────────
// Higher = more reliable signal. Overridable per call.
const TRUST_SCORES: Record<string, number> = {
  email_open:        60,   // weak signal — easy to fake via pre-fetch
  email_click:       80,   // stronger — requires user action
  email_reply:       95,   // strongest email signal
  webhook:           75,   // external system — moderately trusted
  manual:            70,   // human-entered
  crm_update:        85,
  hiring_signal:     90,
  funding_event:     95,
  tech_adoption:     85,
  website_visit:     55,
};

// ─── Idempotency TTL ──────────────────────────────────────────────────────────
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestPayload {
  tenantId:       string;
  entityId:       string;                  // prospect.id (Phase 2 MVP)
  entityType?:    string;                  // default: 'contact'
  signalType:     string;                  // e.g. 'email_open', 'hiring_signal'
  sourceType:     string;                  // e.g. 'email_system', 'webhook', 'linkedin'
  sourceEventId?: string;                  // upstream dedup key; auto-generated if omitted
  sourceTimestamp?: Date;                  // when the signal occurred; defaults to now
  payload:        Record<string, unknown>; // raw signal data
  trustScore?:    number;                  // override default trust score
  expiresInDays?: number;                  // evidence TTL; default 90 days
}

export interface IngestResult {
  evidenceId: string;
  deduplicated: boolean;   // true = was a duplicate, returned cached id
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const evidenceService = {

  async ingest(payload: IngestPayload): Promise<IngestResult> {
    const {
      tenantId,
      entityId,
      entityType      = "contact",
      signalType,
      sourceType,
      sourceEventId   = randomUUID(),
      sourceTimestamp = new Date(),
      payload: data,
      trustScore,
      expiresInDays   = 90,
    } = payload;

    // ── Idempotency check ─────────────────────────────────────────────────────
    const cutoff = new Date(Date.now() - IDEMPOTENCY_TTL_MS);
    const existing = await db
      .select({ id: evidenceItems.id })
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.tenantId, tenantId),
          eq(evidenceItems.sourceEventId, sourceEventId),
          gt(evidenceItems.createdAt, cutoff)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return { evidenceId: existing[0].id, deduplicated: true };
    }

    // ── Resolve trust score ───────────────────────────────────────────────────
    const resolvedTrust = trustScore ?? TRUST_SCORES[signalType] ?? TRUST_SCORES[sourceType] ?? 50;

    // ── Write to vault ────────────────────────────────────────────────────────
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const [inserted] = await db
      .insert(evidenceItems)
      .values({
        tenantId,
        entityId,
        entityType,
        signalType,
        sourceType,
        sourceEventId,
        sourceTimestamp,
        payload:        data,
        trustScore:     resolvedTrust,
        freshnessScore: 100,
        isValid:        true,
        expiresAt,
      })
      .returning({ id: evidenceItems.id });

    return { evidenceId: inserted.id, deduplicated: false };
  },

  // ── Bulk ingest (for backfill / webhook batches) ──────────────────────────
  async ingestBatch(payloads: IngestPayload[]): Promise<IngestResult[]> {
    return Promise.all(payloads.map((p) => this.ingest(p)));
  },

  // ── Fetch evidence for a prospect (used by rule engine) ───────────────────
  async getForEntity(
    tenantId: string,
    entityId: string,
    options: {
      signalTypes?: string[];
      since?: Date;
      limit?: number;
    } = {}
  ) {
    const { signalTypes, since, limit = 200 } = options;

    const conditions = [
      eq(evidenceItems.tenantId, tenantId),
      eq(evidenceItems.entityId, entityId),
      eq(evidenceItems.isValid, true),
    ];

    if (since) conditions.push(gt(evidenceItems.sourceTimestamp, since));

    const rows = await db
      .select()
      .from(evidenceItems)
      .where(and(...conditions))
      .orderBy(evidenceItems.sourceTimestamp)
      .limit(limit);

    // Filter by signal type in memory (avoids complex SQL for MVP)
    if (signalTypes && signalTypes.length > 0) {
      return rows.filter((r) => signalTypes.includes(r.signalType));
    }

    return rows;
  },
};
