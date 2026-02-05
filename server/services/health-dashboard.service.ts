import { db } from "../db";
import { emailQueue, emails, schedulerHeartbeat } from "@shared/schema";
import { eq, and, sql, gte, lt } from "drizzle-orm";

export interface HealthOverview {
  deliveryHealth: number;
  deliveryStatus: "healthy" | "warning" | "critical";
  sentToday: number;
  failedToday: number;
  stuckCount: number;
  retryCount: number;
  pendingCount: number;
  sendingCount: number;
  aiBlocked: number;
  openRate: number;
  replyRate: number;
  schedulerStatus: "healthy" | "delayed" | "down" | "unknown";
  lastHeartbeat: Date | null;
}

export interface FailedEmail {
  id: string;
  subject: string | null;
  failureReason: string | null;
  lastError: string | null;
  failedAt: Date | null;
  attempts: number | null;
}

export interface StuckEmail {
  id: string;
  subject: string | null;
  scheduledFor: Date;
  createdAt: Date;
  stuckMinutes: number;
}

export interface RetryQueueItem {
  id: string;
  subject: string | null;
  attempts: number | null;
  nextRetryAt: Date | null;
  lastError: string | null;
}

export async function getHealthOverview(userId?: string, organizationId?: string): Promise<HealthOverview> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Always scope to either specific user or organization (never global)
  let userFilter;
  if (userId) {
    userFilter = eq(emailQueue.userId, userId);
  } else if (organizationId) {
    userFilter = eq(emailQueue.organizationId, organizationId);
  } else {
    // Fail safe - return empty if no scope provided
    return {
      deliveryHealth: 100,
      deliveryStatus: "healthy",
      sentToday: 0,
      failedToday: 0,
      stuckCount: 0,
      retryCount: 0,
      pendingCount: 0,
      sendingCount: 0,
      aiBlocked: 0,
      openRate: 0,
      replyRate: 0,
      schedulerStatus: "unknown",
      lastHeartbeat: null,
    };
  }
  
  const [queueStats, engagementStats, schedulerData] = await Promise.all([
    db
      .select({
        sentToday: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'sent' AND ${emailQueue.sentAt} >= ${todayStart})`,
        failedToday: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'failed' AND ${emailQueue.failedAt} >= ${todayStart})`,
        stuckCount: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'pending' AND ${emailQueue.createdAt} < NOW() - INTERVAL '10 minutes' AND ${emailQueue.scheduledFor} < NOW())`,
        retryCount: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'retrying')`,
        pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'pending')`,
        sendingCount: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'sending')`,
        aiBlocked: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.failureReason} = 'ai_blocked')`,
      })
      .from(emailQueue)
      .where(userFilter),
    db
      .select({
        totalSent: sql<number>`COUNT(*) FILTER (WHERE ${emails.status} = 'sent')`,
        opened: sql<number>`COUNT(*) FILTER (WHERE ${emails.openedAt} IS NOT NULL)`,
        replied: sql<number>`COUNT(*) FILTER (WHERE ${emails.repliedAt} IS NOT NULL)`,
      })
      .from(emails)
      .where(
        and(
          userId ? eq(emails.userId, userId) : (organizationId ? eq(emails.organizationId, organizationId) : sql`1=0`),
          gte(emails.createdAt, sql`NOW() - INTERVAL '30 days'`)
        )
      ),
    db
      .select({
        status: schedulerHeartbeat.status,
        lastHeartbeat: schedulerHeartbeat.lastHeartbeat,
      })
      .from(schedulerHeartbeat)
      .where(eq(schedulerHeartbeat.schedulerType, "email_queue"))
      .limit(1),
  ]);
  
  const stats = queueStats[0];
  const engagement = engagementStats[0];
  const scheduler = schedulerData[0];
  
  const sentToday = Number(stats?.sentToday || 0);
  const failedToday = Number(stats?.failedToday || 0);
  const totalToday = sentToday + failedToday;
  
  const deliveryHealth = totalToday > 0 
    ? Math.round((sentToday / totalToday) * 100) 
    : 100;
  
  let deliveryStatus: HealthOverview["deliveryStatus"] = "healthy";
  if (deliveryHealth < 85) {
    deliveryStatus = "critical";
  } else if (deliveryHealth < 95) {
    deliveryStatus = "warning";
  }
  
  const totalSent = Number(engagement?.totalSent || 0);
  const opened = Number(engagement?.opened || 0);
  const replied = Number(engagement?.replied || 0);
  
  const openRate = totalSent > 0 ? Number((opened / totalSent).toFixed(2)) : 0;
  const replyRate = totalSent > 0 ? Number((replied / totalSent).toFixed(2)) : 0;
  
  let schedulerStatus: HealthOverview["schedulerStatus"] = "unknown";
  let lastHeartbeat: Date | null = null;
  
  if (scheduler) {
    lastHeartbeat = scheduler.lastHeartbeat;
    const heartbeatAge = Date.now() - scheduler.lastHeartbeat.getTime();
    const heartbeatAgeMinutes = heartbeatAge / 60000;
    
    if (heartbeatAgeMinutes < 2) {
      schedulerStatus = "healthy";
    } else if (heartbeatAgeMinutes < 5) {
      schedulerStatus = "delayed";
    } else {
      schedulerStatus = "down";
    }
  }
  
  return {
    deliveryHealth,
    deliveryStatus,
    sentToday,
    failedToday,
    stuckCount: Number(stats?.stuckCount || 0),
    retryCount: Number(stats?.retryCount || 0),
    pendingCount: Number(stats?.pendingCount || 0),
    sendingCount: Number(stats?.sendingCount || 0),
    aiBlocked: Number(stats?.aiBlocked || 0),
    openRate,
    replyRate,
    schedulerStatus,
    lastHeartbeat,
  };
}

export async function getFailedEmails(
  userId?: string, 
  organizationId?: string,
  limit = 20
): Promise<FailedEmail[]> {
  if (!userId && !organizationId) return [];
  const userFilter = userId 
    ? eq(emailQueue.userId, userId) 
    : eq(emailQueue.organizationId, organizationId!);
  
  const results = await db
    .select({
      id: emailQueue.id,
      subject: emailQueue.subject,
      failureReason: emailQueue.failureReason,
      lastError: emailQueue.lastError,
      failedAt: emailQueue.failedAt,
      attempts: emailQueue.attempts,
    })
    .from(emailQueue)
    .where(and(eq(emailQueue.status, "failed"), userFilter))
    .orderBy(sql`${emailQueue.failedAt} DESC NULLS LAST`)
    .limit(limit);
  
  return results;
}

export async function getStuckEmails(
  userId?: string, 
  organizationId?: string,
  limit = 20
): Promise<StuckEmail[]> {
  if (!userId && !organizationId) return [];
  const userFilter = userId 
    ? eq(emailQueue.userId, userId) 
    : eq(emailQueue.organizationId, organizationId!);
  
  const results = await db
    .select({
      id: emailQueue.id,
      subject: emailQueue.subject,
      scheduledFor: emailQueue.scheduledFor,
      createdAt: emailQueue.createdAt,
    })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "pending"),
        sql`${emailQueue.createdAt} < NOW() - INTERVAL '10 minutes'`,
        sql`${emailQueue.scheduledFor} < NOW()`,
        userFilter
      )
    )
    .orderBy(sql`${emailQueue.createdAt} ASC`)
    .limit(limit);
  
  return results.map(r => ({
    ...r,
    stuckMinutes: Math.floor((Date.now() - r.createdAt.getTime()) / 60000),
  }));
}

export async function getRetryQueue(
  userId?: string, 
  organizationId?: string,
  limit = 20
): Promise<RetryQueueItem[]> {
  if (!userId && !organizationId) return [];
  const userFilter = userId 
    ? eq(emailQueue.userId, userId) 
    : eq(emailQueue.organizationId, organizationId!);
  
  const results = await db
    .select({
      id: emailQueue.id,
      subject: emailQueue.subject,
      attempts: emailQueue.attempts,
      nextRetryAt: emailQueue.nextRetryAt,
      lastError: emailQueue.lastError,
    })
    .from(emailQueue)
    .where(and(eq(emailQueue.status, "retrying"), userFilter))
    .orderBy(sql`${emailQueue.nextRetryAt} ASC NULLS LAST`)
    .limit(limit);
  
  return results;
}

export const healthDashboardService = {
  getHealthOverview,
  getFailedEmails,
  getStuckEmails,
  getRetryQueue,
};
