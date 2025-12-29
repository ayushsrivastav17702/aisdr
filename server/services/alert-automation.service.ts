import { db } from '../db';
import {
  platformAlerts,
  alertConfigurations,
  tenantSettings,
  tenantConfiguration,
  organizations,
  users,
  emailMailboxes,
  superAdminAuditLogs,
  type InsertPlatformAlert,
} from '@shared/schema';
import { eq, and, gte, lte, sql, count, desc, isNull, or } from 'drizzle-orm';
import { EmailService } from './email.service';

const emailService = new EmailService();

interface AlertThresholds {
  errorRatePercent?: number;
  responseTimeMs?: number;
  cpuPercent?: number;
  memoryPercent?: number;
  diskPercent?: number;
  failedLoginCount?: number;
  bounceRatePercent?: number;
  tenantHealthScoreMin?: number;
  quotaUsagePercent?: number;
}

interface AlertCheckResult {
  shouldAlert: boolean;
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  details: Record<string, any>;
  affectedTenantId?: string;
}

class AlertAutomationService {
  private defaultThresholds: AlertThresholds = {
    errorRatePercent: 5,
    bounceRatePercent: 5,
    tenantHealthScoreMin: 50,
    quotaUsagePercent: 80,
    failedLoginCount: 10,
  };

  async getAlertConfigurations(): Promise<Map<string, { enabled: boolean; thresholds: AlertThresholds; emailRecipients: string[] }>> {
    const configs = await db.select().from(alertConfigurations);
    
    const configMap = new Map<string, { enabled: boolean; thresholds: AlertThresholds; emailRecipients: string[] }>();
    
    for (const config of configs) {
      configMap.set(config.alertType, {
        enabled: config.enabled,
        thresholds: (config.thresholds as AlertThresholds) || {},
        emailRecipients: config.emailRecipients || [],
      });
    }
    
    return configMap;
  }

  async runAllChecks(): Promise<AlertCheckResult[]> {
    const results: AlertCheckResult[] = [];
    const configs = await this.getAlertConfigurations();

    const checks = [
      this.checkTenantHealthScores(configs),
      this.checkQuotaUsage(configs),
      this.checkMailboxHealth(configs),
      this.checkInactiveTenants(configs),
      this.checkServerResources(configs),
    ];

    const checkResults = await Promise.all(checks);
    
    for (const checkResult of checkResults) {
      results.push(...checkResult);
    }

    return results;
  }

  async checkTenantHealthScores(configs: Map<string, any>): Promise<AlertCheckResult[]> {
    const results: AlertCheckResult[] = [];
    const config = configs.get('tenant_health') || { enabled: true, thresholds: this.defaultThresholds };
    
    if (!config.enabled) return results;

    const minScore = config.thresholds?.tenantHealthScoreMin || this.defaultThresholds.tenantHealthScoreMin!;

    const lowHealthTenants = await db
      .select({
        organizationId: tenantSettings.organizationId,
        organizationName: organizations.name,
        healthScore: tenantSettings.healthScore,
        plan: tenantSettings.plan,
      })
      .from(tenantSettings)
      .innerJoin(organizations, eq(tenantSettings.organizationId, organizations.id))
      .where(sql`${tenantSettings.healthScore} < ${minScore}`);

    for (const tenant of lowHealthTenants) {
      const severity = (tenant.healthScore || 0) < 30 ? 'critical' : 'warning';
      
      results.push({
        shouldAlert: true,
        alertType: 'tenant_health',
        severity,
        title: `Low health score for ${tenant.organizationName}`,
        message: `Tenant ${tenant.organizationName} has a health score of ${tenant.healthScore}%, which is below the threshold of ${minScore}%.`,
        details: {
          organizationId: tenant.organizationId,
          organizationName: tenant.organizationName,
          healthScore: tenant.healthScore,
          threshold: minScore,
          plan: tenant.plan,
        },
        affectedTenantId: tenant.organizationId,
      });
    }

    return results;
  }

  async checkQuotaUsage(configs: Map<string, any>): Promise<AlertCheckResult[]> {
    const results: AlertCheckResult[] = [];
    const config = configs.get('quota_usage') || { enabled: true, thresholds: this.defaultThresholds };
    
    if (!config.enabled) return results;

    const thresholdPercent = config.thresholds?.quotaUsagePercent || this.defaultThresholds.quotaUsagePercent!;

    const tenantsWithLimits = await db
      .select({
        organizationId: tenantSettings.organizationId,
        organizationName: organizations.name,
        maxUsers: tenantSettings.maxUsers,
        currentUserCount: tenantSettings.currentUserCount,
        maxProspects: tenantSettings.maxProspects,
        currentProspectCount: tenantSettings.currentProspectCount,
      })
      .from(tenantSettings)
      .innerJoin(organizations, eq(tenantSettings.organizationId, organizations.id));

    for (const tenant of tenantsWithLimits) {
      const userUsagePercent = tenant.maxUsers ? ((tenant.currentUserCount || 0) / tenant.maxUsers) * 100 : 0;
      const prospectUsagePercent = tenant.maxProspects ? ((tenant.currentProspectCount || 0) / tenant.maxProspects) * 100 : 0;

      if (userUsagePercent >= thresholdPercent) {
        results.push({
          shouldAlert: true,
          alertType: 'quota_usage',
          severity: userUsagePercent >= 95 ? 'critical' : 'warning',
          title: `User quota approaching limit for ${tenant.organizationName}`,
          message: `Tenant ${tenant.organizationName} is using ${Math.round(userUsagePercent)}% of their user quota (${tenant.currentUserCount}/${tenant.maxUsers}).`,
          details: {
            organizationId: tenant.organizationId,
            resource: 'users',
            current: tenant.currentUserCount,
            limit: tenant.maxUsers,
            usagePercent: userUsagePercent,
          },
          affectedTenantId: tenant.organizationId,
        });
      }

      if (prospectUsagePercent >= thresholdPercent) {
        results.push({
          shouldAlert: true,
          alertType: 'quota_usage',
          severity: prospectUsagePercent >= 95 ? 'critical' : 'warning',
          title: `Prospect quota approaching limit for ${tenant.organizationName}`,
          message: `Tenant ${tenant.organizationName} is using ${Math.round(prospectUsagePercent)}% of their prospect quota (${tenant.currentProspectCount}/${tenant.maxProspects}).`,
          details: {
            organizationId: tenant.organizationId,
            resource: 'prospects',
            current: tenant.currentProspectCount,
            limit: tenant.maxProspects,
            usagePercent: prospectUsagePercent,
          },
          affectedTenantId: tenant.organizationId,
        });
      }
    }

    return results;
  }

  async checkMailboxHealth(configs: Map<string, any>): Promise<AlertCheckResult[]> {
    const results: AlertCheckResult[] = [];
    const config = configs.get('mailbox_health') || { enabled: true, thresholds: this.defaultThresholds };
    
    if (!config.enabled) return results;

    const bounceThreshold = config.thresholds?.bounceRatePercent || this.defaultThresholds.bounceRatePercent!;

    const problematicMailboxes = await db
      .select({
        id: emailMailboxes.id,
        email: emailMailboxes.email,
        bounceRate: emailMailboxes.bounceRate,
        spamScore: emailMailboxes.spamScore,
        status: emailMailboxes.status,
        userId: emailMailboxes.userId,
      })
      .from(emailMailboxes)
      .where(or(
        sql`${emailMailboxes.bounceRate} > ${bounceThreshold}`,
        sql`${emailMailboxes.spamScore} > 5`,
        eq(emailMailboxes.status, 'error')
      ));

    for (const mailbox of problematicMailboxes) {
      const severity = (mailbox.bounceRate || 0) > 10 || mailbox.status === 'error' ? 'critical' : 'warning';
      
      results.push({
        shouldAlert: true,
        alertType: 'mailbox_health',
        severity,
        title: `Mailbox health issue: ${mailbox.email}`,
        message: `Mailbox ${mailbox.email} has health issues: bounce rate ${mailbox.bounceRate}%, spam score ${mailbox.spamScore}, status: ${mailbox.status}.`,
        details: {
          mailboxId: mailbox.id,
          email: mailbox.email,
          bounceRate: mailbox.bounceRate,
          spamScore: mailbox.spamScore,
          status: mailbox.status,
        },
      });
    }

    return results;
  }

  async checkInactiveTenants(configs: Map<string, any>): Promise<AlertCheckResult[]> {
    const results: AlertCheckResult[] = [];
    const config = configs.get('inactive_tenant') || { enabled: true, thresholds: {} };
    
    if (!config.enabled) return results;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const inactiveTenants = await db
      .select({
        organizationId: tenantSettings.organizationId,
        organizationName: organizations.name,
        lastActivityAt: tenantSettings.lastActivityAt,
        plan: tenantSettings.plan,
      })
      .from(tenantSettings)
      .innerJoin(organizations, eq(tenantSettings.organizationId, organizations.id))
      .where(or(
        isNull(tenantSettings.lastActivityAt),
        lte(tenantSettings.lastActivityAt, thirtyDaysAgo)
      ));

    for (const tenant of inactiveTenants) {
      const daysSinceActivity = tenant.lastActivityAt 
        ? Math.floor((Date.now() - new Date(tenant.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      results.push({
        shouldAlert: true,
        alertType: 'inactive_tenant',
        severity: daysSinceActivity && daysSinceActivity > 60 ? 'warning' : 'info',
        title: `Inactive tenant: ${tenant.organizationName}`,
        message: daysSinceActivity 
          ? `Tenant ${tenant.organizationName} has been inactive for ${daysSinceActivity} days.`
          : `Tenant ${tenant.organizationName} has no recorded activity.`,
        details: {
          organizationId: tenant.organizationId,
          organizationName: tenant.organizationName,
          lastActivityAt: tenant.lastActivityAt,
          daysSinceActivity,
          plan: tenant.plan,
        },
        affectedTenantId: tenant.organizationId,
      });
    }

    return results;
  }

  async checkServerResources(configs: Map<string, any>): Promise<AlertCheckResult[]> {
    const results: AlertCheckResult[] = [];
    const config = configs.get('server_resources') || { enabled: true, thresholds: {} };
    
    if (!config.enabled) return results;

    const memoryUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const heapUsagePercent = (heapUsedMb / heapTotalMb) * 100;

    const memoryThreshold = config.thresholds?.memoryPercent || 85;

    if (heapUsagePercent > memoryThreshold) {
      results.push({
        shouldAlert: true,
        alertType: 'server_resources',
        severity: heapUsagePercent > 95 ? 'critical' : 'warning',
        title: 'High memory usage detected',
        message: `Server memory usage is at ${Math.round(heapUsagePercent)}% (${heapUsedMb}MB / ${heapTotalMb}MB).`,
        details: {
          heapUsedMb,
          heapTotalMb,
          heapUsagePercent,
          threshold: memoryThreshold,
        },
      });
    }

    return results;
  }

  async createAlert(alert: AlertCheckResult): Promise<void> {
    const existingAlert = await db
      .select()
      .from(platformAlerts)
      .where(and(
        eq(platformAlerts.alertType, alert.alertType),
        eq(platformAlerts.status, 'active'),
        alert.affectedTenantId 
          ? eq(platformAlerts.affectedTenantId, alert.affectedTenantId)
          : isNull(platformAlerts.affectedTenantId)
      ))
      .limit(1);

    if (existingAlert.length > 0) {
      return;
    }

    const [newAlert] = await db.insert(platformAlerts).values({
      alertType: alert.alertType,
      severity: alert.severity,
      status: 'active',
      title: alert.title,
      message: alert.message,
      details: alert.details,
      affectedTenantId: alert.affectedTenantId || null,
      sourceSystem: 'automation',
    }).returning();

    console.log(`[AlertAutomation] Created alert: ${alert.title} (${alert.severity})`);

    await this.sendAlertNotifications(alert);
  }

  async sendAlertNotifications(alert: AlertCheckResult): Promise<void> {
    const configs = await this.getAlertConfigurations();
    const config = configs.get(alert.alertType);

    if (!config?.emailRecipients?.length) {
      return;
    }

    for (const email of config.emailRecipients) {
      try {
        await emailService.sendGenericEmail({
          to: email,
          subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          html: this.generateAlertEmailHtml(alert),
        });
      } catch (error) {
        console.error(`Failed to send alert notification to ${email}:`, error);
      }
    }
  }

  private generateAlertEmailHtml(alert: AlertCheckResult): string {
    const severityColors: Record<string, string> = {
      info: '#3b82f6',
      warning: '#f59e0b',
      critical: '#ef4444',
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Platform Alert</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: ${severityColors[alert.severity]}; padding: 20px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">${alert.severity.toUpperCase()} Alert</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
            <h2 style="margin-top: 0; color: #1f2937;">${alert.title}</h2>
            <p style="color: #4b5563;">${alert.message}</p>
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-top: 20px;">
              <h3 style="margin-top: 0; font-size: 14px; color: #6b7280;">Details</h3>
              <pre style="margin: 0; font-size: 12px; white-space: pre-wrap;">${JSON.stringify(alert.details, null, 2)}</pre>
            </div>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
              This is an automated alert from the AI SDR Platform monitoring system.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  async processAlerts(): Promise<{ processed: number; created: number }> {
    const alerts = await this.runAllChecks();
    let created = 0;

    for (const alert of alerts) {
      if (alert.shouldAlert) {
        await this.createAlert(alert);
        created++;
      }
    }

    console.log(`[AlertAutomation] Processed ${alerts.length} checks, created ${created} new alerts`);

    return { processed: alerts.length, created };
  }

  async acknowledgeAlert(alertId: string, superAdminId: string): Promise<void> {
    await db
      .update(platformAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedBy: superAdminId,
        acknowledgedAt: new Date(),
      })
      .where(eq(platformAlerts.id, alertId));
  }

  async resolveAlert(alertId: string, superAdminId: string, resolution?: string): Promise<void> {
    await db
      .update(platformAlerts)
      .set({
        status: 'resolved',
        resolvedBy: superAdminId,
        resolvedAt: new Date(),
        resolutionNotes: resolution,
      })
      .where(eq(platformAlerts.id, alertId));
  }

  async getActiveAlerts(): Promise<any[]> {
    return db
      .select()
      .from(platformAlerts)
      .where(eq(platformAlerts.status, 'active'))
      .orderBy(desc(platformAlerts.createdAt));
  }
}

export const alertAutomationService = new AlertAutomationService();
