import { db } from "../db";
import { emailQueue, prospects, sequences } from "@shared/schema";
import { eq, and, sql, lt, inArray } from "drizzle-orm";
import { notificationService } from "./notification.service";

export type ErrorType = 
  | "smtp_4xx"
  | "smtp_5xx"
  | "timeout"
  | "network_error"
  | "rate_limit"
  | "auth_error"
  | "invalid_email"
  | "blocked_domain"
  | "ai_blocked"
  | "missing_message_id"
  | "unknown";

export interface ClassifiedError {
  type: ErrorType;
  retryable: boolean;
  message: string;
  originalError?: Error;
}

export function classifySmtpError(error: Error | string): ClassifiedError {
  const errorStr = error instanceof Error ? error.message : String(error);
  const errorLower = errorStr.toLowerCase();
  
  if (/4\d{2}/.test(errorStr) || errorLower.includes("temporarily")) {
    return { type: "smtp_4xx", retryable: true, message: errorStr };
  }
  
  if (/5\d{2}/.test(errorStr)) {
    if (errorLower.includes("invalid") || errorLower.includes("not exist") || 
        errorLower.includes("mailbox") || errorLower.includes("recipient")) {
      return { type: "invalid_email", retryable: false, message: errorStr };
    }
    if (errorLower.includes("blocked") || errorLower.includes("blacklist") ||
        errorLower.includes("spam") || errorLower.includes("reject")) {
      return { type: "blocked_domain", retryable: false, message: errorStr };
    }
    return { type: "smtp_5xx", retryable: false, message: errorStr };
  }
  
  if (errorLower.includes("timeout") || errorLower.includes("timed out") ||
      errorLower.includes("etimedout")) {
    return { type: "timeout", retryable: true, message: errorStr };
  }
  
  if (errorLower.includes("econnrefused") || errorLower.includes("econnreset") ||
      errorLower.includes("network") || errorLower.includes("socket")) {
    return { type: "network_error", retryable: true, message: errorStr };
  }
  
  if (errorLower.includes("rate") || errorLower.includes("throttl") ||
      errorLower.includes("too many") || errorLower.includes("limit exceed")) {
    return { type: "rate_limit", retryable: true, message: errorStr };
  }
  
  if (errorLower.includes("auth") || errorLower.includes("credential") ||
      errorLower.includes("password") || errorLower.includes("login")) {
    return { type: "auth_error", retryable: true, message: errorStr };
  }
  
  if (errorLower.includes("no signal") || errorLower.includes("ai blocked") ||
      errorLower.includes("flagged")) {
    return { type: "ai_blocked", retryable: false, message: errorStr };
  }
  
  if (errorLower.includes("message_id") || errorLower.includes("messageid")) {
    return { type: "missing_message_id", retryable: false, message: errorStr };
  }
  
  return { type: "unknown", retryable: true, message: errorStr };
}

export function getBackoffDelay(retryCount: number): number {
  switch (retryCount) {
    case 1: return 2 * 60 * 1000;
    case 2: return 5 * 60 * 1000;
    case 3: return 15 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

export interface WatchdogResult {
  stuckSending: number;
  pendingTooLong: number;
  retryOverdue: number;
  phantomSent: number;
  alertsSent: number;
}

export interface AlertThresholds {
  failedInLast10Min: number;
  retryingInQueue: number;
  pendingOver10Min: number;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  failedInLast10Min: 5,
  retryingInQueue: 20,
  pendingOver10Min: 10,
};

export async function runWatchdog(): Promise<WatchdogResult> {
  const result: WatchdogResult = {
    stuckSending: 0,
    pendingTooLong: 0,
    retryOverdue: 0,
    phantomSent: 0,
    alertsSent: 0,
  };
  
  const now = new Date();
  
  const stuckSending = await db
    .select({ id: emailQueue.id, userId: emailQueue.userId, attempts: emailQueue.attempts })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "sending"),
        sql`${emailQueue.lastAttemptAt} < NOW() - INTERVAL '5 minutes'`
      )
    )
    .limit(100);
  
  for (const email of stuckSending) {
    const newAttempts = (email.attempts || 0) + 1;
    if (newAttempts > 3) {
      await db.update(emailQueue).set({
        status: "failed",
        failedAt: now,
        lastAttemptAt: now,
        failureReason: "Stuck in sending state (watchdog)",
        lastError: "Email stuck in sending state for >5 minutes, exceeded max retries",
      }).where(eq(emailQueue.id, email.id));
    } else {
      const backoffMs = getBackoffDelay(newAttempts);
      const nextRetryTime = new Date(now.getTime() + backoffMs);
      await db.update(emailQueue).set({
        status: "retrying",
        attempts: newAttempts,
        lastAttemptAt: now,
        nextRetryAt: nextRetryTime,
        scheduledFor: nextRetryTime,
        lastError: "Watchdog: stuck in sending, moved to retrying",
      }).where(eq(emailQueue.id, email.id));
    }
    result.stuckSending++;
    console.log(`🔧 [WATCHDOG] Email ${email.id}: stuck sending → retrying (attempt ${newAttempts})`);
  }
  
  const pendingTooLong = await db
    .select({ id: emailQueue.id, userId: emailQueue.userId, attempts: emailQueue.attempts })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "pending"),
        sql`${emailQueue.createdAt} < NOW() - INTERVAL '10 minutes'`,
        sql`${emailQueue.scheduledFor} < NOW()`
      )
    )
    .limit(100);
  
  for (const email of pendingTooLong) {
    const newAttempts = (email.attempts || 0) + 1;
    if (newAttempts > 3) {
      await db.update(emailQueue).set({
        status: "failed",
        failedAt: now,
        lastAttemptAt: now,
        failureReason: "Pending too long (watchdog)",
        lastError: "Email pending for >10 minutes, exceeded max retries",
      }).where(eq(emailQueue.id, email.id));
    } else {
      const backoffMs = getBackoffDelay(newAttempts);
      const nextRetryTime = new Date(now.getTime() + backoffMs);
      await db.update(emailQueue).set({
        status: "retrying",
        attempts: newAttempts,
        lastAttemptAt: now,
        nextRetryAt: nextRetryTime,
        scheduledFor: nextRetryTime,
        lastError: "Watchdog: pending too long, moved to retrying",
      }).where(eq(emailQueue.id, email.id));
    }
    result.pendingTooLong++;
    console.log(`🔧 [WATCHDOG] Email ${email.id}: pending too long → retrying (attempt ${newAttempts})`);
  }
  
  const retryOverdue = await db
    .select({ id: emailQueue.id })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "retrying"),
        sql`${emailQueue.nextRetryAt} < NOW()`
      )
    )
    .limit(100);
  
  for (const email of retryOverdue) {
    await db.update(emailQueue).set({
      status: "pending",
      lastAttemptAt: now,
      scheduledFor: now,
      nextRetryAt: null,
    }).where(eq(emailQueue.id, email.id));
    result.retryOverdue++;
    console.log(`🔧 [WATCHDOG] Email ${email.id}: retry overdue → pending (enqueued for immediate send)`);
  }
  
  const phantomSent = await db
    .select({ id: emailQueue.id, userId: emailQueue.userId })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "sent"),
        sql`${emailQueue.messageId} IS NULL`
      )
    )
    .limit(100);
  
  for (const email of phantomSent) {
    await db.update(emailQueue).set({
      status: "failed",
      failedAt: now,
      failureReason: "Sent without messageId (watchdog)",
      lastError: "CRITICAL: Email marked sent without valid SMTP messageId",
    }).where(eq(emailQueue.id, email.id));
    result.phantomSent++;
    console.error(`❌ [WATCHDOG] PHANTOM SENT: Email ${email.id} marked sent without messageId!`);
  }
  
  const alertsNeeded = await checkAlertThresholds(DEFAULT_THRESHOLDS);
  if (alertsNeeded.shouldAlert) {
    result.alertsSent++;
    console.warn(`🚨 [WATCHDOG ALERT] ${alertsNeeded.reason}`);
  }
  
  return result;
}

async function checkAlertThresholds(thresholds: AlertThresholds): Promise<{ shouldAlert: boolean; reason: string }> {
  const [failedRecent, retryingCount, pendingOld] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` })
      .from(emailQueue)
      .where(
        and(
          eq(emailQueue.status, "failed"),
          sql`${emailQueue.failedAt} > NOW() - INTERVAL '10 minutes'`
        )
      )
      .then(r => Number(r[0]?.count || 0)),
    db.select({ count: sql<number>`COUNT(*)` })
      .from(emailQueue)
      .where(eq(emailQueue.status, "retrying"))
      .then(r => Number(r[0]?.count || 0)),
    db.select({ count: sql<number>`COUNT(*)` })
      .from(emailQueue)
      .where(
        and(
          eq(emailQueue.status, "pending"),
          sql`${emailQueue.createdAt} < NOW() - INTERVAL '10 minutes'`
        )
      )
      .then(r => Number(r[0]?.count || 0)),
  ]);
  
  const reasons: string[] = [];
  
  if (failedRecent > thresholds.failedInLast10Min) {
    reasons.push(`${failedRecent} failed in last 10min (threshold: ${thresholds.failedInLast10Min})`);
  }
  if (retryingCount > thresholds.retryingInQueue) {
    reasons.push(`${retryingCount} in retry queue (threshold: ${thresholds.retryingInQueue})`);
  }
  if (pendingOld > thresholds.pendingOver10Min) {
    reasons.push(`${pendingOld} pending >10min (threshold: ${thresholds.pendingOver10Min})`);
  }
  
  return {
    shouldAlert: reasons.length > 0,
    reason: reasons.join("; "),
  };
}

export interface QueueMetrics {
  queueDepth: { pending: number; retrying: number; sending: number };
  avgSendTimeMs: number;
  retryRate: number;
  failureRate: number;
  phantomSentCount: number;
}

export async function getQueueMetrics(): Promise<QueueMetrics> {
  const [depths, avgTime, rates, phantoms] = await Promise.all([
    Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(emailQueue).where(eq(emailQueue.status, "pending")),
      db.select({ count: sql<number>`COUNT(*)` }).from(emailQueue).where(eq(emailQueue.status, "retrying")),
      db.select({ count: sql<number>`COUNT(*)` }).from(emailQueue).where(eq(emailQueue.status, "sending")),
    ]).then(([p, r, s]) => ({
      pending: Number(p[0]?.count || 0),
      retrying: Number(r[0]?.count || 0),
      sending: Number(s[0]?.count || 0),
    })),
    db.select({
      avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (sent_at - last_attempt_at)) * 1000)`
    })
      .from(emailQueue)
      .where(
        and(
          eq(emailQueue.status, "sent"),
          sql`${emailQueue.sentAt} > NOW() - INTERVAL '1 hour'`
        )
      )
      .then(r => Number(r[0]?.avgMs || 0)),
    db.select({
      total: sql<number>`COUNT(*)`,
      retried: sql<number>`COUNT(*) FILTER (WHERE attempts > 0)`,
      failed: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')`,
    })
      .from(emailQueue)
      .where(sql`${emailQueue.createdAt} > NOW() - INTERVAL '1 hour'`)
      .then(r => ({
        retryRate: Number(r[0]?.total) > 0 ? Number(r[0]?.retried) / Number(r[0]?.total) : 0,
        failureRate: Number(r[0]?.total) > 0 ? Number(r[0]?.failed) / Number(r[0]?.total) : 0,
      })),
    db.select({ count: sql<number>`COUNT(*)` })
      .from(emailQueue)
      .where(
        and(
          eq(emailQueue.status, "sent"),
          sql`${emailQueue.messageId} IS NULL`
        )
      )
      .then(r => Number(r[0]?.count || 0)),
  ]);
  
  return {
    queueDepth: depths,
    avgSendTimeMs: avgTime,
    retryRate: rates.retryRate,
    failureRate: rates.failureRate,
    phantomSentCount: phantoms,
  };
}

export const emailErrorClassifier = {
  classifySmtpError,
  getBackoffDelay,
  runWatchdog,
  getQueueMetrics,
  checkAlertThresholds,
};
