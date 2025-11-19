import { db } from "../db";
import { 
  prospects, 
  sequences, 
  automationRuns, 
  emailSendLog, 
  personalizationResults,
  auditLogs,
  jobs,
  sequenceProspects,
  emailReplies
} from "@shared/schema";
import { eq, and, gte, count, sql, desc } from "drizzle-orm";
import { RequestContext } from "../storage";

export interface AnalyticsOverview {
  totalProspects: number;
  totalSequences: number;
  totalEmailsSent: number;
  totalReplies: number;
  totalAICreditsUsed: number;
  activeSequences: number;
  averageReplyRate: number;
}

export interface ActivityLog {
  id: string;
  action: string;
  module: string;
  timestamp: Date;
  details: any;
}

export interface TimeSeriesData {
  date: string;
  prospects: number;
  emails: number;
  replies: number;
}

export interface SequencePerformance {
  id: string;
  name: string;
  totalProspects: number;
  activeProspects: number;
  completedProspects: number;
  emailsSent: number;
  replies: number;
  replyRate: number;
}

export class AnalyticsService {
  private userId: string;

  constructor(ctx: RequestContext) {
    if (!ctx.userId) {
      throw new Error("User ID is required for analytics");
    }
    this.userId = ctx.userId;
  }

  async getOverview(): Promise<AnalyticsOverview> {
    const [prospectsCount] = await db
      .select({ count: count() })
      .from(prospects)
      .where(eq(prospects.userId, this.userId));

    const [sequencesCount] = await db
      .select({ count: count() })
      .from(sequences)
      .where(eq(sequences.userId, this.userId));

    const [activeSequencesCount] = await db
      .select({ count: count() })
      .from(sequences)
      .where(and(
        eq(sequences.userId, this.userId),
        eq(sequences.status, "active")
      ));

    const automationStats = await db
      .select({
        totalEmails: sql<number>`COALESCE(SUM(${automationRuns.emailsSent}), 0)`,
        totalReplies: sql<number>`COALESCE(SUM(${automationRuns.repliesReceived}), 0)`,
      })
      .from(automationRuns)
      .where(eq(automationRuns.userId, this.userId));

    const [personalizationCount] = await db
      .select({ count: count() })
      .from(personalizationResults)
      .where(eq(personalizationResults.userId, this.userId));

    const totalEmailsSent = Number(automationStats[0]?.totalEmails || 0);
    const totalReplies = Number(automationStats[0]?.totalReplies || 0);
    const replyRate = totalEmailsSent > 0 ? (totalReplies / totalEmailsSent) * 100 : 0;

    return {
      totalProspects: prospectsCount?.count || 0,
      totalSequences: sequencesCount?.count || 0,
      totalEmailsSent,
      totalReplies,
      totalAICreditsUsed: personalizationCount?.count || 0,
      activeSequences: activeSequencesCount?.count || 0,
      averageReplyRate: Math.round(replyRate * 10) / 10,
    };
  }

  async getActivityLogs(limit: number = 50): Promise<ActivityLog[]> {
    const logs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        module: auditLogs.module,
        timestamp: auditLogs.createdAt,
        details: auditLogs.details,
      })
      .from(auditLogs)
      .where(eq(auditLogs.userId, this.userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return logs.map(log => ({
      id: log.id,
      action: log.action,
      module: log.module || "system",
      timestamp: log.timestamp,
      details: log.details,
    }));
  }

  async getTimeSeriesData(days: number = 30): Promise<TimeSeriesData[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const prospectsData = await db
      .select({
        date: sql<string>`DATE(${prospects.createdAt})`,
        count: count(),
      })
      .from(prospects)
      .where(and(
        eq(prospects.userId, this.userId),
        gte(prospects.createdAt, startDate)
      ))
      .groupBy(sql`DATE(${prospects.createdAt})`)
      .orderBy(sql`DATE(${prospects.createdAt})`);

    const emailsData = await db
      .select({
        date: sql<string>`DATE(${emailSendLog.createdAt})`,
        count: count(),
      })
      .from(emailSendLog)
      .where(and(
        eq(emailSendLog.userId, this.userId),
        gte(emailSendLog.createdAt, startDate)
      ))
      .groupBy(sql`DATE(${emailSendLog.createdAt})`)
      .orderBy(sql`DATE(${emailSendLog.createdAt})`);

    // Get replies for this user's prospects only (multi-tenant security)
    const repliesData = await db
      .select({
        date: sql<string>`DATE(${emailReplies.createdAt})`,
        count: count(),
      })
      .from(emailReplies)
      .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(and(
        eq(prospects.userId, this.userId),
        gte(emailReplies.createdAt, startDate)
      ))
      .groupBy(sql`DATE(${emailReplies.createdAt})`)
      .orderBy(sql`DATE(${emailReplies.createdAt})`);

    const dateMap = new Map<string, { prospects: number; emails: number; replies: number }>();

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      dateMap.set(dateStr, { prospects: 0, emails: 0, replies: 0 });
    }

    prospectsData.forEach(row => {
      const existing = dateMap.get(row.date) || { prospects: 0, emails: 0, replies: 0 };
      dateMap.set(row.date, { ...existing, prospects: row.count });
    });

    emailsData.forEach(row => {
      const existing = dateMap.get(row.date) || { prospects: 0, emails: 0, replies: 0 };
      dateMap.set(row.date, { ...existing, emails: row.count });
    });

    repliesData.forEach(row => {
      const existing = dateMap.get(row.date) || { prospects: 0, emails: 0, replies: 0 };
      dateMap.set(row.date, { ...existing, replies: row.count });
    });

    return Array.from(dateMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  async getSequencePerformance(): Promise<SequencePerformance[]> {
    const sequencesList = await db
      .select({
        id: sequences.id,
        name: sequences.name,
        totalProspects: sequences.totalProspects,
        activeProspects: sequences.activeProspects,
        completedProspects: sequences.completedProspects,
      })
      .from(sequences)
      .where(eq(sequences.userId, this.userId));

    const performance: SequencePerformance[] = [];

    for (const seq of sequencesList) {
      const automationStats = await db
        .select({
          emailsSent: sql<number>`COALESCE(SUM(${automationRuns.emailsSent}), 0)`,
          repliesReceived: sql<number>`COALESCE(SUM(${automationRuns.repliesReceived}), 0)`,
        })
        .from(automationRuns)
        .where(and(
          eq(automationRuns.userId, this.userId),
          eq(automationRuns.sequenceId, seq.id)
        ));

      const emailsSent = Number(automationStats[0]?.emailsSent || 0);
      const replies = Number(automationStats[0]?.repliesReceived || 0);
      const replyRate = emailsSent > 0 ? (replies / emailsSent) * 100 : 0;

      performance.push({
        id: seq.id,
        name: seq.name,
        totalProspects: seq.totalProspects || 0,
        activeProspects: seq.activeProspects || 0,
        completedProspects: seq.completedProspects || 0,
        emailsSent,
        replies,
        replyRate: Math.round(replyRate * 10) / 10,
      });
    }

    return performance;
  }

  async getUsageMetrics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentProspects] = await db
      .select({ count: count() })
      .from(prospects)
      .where(and(
        eq(prospects.userId, this.userId),
        gte(prospects.createdAt, thirtyDaysAgo)
      ));

    const [recentEmails] = await db
      .select({ count: count() })
      .from(emailSendLog)
      .where(and(
        eq(emailSendLog.userId, this.userId),
        gte(emailSendLog.createdAt, thirtyDaysAgo)
      ));

    const [recentAIPersonalizations] = await db
      .select({ count: count() })
      .from(personalizationResults)
      .where(and(
        eq(personalizationResults.userId, this.userId),
        gte(personalizationResults.createdAt, thirtyDaysAgo)
      ));

    return {
      prospects30Days: recentProspects?.count || 0,
      emails30Days: recentEmails?.count || 0,
      aiCredits30Days: recentAIPersonalizations?.count || 0,
    };
  }
}
