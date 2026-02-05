import { db } from "../db";
import { sql, eq, and, gte, desc } from "drizzle-orm";
import { emailQueue, schedulerHeartbeat, auditLogs } from "@shared/schema";

export type AlertType = 
  | "STUCK_QUEUE"
  | "DELIVERY_FAILURE"
  | "AI_ERROR"
  | "SCHEDULER_DOWN"
  | "HIGH_RETRY_RATE"
  | "BOUNCE_RATE_HIGH";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  count?: number;
  threshold?: number;
  triggeredAt: Date;
}

interface AlertThresholds {
  stuckQueue: number;
  failureRatePercent: number;
  retryQueueSize: number;
  schedulerDownMinutes: number;
  pendingOldMinutes: number;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  stuckQueue: 5,
  failureRatePercent: 10,
  retryQueueSize: 20,
  schedulerDownMinutes: 5,
  pendingOldMinutes: 10,
};

const alertThrottleMap = new Map<AlertType, number>();
const THROTTLE_MS = 30 * 60 * 1000;

function shouldThrottle(type: AlertType): boolean {
  const lastAlert = alertThrottleMap.get(type);
  if (!lastAlert) return false;
  return Date.now() - lastAlert < THROTTLE_MS;
}

function markAlerted(type: AlertType): void {
  alertThrottleMap.set(type, Date.now());
}

export async function checkAlerts(
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS,
  organizationId?: string
): Promise<Alert[]> {
  // SECURITY: Require organizationId to prevent cross-tenant data leakage
  if (!organizationId) {
    console.warn("[AlertService] checkAlerts called without organizationId - returning empty");
    return [];
  }
  
  const alerts: Alert[] = [];
  const now = new Date();
  
  // Tenant-scoped query filter (always scoped)
  const orgFilter = sql`AND ${emailQueue.organizationId} = ${organizationId}`;
  
  const [queueStats, schedulerData] = await Promise.all([
    db
      .select({
        stuckCount: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'pending' AND ${emailQueue.createdAt} < NOW() - INTERVAL '${sql.raw(thresholds.pendingOldMinutes.toString())} minutes' AND ${emailQueue.scheduledFor} < NOW() ${orgFilter})`,
        retryCount: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'retrying' ${orgFilter})`,
        failedRecent: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'failed' AND ${emailQueue.failedAt} > NOW() - INTERVAL '10 minutes' ${orgFilter})`,
        sentRecent: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.status} = 'sent' AND ${emailQueue.sentAt} > NOW() - INTERVAL '10 minutes' ${orgFilter})`,
        aiBlocked: sql<number>`COUNT(*) FILTER (WHERE ${emailQueue.failureReason} = 'ai_blocked' AND ${emailQueue.failedAt} > NOW() - INTERVAL '1 hour' ${orgFilter})`,
      })
      .from(emailQueue),
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
  const scheduler = schedulerData[0];
  
  const stuckCount = Number(stats?.stuckCount || 0);
  if (stuckCount > thresholds.stuckQueue && !shouldThrottle("STUCK_QUEUE")) {
    alerts.push({
      type: "STUCK_QUEUE",
      severity: stuckCount > thresholds.stuckQueue * 2 ? "critical" : "high",
      message: `${stuckCount} emails stuck in queue for >${thresholds.pendingOldMinutes} minutes`,
      count: stuckCount,
      threshold: thresholds.stuckQueue,
      triggeredAt: now,
    });
    markAlerted("STUCK_QUEUE");
  }
  
  const failedRecent = Number(stats?.failedRecent || 0);
  const sentRecent = Number(stats?.sentRecent || 0);
  const totalRecent = failedRecent + sentRecent;
  
  if (totalRecent > 10) {
    const failureRate = (failedRecent / totalRecent) * 100;
    if (failureRate > thresholds.failureRatePercent && !shouldThrottle("DELIVERY_FAILURE")) {
      alerts.push({
        type: "DELIVERY_FAILURE",
        severity: failureRate > 25 ? "critical" : "high",
        message: `Delivery failure rate is ${failureRate.toFixed(1)}% (${failedRecent} failed in last 10 min)`,
        count: failedRecent,
        threshold: thresholds.failureRatePercent,
        triggeredAt: now,
      });
      markAlerted("DELIVERY_FAILURE");
    }
  }
  
  const retryCount = Number(stats?.retryCount || 0);
  if (retryCount > thresholds.retryQueueSize && !shouldThrottle("HIGH_RETRY_RATE")) {
    alerts.push({
      type: "HIGH_RETRY_RATE",
      severity: retryCount > thresholds.retryQueueSize * 2 ? "high" : "medium",
      message: `${retryCount} emails in retry queue (threshold: ${thresholds.retryQueueSize})`,
      count: retryCount,
      threshold: thresholds.retryQueueSize,
      triggeredAt: now,
    });
    markAlerted("HIGH_RETRY_RATE");
  }
  
  if (scheduler) {
    const heartbeatAge = Date.now() - scheduler.lastHeartbeat.getTime();
    const heartbeatAgeMinutes = heartbeatAge / 60000;
    
    if (heartbeatAgeMinutes > thresholds.schedulerDownMinutes && !shouldThrottle("SCHEDULER_DOWN")) {
      alerts.push({
        type: "SCHEDULER_DOWN",
        severity: "critical",
        message: `Email scheduler has not sent heartbeat for ${Math.floor(heartbeatAgeMinutes)} minutes`,
        count: Math.floor(heartbeatAgeMinutes),
        threshold: thresholds.schedulerDownMinutes,
        triggeredAt: now,
      });
      markAlerted("SCHEDULER_DOWN");
    }
  } else {
    if (!shouldThrottle("SCHEDULER_DOWN")) {
      alerts.push({
        type: "SCHEDULER_DOWN",
        severity: "critical",
        message: "Email scheduler heartbeat not found - scheduler may not be running",
        triggeredAt: now,
      });
      markAlerted("SCHEDULER_DOWN");
    }
  }
  
  const aiBlocked = Number(stats?.aiBlocked || 0);
  if (aiBlocked > 5 && !shouldThrottle("AI_ERROR")) {
    alerts.push({
      type: "AI_ERROR",
      severity: aiBlocked > 20 ? "high" : "medium",
      message: `${aiBlocked} emails blocked in the last hour`,
      count: aiBlocked,
      triggeredAt: now,
    });
    markAlerted("AI_ERROR");
  }
  
  for (const alert of alerts) {
    await logAlert(alert, organizationId);
  }
  
  return alerts;
}

async function logAlert(alert: Alert, organizationId?: string): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action: `ALERT_${alert.type}`,
      module: "alerts",
      organizationId: organizationId || null,
      details: {
        severity: alert.severity,
        message: alert.message,
        count: alert.count,
        threshold: alert.threshold,
      },
    });
  } catch (error) {
    console.error("[AlertService] Failed to log alert:", error);
  }
}

export async function getActiveAlerts(organizationId?: string): Promise<Alert[]> {
  return checkAlerts(DEFAULT_THRESHOLDS, organizationId);
}

export async function getAlertHistory(organizationId?: string, limit = 50): Promise<Array<{
  type: string;
  severity: string;
  message: string;
  createdAt: Date;
}>> {
  // SECURITY: Require organizationId to prevent cross-tenant data leakage
  if (!organizationId) {
    console.warn("[AlertService] getAlertHistory called without organizationId - returning empty");
    return [];
  }
  
  const orgFilter = eq(auditLogs.organizationId, organizationId);
  
  const results = await db
    .select({
      action: auditLogs.action,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.module, "alerts"),
        sql`${auditLogs.action} LIKE 'ALERT_%'`,
        orgFilter
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  
  return results.map(r => ({
    type: r.action.replace("ALERT_", ""),
    severity: (r.details as any)?.severity || "medium",
    message: (r.details as any)?.message || "Unknown alert",
    createdAt: r.createdAt,
  }));
}

export const alertService = {
  checkAlerts,
  getActiveAlerts,
  getAlertHistory,
};
