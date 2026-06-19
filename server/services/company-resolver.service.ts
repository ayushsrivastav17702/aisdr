/**
 * Company resolver — shared logic for linking a prospect to a companies row.
 * Used by both the Phase B backfill script and the live prospect creation path.
 *
 * Given a userId + prospect signals (email, companyDomain, companyName),
 * finds or creates the matching companies row and returns its id.
 * Returns null when no resolution is possible (personal email, no data).
 */

import { db } from "../db";
import { companies } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";
import { nanoid } from "nanoid";

// ─── Personal domain blocklist ────────────────────────────────────────────────
// Prospects with these email domains do NOT create a company entity.
// From design doc section 3 "Personal domain blocklist".
export const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.in",
  "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com",
  "protonmail.com", "proton.me",
  "tutanota.com",
  "rediffmail.com",
  "ymail.com",
  "mail.com",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeDomain(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^www\./, "")
    .replace(/[/:?#].*$/, "")
    .replace(/\.$/, "");
}

export function extractDomainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.match(/@([^@\s]+)$/);
  if (!match) return null;
  return normalizeDomain(match[1]);
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s*(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?|limited|group|holdings)$/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolves or creates a companies row for the given prospect signals.
 * Returns the company id to set on prospects.companyId, or null if unresolvable.
 *
 * Resolution order:
 *   1. companyDomain already set         → domain match, confidence=high
 *   2. Extract domain from primaryEmail  → domain match, confidence=high
 *      (blocked if personal email provider)
 *   3. companyName set but no domain     → name-only, confidence=low, needsReview=true
 *   4. Nothing usable                    → return null
 */
export async function resolveCompanyForProspect(params: {
  userId: string;
  primaryEmail?: string | null;
  companyDomain?: string | null;
  companyName?: string | null;
}): Promise<string | null> {
  const { userId, primaryEmail, companyDomain, companyName } = params;

  // Step 1: use companyDomain if already set
  if (companyDomain) {
    const domain = normalizeDomain(companyDomain);
    if (domain && !PERSONAL_DOMAINS.has(domain)) {
      return findOrCreateByDomain(userId, domain, companyName || domain, "high");
    }
  }

  // Step 2: extract domain from email
  const emailDomain = extractDomainFromEmail(primaryEmail);
  if (emailDomain && !PERSONAL_DOMAINS.has(emailDomain)) {
    return findOrCreateByDomain(userId, emailDomain, companyName || emailDomain, "high");
  }

  // Step 3: name-only fallback
  if (companyName?.trim()) {
    return findOrCreateByName(userId, companyName.trim());
  }

  return null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function findOrCreateByDomain(
  userId: string,
  domain: string,
  name: string,
  confidence: "high" | "low",
): Promise<string> {
  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.userId, userId), eq(companies.domain, domain)))
    .limit(1);

  if (existing) return existing.id;

  const id = nanoid();
  await db.insert(companies).values({
    id,
    userId,
    domain,
    name,
    confidence,
    needsReview: false,
  });
  return id;
}

async function findOrCreateByName(userId: string, name: string): Promise<string> {
  const normalizedName = normalizeCompanyName(name);

  // Fetch domain-less companies for this tenant and do normalized name matching
  const existing = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.userId, userId), isNull(companies.domain)))
    .limit(50);

  const match = existing.find(
    (c) => normalizeCompanyName(c.name) === normalizedName,
  );
  if (match) return match.id;

  const id = nanoid();
  await db.insert(companies).values({
    id,
    userId,
    domain: null,
    name,
    confidence: "low",
    needsReview: true,
  });
  return id;
}
