import { db } from "../db";
import { schedulerHeartbeat, emailQueue, SchedulerHeartbeat } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { Sentry, isSentryEnabled } from "../sentry";

export type SchedulerStatus = "healthy" | "delayed" | "down";

interface SchedulerHealth {
  schedulerType: string;
  status: SchedulerStatus;
  lastHeartbeat: Date | null;
  processedCount: number;
  failedCount: number;
  failureRate15m: number;
  averageProcessingMs: number | null;
  lastError: string | null;
  alertActive: boolean;
}

interface SchedulerAlert {
  type: "scheduler_down" | "high_failure_rate" | "scheduler_delayed";
  severity: "warning" | "critical";
  message: string;
  schedulerType: string;
  timestamp: Date;
}

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds
const HEALTHY_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const DELAYED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes (considered down after this)
const FAILURE_RATE_THRESHOLD = 0.05; // 5% failure rate
const FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

class SchedulerMonitoringService {
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private alertCallbacks: Array<(alert: SchedulerAlert) => void> = [];
  private lastAlertTime: Map<string, Date> = new Map();
  private readonly ALERT_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes between alerts

  async recordHeartbeat(
    schedulerType: string,
    stats: {
      processedCount?: number;
      failedCount?: number;
      processingMs?: number;
      error?: string;
    } = {}
  ): Promise<void> {
    const now = new Date();

    try {
      const [existing] = await db
        .select()
        .from(schedulerHeartbeat)
        .where(eq(schedulerHeartbeat.schedulerType, schedulerType))
        .limit(1);

      const newProcessedCount = (existing?.processedCount || 0) + (stats.processedCount || 0);
      const newFailedCount = (existing?.failedCount || 0) + (stats.failedCount || 0);

      if (existing) {
        await db
          .update(schedulerHeartbeat)
          .set({
            lastHeartbeat: now,
            status: "healthy",
            processedCount: newProcessedCount,
            failedCount: newFailedCount,
            averageProcessingMs: stats.processingMs || existing.averageProcessingMs,
            lastError: stats.error || null,
            updatedAt: now,
          })
          .where(eq(schedulerHeartbeat.id, existing.id));
      } else {
        await db.insert(schedulerHeartbeat).values({
          schedulerType,
          lastHeartbeat: now,
          status: "healthy",
          processedCount: stats.processedCount || 0,
          failedCount: stats.failedCount || 0,
          averageProcessingMs: stats.processingMs,
          lastError: stats.error,
        });
      }

      console.log(
        `💓 [${schedulerType}] Heartbeat recorded - ` +
        `Processed: ${stats.processedCount || 0}, Failed: ${stats.failedCount || 0}`
      );
    } catch (error) {
      console.error(`[SchedulerMonitoring] Failed to record heartbeat for ${schedulerType}:`, error);
    }
  }

  async getSchedulerHealth(schedulerType: string): Promise<SchedulerHealth> {
    const [heartbeat] = await db
      .select()
      .from(schedulerHeartbeat)
      .where(eq(schedulerHeartbeat.schedulerType, schedulerType))
      .limit(1);

    const now = new Date();
    let status: SchedulerStatus = "healthy";
    let alertActive = false;

    if (!heartbeat) {
      return {
        schedulerType,
        status: "down",
        lastHeartbeat: null,
        processedCount: 0,
        failedCount: 0,
        failureRate15m: 0,
        averageProcessingMs: null,
        lastError: null,
        alertActive: true,
      };
    }

    const msSinceHeartbeat = now.getTime() - heartbeat.lastHeartbeat.getTime();

    if (msSinceHeartbeat > DELAYED_THRESHOLD_MS) {
      status = "down";
      alertActive = true;
    } else if (msSinceHeartbeat > HEALTHY_THRESHOLD_MS) {
      status = "delayed";
      alertActive = true;
    }

    const failureRate15m = await this.getRecentFailureRate(schedulerType);

    return {
      schedulerType,
      status,
      lastHeartbeat: heartbeat.lastHeartbeat,
      processedCount: heartbeat.processedCount || 0,
      failedCount: heartbeat.failedCount || 0,
      failureRate15m,
      averageProcessingMs: heartbeat.averageProcessingMs,
      lastError: heartbeat.lastError,
      alertActive: alertActive || failureRate15m > FAILURE_RATE_THRESHOLD,
    };
  }

  async getAllSchedulerHealth(): Promise<SchedulerHealth[]> {
    const schedulerTypes = ["email_queue", "sequence_executor", "automation"];
    return Promise.all(schedulerTypes.map((type) => this.getSchedulerHealth(type)));
  }

  private async getRecentFailureRate(schedulerType: string): Promise<number> {
    if (schedulerType !== "email_queue") {
      return 0;
    }

    const fifteenMinutesAgo = new Date(Date.now() - FAILURE_WINDOW_MS);

    try {
      const result = await db
        .select({
          total: sql<number>`COUNT(*) FILTER (WHERE (status = 'sent' AND sent_at >= ${fifteenMinutesAgo}) OR (status = 'failed' AND failed_at >= ${fifteenMinutesAgo}))`,
          failed: sql<number>`COUNT(*) FILTER (WHERE status = 'failed' AND failed_at >= ${fifteenMinutesAgo})`,
        })
        .from(emailQueue);

      const { total, failed } = result[0];
      if (total === 0) return 0;
      return Number(failed) / Number(total);
    } catch (error) {
      console.error("[SchedulerMonitoring] Failed to calculate failure rate:", error);
      return 0;
    }
  }

  async checkAndAlert(): Promise<void> {
    const healthStatuses = await this.getAllSchedulerHealth();
    const now = new Date();

    for (const health of healthStatuses) {
      const alertKey = `${health.schedulerType}_${health.status}`;
      const lastAlert = this.lastAlertTime.get(alertKey);

      if (lastAlert && now.getTime() - lastAlert.getTime() < this.ALERT_THROTTLE_MS) {
        continue;
      }

      if (health.status === "down") {
        const alert: SchedulerAlert = {
          type: "scheduler_down",
          severity: "critical",
          message: `Scheduler ${health.schedulerType} is DOWN. Last heartbeat: ${
            health.lastHeartbeat?.toISOString() || "Never"
          }`,
          schedulerType: health.schedulerType,
          timestamp: now,
        };
        this.triggerAlert(alert);
        this.lastAlertTime.set(alertKey, now);
      } else if (health.status === "delayed") {
        const alert: SchedulerAlert = {
          type: "scheduler_delayed",
          severity: "warning",
          message: `Scheduler ${health.schedulerType} is DELAYED. Last heartbeat: ${health.lastHeartbeat?.toISOString()}`,
          schedulerType: health.schedulerType,
          timestamp: now,
        };
        this.triggerAlert(alert);
        this.lastAlertTime.set(alertKey, now);
      }

      if (health.failureRate15m > FAILURE_RATE_THRESHOLD) {
        const failureAlertKey = `${health.schedulerType}_failure_rate`;
        const lastFailureAlert = this.lastAlertTime.get(failureAlertKey);

        if (!lastFailureAlert || now.getTime() - lastFailureAlert.getTime() >= this.ALERT_THROTTLE_MS) {
          const alert: SchedulerAlert = {
            type: "high_failure_rate",
            severity: "critical",
            message: `Scheduler ${health.schedulerType} has high failure rate: ${(health.failureRate15m * 100).toFixed(1)}% in last 15 minutes`,
            schedulerType: health.schedulerType,
            timestamp: now,
          };
          this.triggerAlert(alert);
          this.lastAlertTime.set(failureAlertKey, now);
        }
      }
    }
  }

  private triggerAlert(alert: SchedulerAlert): void {
    const emoji = alert.severity === "critical" ? "🚨" : "⚠️";
    console.log(`${emoji} [SchedulerMonitoring] ${alert.type}: ${alert.message}`);

    if (isSentryEnabled()) {
      Sentry.captureMessage(alert.message, {
        level: alert.severity === "critical" ? "error" : "warning",
        tags: {
          component: "scheduler_monitoring",
          alertType: alert.type,
          schedulerType: alert.schedulerType,
        },
      });
    }

    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error("[SchedulerMonitoring] Alert callback error:", error);
      }
    }
  }

  onAlert(callback: (alert: SchedulerAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  startMonitoring(): void {
    if (this.heartbeatIntervals.has("monitor")) {
      console.log("⚠️ Scheduler monitoring already running");
      return;
    }

    console.log("🔍 Starting scheduler monitoring...");

    const monitorInterval = setInterval(() => {
      this.checkAndAlert().catch((error) => {
        console.error("[SchedulerMonitoring] Monitoring check failed:", error);
      });
    }, 60 * 1000);

    this.heartbeatIntervals.set("monitor", monitorInterval);
  }

  stopMonitoring(): void {
    console.log("🛑 Stopping scheduler monitoring...");
    this.heartbeatIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.heartbeatIntervals.clear();
  }

  async updateSchedulerStatus(schedulerType: string, status: SchedulerStatus): Promise<void> {
    await db
      .update(schedulerHeartbeat)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(schedulerHeartbeat.schedulerType, schedulerType));
  }
}

export const schedulerMonitoringService = new SchedulerMonitoringService();
