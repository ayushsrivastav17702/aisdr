// ─── server/services/apify-jobs.service.ts ───────────────────────────────────
// Thin adapter: scrapes LinkedIn job postings for an account domain via Apify
// and ingests them into the Evidence Vault as 'hiring_signal' evidence.
// Mirrors email-evidence-tap.service.ts: never throws past this function,
// always catches/logs, returns counts.

import { flags } from "../config/feature-flags";
import { evidenceService, type IngestPayload } from "./evidence.service";

interface ApifyJobItem {
  id: string;
  title?: string;
  company?: string;
  location?: string;
  jobUrl?: string;
  description?: string;
  postedAt?: string; // ISO date string
}

export interface FetchAndIngestResult {
  ingested: number;
  deduplicated: number;
  errors: number;
}

const APIFY_RUN_SYNC_URL = "https://api.apify.com/v2/acts/curious_coder~linkedin-jobs-scraper/run-sync-get-dataset-items";

export async function fetchAndIngestJobPostings(
  tenantId: string,
  entityId: string,
  domain: string,
  keywords: string[]
): Promise<FetchAndIngestResult> {
  const result: FetchAndIngestResult = { ingested: 0, deduplicated: 0, errors: 0 };

  if (!flags.EVIDENCE_INGESTION_ENABLED) {
    console.warn("[ApifyJobsService] Skipped — FEATURE_EVIDENCE_INGESTION is disabled");
    return result;
  }

  try {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error("[ApifyJobsService] APIFY_API_TOKEN is not set — cannot call Apify API");
      result.errors++;
      return result;
    }

    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${keywords.join('+')}&company=${encodeURIComponent(domain)}`;

    const apiUrl = `${APIFY_RUN_SYNC_URL}?token=${apifyToken}`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: [searchUrl],
        count: 50,
        scrapeCompany: true,
      }),
    });

    if (!response.ok) {
      console.error(`[ApifyJobsService] Apify API returned ${response.status} for domain ${domain}`);
      result.errors++;
      return result;
    }

    const items: ApifyJobItem[] = await response.json();

    if (!Array.isArray(items) || items.length === 0) {
      console.log(`[ApifyJobsService] No job postings found for domain ${domain}`);
      return result;
    }

    const payloads: IngestPayload[] = items.map((item) => ({
      tenantId,
      entityId,
      entityType: "account",
      signalType: "hiring_signal",
      sourceType: "apify_linkedin",
      sourceEventId: `apify_linkedin_job_${item.id}`,
      sourceTimestamp: new Date(item.postedAt || Date.now()),
      payload: {
        title: item.title,
        company: item.company,
        location: item.location,
        url: item.jobUrl,
        description: item.description?.slice(0, 500),
      },
      trustScore: 85,
      expiresInDays: 90,
    }));

    const ingestResults = await evidenceService.ingestBatch(payloads);

    for (const r of ingestResults) {
      if (r.deduplicated) result.deduplicated++;
      else result.ingested++;
    }

    console.log(`[ApifyJobsService] Domain ${domain}: ingested ${result.ingested}, deduplicated ${result.deduplicated}`);
    return result;
  } catch (err) {
    console.error(`[ApifyJobsService] Failed to fetch/ingest job postings for ${domain}:`, err);
    result.errors++;
    return result;
  }
}
