/**
 * Phase B backfill: resolve companies for existing prospects.
 *
 * DRY RUN by default — no writes unless --execute flag is passed.
 *
 * Usage:
 *   npx tsx scripts/backfill-companies.ts            # dry run (safe default)
 *   npx tsx scripts/backfill-companies.ts --execute  # execute writes
 *
 * Resolution order (per design doc):
 *   1. companyDomain already set on prospect  → domain match, confidence=high
 *   2. Extract domain from primary_email       → domain match, confidence=high
 *      (personal email domains are blocked — no company created)
 *   3. companyName set but no domain found     → name-only record,
 *      confidence=low, needsReview=true
 *   4. Nothing usable                          → companyId stays NULL
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });

import { db } from "../server/db";
import { prospects, companies } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  PERSONAL_DOMAINS,
  normalizeDomain,
  extractDomainFromEmail,
} from "../server/services/company-resolver.service";

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--execute");

// ─── Helpers ─────────────────────────────────────────────────────────────────

// normalizeCompanyName only needed for dry-run display logic — not shared
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s*(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?|limited|group|holdings)$/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// ─── Resolution ──────────────────────────────────────────────────────────────

type Resolution =
  | { kind: "domain";   domain: string; companyName: string; confidence: "high"; signal: string }
  | { kind: "nameOnly"; companyName: string; confidence: "low"; signal: string }
  | { kind: "null";     reason: string };

function resolve(p: {
  companyDomain: string | null;
  companyName: string | null;
  primaryEmail: string | null;
}): Resolution {
  // Step 1: explicit companyDomain on prospect
  if (p.companyDomain) {
    const domain = normalizeDomain(p.companyDomain);
    if (domain && !PERSONAL_DOMAINS.has(domain)) {
      return {
        kind: "domain",
        domain,
        companyName: p.companyName || domain,
        confidence: "high",
        signal: `companyDomain="${p.companyDomain}"`,
      };
    }
  }

  // Step 2: extract domain from primary_email
  const emailDomain = extractDomainFromEmail(p.primaryEmail);
  if (emailDomain) {
    if (!PERSONAL_DOMAINS.has(emailDomain)) {
      return {
        kind: "domain",
        domain: emailDomain,
        companyName: p.companyName || emailDomain,
        confidence: "high",
        signal: `email domain "${emailDomain}"`,
      };
    }
    // personal domain — fall through, don't create company from this
  }

  // Step 3: company name only
  if (p.companyName?.trim()) {
    return {
      kind: "nameOnly",
      companyName: p.companyName.trim(),
      confidence: "low",
      signal: "companyName only (no domain)",
    };
  }

  // Step 4: nothing usable
  const reason = !p.primaryEmail
    ? "no email, no companyName"
    : emailDomain && PERSONAL_DOMAINS.has(emailDomain)
    ? `personal domain (${emailDomain}), no companyName`
    : "no usable domain or companyName";

  return { kind: "null", reason };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const mode = DRY_RUN ? "DRY RUN — no writes" : "⚠️  LIVE EXECUTE MODE — writes enabled";
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Phase B backfill: companies table`);
  console.log(`  Mode: ${mode}`);
  console.log(`${"═".repeat(64)}\n`);

  const allProspects = await db
    .select({
      id:            prospects.id,
      userId:        prospects.userId,
      primaryEmail:  prospects.primaryEmail,
      companyDomain: prospects.companyDomain,
      companyName:   prospects.companyName,
    })
    .from(prospects)
    .where(isNull(prospects.companyId));

  console.log(`Prospects with companyId = NULL: ${allProspects.length}\n`);

  if (allProspects.length === 0) {
    console.log("Nothing to backfill. Exiting.");
    return;
  }

  // In-memory dedup cache: "userId|domain" or "userId|name:<normalized>" → companyId
  const companyCache = new Map<string, string>();

  // Per-row result for the detail table
  type RowResult = {
    email:         string;
    inputDomain:   string;
    inputName:     string;
    signal:        string;
    resolution:    string;
    companyName:   string;
    domainUsed:    string;
    confidence:    string;
    action:        string;
  };
  const rows: RowResult[] = [];

  // Counters
  let linkedHigh = 0;
  let linkedLow  = 0;
  let leftNull   = 0;
  let createdHigh = 0;
  let createdLow  = 0;

  for (const p of allProspects) {
    const res = resolve(p);

    const baseRow = {
      email:       p.primaryEmail       ?? "(none)",
      inputDomain: p.companyDomain      ?? "",
      inputName:   p.companyName        ?? "",
    };

    if (res.kind === "null") {
      leftNull++;
      rows.push({
        ...baseRow,
        signal:      "—",
        resolution:  "NULL",
        companyName: "—",
        domainUsed:  "—",
        confidence:  "—",
        action:      `skip: ${res.reason}`,
      });
      continue;
    }

    if (res.kind === "domain") {
      const cacheKey = `${p.userId}|${res.domain}`;
      let companyId = companyCache.get(cacheKey);
      let action: string;

      if (!companyId) {
        const [existing] = await db
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.userId, p.userId), eq(companies.domain, res.domain)))
          .limit(1);

        if (existing) {
          companyId = existing.id;
          action = "link → existing company";
        } else {
          companyId = nanoid();
          createdHigh++;
          action = "create new company (high)";
          if (!DRY_RUN) {
            await db.insert(companies).values({
              id:         companyId,
              userId:     p.userId,
              domain:     res.domain,
              name:       res.companyName,
              confidence: "high",
              needsReview: false,
            });
          }
        }
        companyCache.set(cacheKey, companyId);
      } else {
        action = "link → cached company";
      }

      linkedHigh++;
      if (!DRY_RUN) {
        await db.update(prospects).set({ companyId }).where(eq(prospects.id, p.id));
      }
      rows.push({
        ...baseRow,
        signal:      res.signal,
        resolution:  "LINK (high)",
        companyName: res.companyName,
        domainUsed:  res.domain,
        confidence:  "high",
        action,
      });
    }

    if (res.kind === "nameOnly") {
      const normalizedName = normalizeCompanyName(res.companyName);
      const cacheKey = `${p.userId}|name:${normalizedName}`;
      let companyId = companyCache.get(cacheKey);
      let action: string;

      if (!companyId) {
        const existing = await db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(and(eq(companies.userId, p.userId), isNull(companies.domain)))
          .limit(50);

        const nameMatch = existing.find(
          c => normalizeCompanyName(c.name) === normalizedName
        );

        if (nameMatch) {
          companyId = nameMatch.id;
          action = "link → existing name-only company";
        } else {
          companyId = nanoid();
          createdLow++;
          action = "create new company (low, needsReview)";
          if (!DRY_RUN) {
            await db.insert(companies).values({
              id:          companyId,
              userId:      p.userId,
              domain:      null,
              name:        res.companyName,
              confidence:  "low",
              needsReview: true,
            });
          }
        }
        companyCache.set(cacheKey, companyId);
      } else {
        action = "link → cached name-only company";
      }

      linkedLow++;
      if (!DRY_RUN) {
        await db.update(prospects).set({ companyId }).where(eq(prospects.id, p.id));
      }
      rows.push({
        ...baseRow,
        signal:      res.signal,
        resolution:  "LINK (low)",
        companyName: res.companyName,
        domainUsed:  "(none)",
        confidence:  "low ⚠️",
        action,
      });
    }
  }

  // ─── Per-prospect detail table ───────────────────────────────────────────────
  const col = (s: string, w: number) => s.padEnd(w).slice(0, w);

  console.log("Per-prospect resolution:");
  console.log("─".repeat(120));
  console.log(
    col("EMAIL", 32) +
    col("SIGNAL", 24) +
    col("COMPANY NAME", 24) +
    col("DOMAIN USED", 20) +
    col("CONFIDENCE", 12) +
    col("ACTION", 32)
  );
  console.log("─".repeat(120));

  for (const r of rows) {
    console.log(
      col(r.email,       32) +
      col(r.signal,      24) +
      col(r.companyName, 24) +
      col(r.domainUsed,  20) +
      col(r.confidence,  12) +
      col(r.action,      32)
    );
  }

  // ─── Summary table ───────────────────────────────────────────────────────────
  const total = allProspects.length;
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  SUMMARY${DRY_RUN ? " (dry run — nothing written)" : " (writes executed)"}`);
  console.log(`${"═".repeat(64)}`);
  console.log(`  Total prospects processed        : ${total}`);
  console.log(`  ├─ Linked, confidence=high       : ${linkedHigh}`);
  console.log(`  │    of which new companies      : ${createdHigh}`);
  console.log(`  │    of which existing companies : ${linkedHigh - createdHigh}`);
  console.log(`  ├─ Linked, confidence=low ⚠️      : ${linkedLow}`);
  console.log(`  │    of which new companies      : ${createdLow}`);
  console.log(`  │    of which existing companies : ${linkedLow - createdLow}`);
  console.log(`  └─ Left NULL (unresolvable)      : ${leftNull}`);
  console.log(`     NULL rate                     : ${((leftNull / total) * 100).toFixed(1)}%`);
  console.log(`${"═".repeat(64)}`);

  if (DRY_RUN) {
    console.log(`\n  → Dry run complete. No data was written.`);
    console.log(`     Re-run with --execute to apply.\n`);
  } else {
    console.log(`\n  ✅ Backfill complete. All writes applied.\n`);
  }
}

run().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
