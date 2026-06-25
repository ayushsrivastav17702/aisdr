// ─── server/services/email-evidence-tap.service.ts ───────────────────────────
// Thin adapter: call these from your existing email webhook handlers.
// Does NOT replace webhook handling — just adds evidence ingestion alongside it.
//
// Usage (in your existing email webhook handler):
//
//   import { emailEvidenceTap } from "../services/email-evidence-tap.service";
//
//   // existing open handler:
//   async function handleEmailOpen(event: EmailOpenEvent) {
//     await updateEmailStats(event);          // existing code untouched
//     await emailEvidenceTap.onOpen(event);   // ADD THIS LINE
//   }

import { evidenceService } from "./evidence.service";

// ─── Adapted to the real payload shapes available at each call site ─────────
// (server/services/email-tracking.service.ts recordOpen/recordClick,
//  server/services/reply-detection.service.ts processReply)

interface EmailOpenEvent {
  tenantId:    string;
  prospectId:  string;
  messageId:   string;
  campaignId?: string;
  sequenceId?: string;
  emailId?:    string;
  timestamp:   Date;
  subject?:    string;
}

interface EmailClickEvent extends EmailOpenEvent {
  // recordClick(trackingId) does not currently receive the destination URL
  // (it's only known in the routes.ts handler that calls it) — left optional
  // rather than forced/faked. See PHASE2 integration notes.
  url?:        string;
  linkLabel?:  string;
}

interface EmailReplyEvent extends EmailOpenEvent {
  replyText?:  string;
  threadId?:   string;
}

// ─── Tap functions ────────────────────────────────────────────────────────────

export const emailEvidenceTap = {

  async onOpen(event: EmailOpenEvent): Promise<void> {
    await evidenceService.ingest({
      tenantId:        event.tenantId,
      entityId:        event.prospectId,
      entityType:      "contact",
      signalType:      "email_open",
      sourceType:      "email_system",
      sourceEventId:   `open_${event.messageId}`,
      sourceTimestamp: event.timestamp,
      payload: {
        messageId:  event.messageId,
        campaignId: event.campaignId,
        sequenceId: event.sequenceId,
        emailId:    event.emailId,
        subject:    event.subject,
      },
      // email_open trust score = 60 (default in evidence.service.ts)
    }).catch((err) =>
      // Never let evidence ingestion break the main webhook flow
      console.error("[EmailEvidenceTap] onOpen failed:", err)
    );
  },

  async onClick(event: EmailClickEvent): Promise<void> {
    await evidenceService.ingest({
      tenantId:        event.tenantId,
      entityId:        event.prospectId,
      entityType:      "contact",
      signalType:      "email_click",
      sourceType:      "email_system",
      sourceEventId:   `click_${event.messageId}_${event.url ?? "unknown"}`,
      sourceTimestamp: event.timestamp,
      payload: {
        messageId:  event.messageId,
        campaignId: event.campaignId,
        sequenceId: event.sequenceId,
        url:        event.url ?? null,
        linkLabel:  event.linkLabel,
      },
      // email_click trust score = 80
    }).catch((err) =>
      console.error("[EmailEvidenceTap] onClick failed:", err)
    );
  },

  async onReply(event: EmailReplyEvent): Promise<void> {
    await evidenceService.ingest({
      tenantId:        event.tenantId,
      entityId:        event.prospectId,
      entityType:      "contact",
      signalType:      "email_reply",
      sourceType:      "email_system",
      sourceEventId:   `reply_${event.messageId}`,
      sourceTimestamp: event.timestamp,
      payload: {
        messageId:  event.messageId,
        campaignId: event.campaignId,
        sequenceId: event.sequenceId,
        threadId:   event.threadId,
        // Note: do NOT store reply text here — PII risk.
        // Store only the signal that a reply occurred.
        hasReply:   true,
      },
      // email_reply trust score = 95
    }).catch((err) =>
      console.error("[EmailEvidenceTap] onReply failed:", err)
    );
  },
};
