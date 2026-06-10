import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  emails, 
  sequences, 
  sequenceProspects, 
  userControls,
  sdrWorkflowProgress,
  emailReplies,
  personalizationResults,
  userProfiles,
  userActivityLogs,
  users
} from "@shared/schema";
import { eq, and, gte, lt, sql, count, desc, isNotNull, ne } from "drizzle-orm";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// Helper to log user activity for audit trail
async function logUserActivity(
  userId: string,
  action: string,
  targetType: string | null = null,
  targetId: string | null = null,
  metadata: Record<string, any> | null = null,
  req?: Request
): Promise<void> {
  try {
    await db.insert(userActivityLogs).values({
      userId,
      action,
      targetType,
      targetId,
      metadata,
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.["user-agent"] || null,
    });
  } catch (error) {
    console.error("Failed to log user activity:", error);
  }
}

// Helper to log system-generated events
export async function logSystemActivity(
  userId: string,
  action: string,
  metadata: Record<string, any> | null = null,
  targetId: string | null = null
): Promise<void> {
  try {
    await db.insert(userActivityLogs).values({
      userId,
      action,
      targetType: "system",
      targetId,
      metadata,
      ipAddress: null,
      userAgent: "system",
    });
  } catch (error) {
    console.error("Failed to log system activity:", error);
  }
}

interface EmailActivityStats {
  emailsSentToday: number;
  emailsSentThisWeek: number;
  repliesReceivedToday: number;
  repliesReceivedThisWeek: number;
  openRate7Days: number;
  openRate30Days: number;
  replyRate7Days: number;
  replyRate30Days: number;
}

interface QuotaSnapshot {
  emailsUsed: number;
  emailsLimit: number;
  activeEnrollments: number;
  enrollmentLimit: number;
  activeCampaigns: number;
  campaignLimit: number;
  resetTime: string;
  hardStopReasons: string[];
}

interface CampaignHealth {
  running: number;
  paused: number;
  blocked: number;
  draft: number;
  blockedSequences: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
}

interface PersonalizationUsage {
  totalEmails: number;
  personalizedEmails: number;
  personalizationRate: number;
  missingTokenFailures: number;
}

interface SDRDashboardData {
  emailActivity: EmailActivityStats;
  quotaSnapshot: QuotaSnapshot;
  campaignHealth: CampaignHealth;
  personalizationUsage: PersonalizationUsage;
  workflowStage: {
    currentStage: string;
    blockingReasons: any[];
  } | null;
}

router.get("/dashboard", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.userContext!.userId;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      emailsSentToday,
      emailsSentThisWeek,
      repliesReceivedToday,
      repliesReceivedThisWeek,
      emails7Days,
      emails30Days,
      userQuotas,
      sequenceStats,
      workflowProgress,
      personalizationStats,
      personalizationFailures
    ] = await Promise.all([
      db.select({ count: count() })
        .from(emails)
        .where(and(
          eq(emails.userId, userId),
          eq(emails.status, "sent"),
          gte(emails.sentAt, startOfToday)
        )),
      
      db.select({ count: count() })
        .from(emails)
        .where(and(
          eq(emails.userId, userId),
          eq(emails.status, "sent"),
          gte(emails.sentAt, startOfWeek)
        )),
      
      db.select({ count: count() })
        .from(emailReplies)
        .innerJoin(emails, eq(emailReplies.emailId, emails.id))
        .where(and(
          eq(emails.userId, userId),
          gte(emailReplies.receivedAt, startOfToday)
        )),
      
      db.select({ count: count() })
        .from(emailReplies)
        .innerJoin(emails, eq(emailReplies.emailId, emails.id))
        .where(and(
          eq(emails.userId, userId),
          gte(emailReplies.receivedAt, startOfWeek)
        )),
      
      db.select({
        total: count(),
        opened: sql<number>`COUNT(CASE WHEN ${emails.openedAt} IS NOT NULL THEN 1 END)`,
        replied: sql<number>`COUNT(CASE WHEN ${emails.repliedAt} IS NOT NULL THEN 1 END)`
      })
        .from(emails)
        .where(and(
          eq(emails.userId, userId),
          eq(emails.status, "sent"),
          gte(emails.sentAt, days7Ago)
        )),
      
      db.select({
        total: count(),
        opened: sql<number>`COUNT(CASE WHEN ${emails.openedAt} IS NOT NULL THEN 1 END)`,
        replied: sql<number>`COUNT(CASE WHEN ${emails.repliedAt} IS NOT NULL THEN 1 END)`
      })
        .from(emails)
        .where(and(
          eq(emails.userId, userId),
          eq(emails.status, "sent"),
          gte(emails.sentAt, days30Ago)
        )),
      
      db.select()
        .from(userControls)
        .where(eq(userControls.userId, userId))
        .limit(1),
      
      db.select({
        status: sequences.status,
        count: count()
      })
        .from(sequences)
        .where(eq(sequences.userId, userId))
        .groupBy(sequences.status),
      
      db.select()
        .from(sdrWorkflowProgress)
        .where(eq(sdrWorkflowProgress.userId, userId))
        .limit(1),
      
      db.select({
        total: count(),
        aiGenerated: sql<number>`COUNT(CASE WHEN ${emails.aiGenerated} = true THEN 1 END)`
      })
        .from(emails)
        .where(and(
          eq(emails.userId, userId),
          gte(emails.createdAt, days30Ago)
        )),
      
      db.select({ count: count() })
        .from(personalizationResults)
        .where(and(
          eq(personalizationResults.userId, userId),
          eq(personalizationResults.status, "failed"),
          gte(personalizationResults.createdAt, days30Ago)
        ))
    ]);

    const quotaData = userQuotas[0] || {
      maxEmailsPerDay: 200,
      maxActiveCampaigns: 3,
      maxConcurrentEnrollments: 5,
      emailsSentToday: 0,
      activeCampaigns: 0,
      activeEnrollments: 0,
      isPaused: false
    };

    const tomorrow = new Date(startOfToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const hardStopReasons: string[] = [];
    if ((quotaData.emailsSentToday || 0) >= (quotaData.maxEmailsPerDay || 200)) {
      hardStopReasons.push("Email limit reached");
    }
    if ((quotaData.activeEnrollments || 0) >= (quotaData.maxConcurrentEnrollments || 5)) {
      hardStopReasons.push("Enrollment cap exceeded");
    }
    if (quotaData.isPaused) {
      hardStopReasons.push("Account paused by manager");
    }

    const statusMap: Record<string, number> = {};
    sequenceStats.forEach(stat => {
      statusMap[stat.status] = stat.count;
    });

    const blockedSequencesList = await db.select({
      id: sequences.id,
      name: sequences.name,
    })
      .from(sequences)
      .where(and(
        eq(sequences.userId, userId),
        eq(sequences.status, "blocked")
      ))
      .limit(5);

    const email7DaysData = emails7Days[0] || { total: 0, opened: 0, replied: 0 };
    const email30DaysData = emails30Days[0] || { total: 0, opened: 0, replied: 0 };
    const personalizationData = personalizationStats[0] || { total: 0, aiGenerated: 0 };

    const dashboardData: SDRDashboardData = {
      emailActivity: {
        emailsSentToday: emailsSentToday[0]?.count || 0,
        emailsSentThisWeek: emailsSentThisWeek[0]?.count || 0,
        repliesReceivedToday: repliesReceivedToday[0]?.count || 0,
        repliesReceivedThisWeek: repliesReceivedThisWeek[0]?.count || 0,
        openRate7Days: email7DaysData.total > 0 
          ? Math.round((Number(email7DaysData.opened) / email7DaysData.total) * 100) 
          : 0,
        openRate30Days: email30DaysData.total > 0 
          ? Math.round((Number(email30DaysData.opened) / email30DaysData.total) * 100) 
          : 0,
        replyRate7Days: email7DaysData.total > 0 
          ? Math.round((Number(email7DaysData.replied) / email7DaysData.total) * 100) 
          : 0,
        replyRate30Days: email30DaysData.total > 0 
          ? Math.round((Number(email30DaysData.replied) / email30DaysData.total) * 100) 
          : 0,
      },
      quotaSnapshot: {
        emailsUsed: quotaData.emailsSentToday || 0,
        emailsLimit: quotaData.maxEmailsPerDay || 200,
        activeEnrollments: quotaData.activeEnrollments || 0,
        enrollmentLimit: quotaData.maxConcurrentEnrollments || 5,
        activeCampaigns: quotaData.activeCampaigns || 0,
        campaignLimit: quotaData.maxActiveCampaigns || 3,
        resetTime: tomorrow.toISOString(),
        hardStopReasons,
      },
      campaignHealth: {
        running: statusMap["active"] || 0,
        paused: statusMap["paused"] || 0,
        blocked: statusMap["blocked"] || 0,
        draft: statusMap["draft"] || 0,
        blockedSequences: blockedSequencesList.map(s => ({
          id: s.id,
          name: s.name,
          reason: "Workflow issue detected"
        })),
      },
      personalizationUsage: {
        totalEmails: personalizationData.total,
        personalizedEmails: Number(personalizationData.aiGenerated),
        personalizationRate: personalizationData.total > 0 
          ? Math.round((Number(personalizationData.aiGenerated) / personalizationData.total) * 100)
          : 0,
        missingTokenFailures: personalizationFailures[0]?.count || 0,
      },
      workflowStage: workflowProgress[0] ? {
        currentStage: workflowProgress[0].currentStage,
        blockingReasons: workflowProgress[0].blockingReasons || [],
      } : null,
    };

    res.json(dashboardData);
  } catch (error) {
    console.error("SDR Dashboard error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Full workflow progress for visualization
router.get("/workflow-progress", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.userContext!.userId;
    
    const workflowProgress = await db.select()
      .from(sdrWorkflowProgress)
      .where(eq(sdrWorkflowProgress.userId, userId))
      .limit(1);
    
    const stages = [
      { key: "readiness", name: "Readiness", description: "Profile & mailbox setup", completedAtField: "readinessCompletedAt" },
      { key: "upload", name: "Upload", description: "Prospect import", completedAtField: "uploadCompletedAt" },
      { key: "enrichment", name: "Enrichment", description: "AI data enrichment", completedAtField: "enrichmentCompletedAt" },
      { key: "sequence", name: "Sequence", description: "Sequence creation", completedAtField: "sequenceCompletedAt" },
      { key: "enrollment", name: "Enrollment", description: "Prospect enrollment", completedAtField: "enrollmentCompletedAt" },
      { key: "activation", name: "Activation", description: "Sequence activation", completedAtField: "activationCompletedAt" },
      { key: "sending", name: "Sending", description: "Email delivery", completedAtField: "sendingStartedAt" },
      { key: "replies", name: "Replies", description: "Reply handling", completedAtField: "repliesDetectedAt" },
      { key: "analytics", name: "Analytics", description: "Performance analysis", completedAtField: "analyticsUnlockedAt" }
    ];
    
    const progress = workflowProgress[0];
    const currentStage = progress?.currentStage || "readiness";
    const stageOrder = stages.map(s => s.key);
    const currentIndex = stageOrder.indexOf(currentStage);
    
    const stagesWithStatus = stages.map((stage, index) => {
      let status: "completed" | "current" | "pending" | "blocked" = "pending";
      let completedAt: string | null = null;
      
      // Handle both existing progress and default "not started" state
      if (progress) {
        const fieldName = stage.completedAtField as keyof typeof progress;
        completedAt = progress[fieldName] as string | null;
        
        if (index < currentIndex) {
          status = "completed";
        } else if (index === currentIndex) {
          status = "current";
          // Check for blocking reasons on current stage
          const blockingReasons = (progress.blockingReasons || []) as any[];
          if (blockingReasons.some(r => r.severity === "error")) {
            status = "blocked";
          }
        }
      } else {
        // Default state: first stage is current, rest are pending
        if (index === 0) {
          status = "current";
        }
      }
      
      return {
        ...stage,
        status,
        completedAt,
        index: index + 1
      };
    });
    
    const blockingReasons = (progress?.blockingReasons || []) as any[];
    
    // Calculate progress percentage
    const completedCount = stagesWithStatus.filter(s => s.status === "completed").length;
    const progressPercent = Math.round((completedCount / stages.length) * 100);
    
    res.json({
      currentStage,
      currentStageIndex: currentIndex + 1,
      totalStages: stages.length,
      progressPercent,
      completedCount,
      stages: stagesWithStatus,
      blockingReasons,
      createdAt: progress?.createdAt || null,
      updatedAt: progress?.updatedAt || null
    });
  } catch (error) {
    console.error("Workflow progress error:", error);
    res.status(500).json({ error: "Failed to fetch workflow progress" });
  }
});

router.get("/quota-bar", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.userContext!.userId;
    
    const [userQuotas, workflowProgress] = await Promise.all([
      db.select()
        .from(userControls)
        .where(eq(userControls.userId, userId))
        .limit(1),
      
      db.select()
        .from(sdrWorkflowProgress)
        .where(eq(sdrWorkflowProgress.userId, userId))
        .limit(1)
    ]);

    const quotaData = userQuotas[0] || {
      maxEmailsPerDay: 200,
      emailsSentToday: 0,
      maxConcurrentEnrollments: 5,
      activeEnrollments: 0,
      isPaused: false,
      lastResetDate: null
    };

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    const hardStopReasons: string[] = [];
    if ((quotaData.emailsSentToday || 0) >= (quotaData.maxEmailsPerDay || 200)) {
      hardStopReasons.push("Daily email limit reached");
    }
    if ((quotaData.activeEnrollments || 0) >= (quotaData.maxConcurrentEnrollments || 5)) {
      hardStopReasons.push("Enrollment cap exceeded");
    }
    if (quotaData.isPaused) {
      hardStopReasons.push("Account paused");
    }
    
    if (workflowProgress[0]?.blockingReasons?.length) {
      workflowProgress[0].blockingReasons.forEach((reason: any) => {
        if (reason.message) {
          hardStopReasons.push(reason.message);
        }
      });
    }

    res.json({
      emailsUsed: quotaData.emailsSentToday || 0,
      emailsLimit: quotaData.maxEmailsPerDay || 200,
      enrollmentsUsed: quotaData.activeEnrollments || 0,
      enrollmentsLimit: quotaData.maxConcurrentEnrollments || 5,
      resetTime: tomorrow.toISOString(),
      isPaused: quotaData.isPaused || false,
      hardStopReasons,
      workflowStage: workflowProgress[0]?.currentStage || "readiness",
    });
  } catch (error) {
    console.error("Quota bar error:", error);
    res.status(500).json({ error: "Failed to fetch quota data" });
  }
});

// Personal Analytics endpoint with time filters
router.get("/analytics", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.userContext!.userId;
    const { period = "30d" } = req.query;
    
    const now = new Date();
    let startDate: Date;
    let intervalDays: number;
    
    switch (period) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        intervalDays = 1;
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        intervalDays = 1;
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        intervalDays = 7;
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        intervalDays = 1;
    }
    
    // Get daily email stats
    const emailStats = await db.select({
      date: sql<string>`DATE(${emails.sentAt})`.as("date"),
      sent: count(),
      opened: sql<number>`COUNT(CASE WHEN ${emails.openedAt} IS NOT NULL THEN 1 END)`,
      replied: sql<number>`COUNT(CASE WHEN ${emails.repliedAt} IS NOT NULL THEN 1 END)`
    })
      .from(emails)
      .where(and(
        eq(emails.userId, userId),
        eq(emails.status, "sent"),
        gte(emails.sentAt, startDate)
      ))
      .groupBy(sql`DATE(${emails.sentAt})`)
      .orderBy(sql`DATE(${emails.sentAt})`);
    
    // Get sequence performance
    const sequencePerformance = await db.select({
      sequenceId: emails.sequenceId,
      sequenceName: sequences.name,
      sent: count(),
      opened: sql<number>`COUNT(CASE WHEN ${emails.openedAt} IS NOT NULL THEN 1 END)`,
      replied: sql<number>`COUNT(CASE WHEN ${emails.repliedAt} IS NOT NULL THEN 1 END)`
    })
      .from(emails)
      .leftJoin(sequences, eq(emails.sequenceId, sequences.id))
      .where(and(
        eq(emails.userId, userId),
        eq(emails.status, "sent"),
        gte(emails.sentAt, startDate),
        isNotNull(emails.sequenceId)
      ))
      .groupBy(emails.sequenceId, sequences.name)
      .orderBy(desc(count()))
      .limit(10);
    
    // Calculate aggregate metrics
    const totals = await db.select({
      totalSent: count(),
      totalOpened: sql<number>`COUNT(CASE WHEN ${emails.openedAt} IS NOT NULL THEN 1 END)`,
      totalReplied: sql<number>`COUNT(CASE WHEN ${emails.repliedAt} IS NOT NULL THEN 1 END)`
    })
      .from(emails)
      .where(and(
        eq(emails.userId, userId),
        eq(emails.status, "sent"),
        gte(emails.sentAt, startDate)
      ));
    
    // Get previous period for comparison
    const previousPeriodStart = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()));
    const previousTotals = await db.select({
      totalSent: count(),
      totalOpened: sql<number>`COUNT(CASE WHEN ${emails.openedAt} IS NOT NULL THEN 1 END)`,
      totalReplied: sql<number>`COUNT(CASE WHEN ${emails.repliedAt} IS NOT NULL THEN 1 END)`
    })
      .from(emails)
      .where(and(
        eq(emails.userId, userId),
        eq(emails.status, "sent"),
        gte(emails.sentAt, previousPeriodStart),
        lt(emails.sentAt, startDate)
      ));
    
    const current = totals[0] || { totalSent: 0, totalOpened: 0, totalReplied: 0 };
    const previous = previousTotals[0] || { totalSent: 0, totalOpened: 0, totalReplied: 0 };
    
    const currentOpenRate = current.totalSent > 0 ? (Number(current.totalOpened) / current.totalSent) * 100 : 0;
    const currentReplyRate = current.totalSent > 0 ? (Number(current.totalReplied) / current.totalSent) * 100 : 0;
    const previousOpenRate = previous.totalSent > 0 ? (Number(previous.totalOpened) / previous.totalSent) * 100 : 0;
    const previousReplyRate = previous.totalSent > 0 ? (Number(previous.totalReplied) / previous.totalSent) * 100 : 0;
    
    res.json({
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      trends: emailStats.map(stat => ({
        date: stat.date,
        sent: stat.sent,
        opened: Number(stat.opened),
        replied: Number(stat.replied),
        openRate: stat.sent > 0 ? Math.round((Number(stat.opened) / stat.sent) * 100) : 0,
        replyRate: stat.sent > 0 ? Math.round((Number(stat.replied) / stat.sent) * 100) : 0
      })),
      summary: {
        totalSent: current.totalSent,
        totalOpened: Number(current.totalOpened),
        totalReplied: Number(current.totalReplied),
        openRate: Math.round(currentOpenRate),
        replyRate: Math.round(currentReplyRate),
        sentChange: previous.totalSent > 0 
          ? Math.round(((current.totalSent - previous.totalSent) / previous.totalSent) * 100) 
          : current.totalSent > 0 ? 100 : 0,
        openRateChange: Math.round(currentOpenRate - previousOpenRate),
        replyRateChange: Math.round(currentReplyRate - previousReplyRate)
      },
      topSequences: sequencePerformance.map(seq => ({
        id: seq.sequenceId,
        name: seq.sequenceName || "Unknown",
        sent: seq.sent,
        opened: Number(seq.opened),
        replied: Number(seq.replied),
        openRate: seq.sent > 0 ? Math.round((Number(seq.opened) / seq.sent) * 100) : 0,
        replyRate: seq.sent > 0 ? Math.round((Number(seq.replied) / seq.sent) * 100) : 0
      }))
    });
  } catch (error) {
    console.error("Personal analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics data" });
  }
});

// Team Benchmarking - TC-SDR-AN-03
// Empty/default benchmark payload returned when team data can't be computed
// (e.g. user has no organization yet, or a query error occurs).
function emptyTeamBenchmark(period: unknown) {
  return {
    period,
    you: { totalSent: 0, openRate: 0, replyRate: 0 },
    teamAverage: { totalSent: 0, openRate: 0, replyRate: 0 },
    comparison: { sentVsTeam: 0, openRateVsTeam: 0, replyRateVsTeam: 0 },
    teamSize: 0
  };
}

router.get("/team-benchmark", authenticate, async (req: Request, res: Response) => {
  const { period = "30d" } = req.query;
  try {
    const userId = req.userContext!.userId;
    const organizationId = req.userContext!.organizationId;

    // BUG 4 fix: users without an organization (e.g. orphaned accounts)
    // would previously cause this query to throw and return a 500.
    // Return an empty benchmark instead of crashing.
    if (!organizationId) {
      return res.json(emptyTeamBenchmark(period));
    }

    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    // Get current user's metrics
    const userMetrics = await db.select({
      totalSent: count(),
      totalOpened: sql<number>`COUNT(CASE WHEN ${emails.openedAt} IS NOT NULL THEN 1 END)`,
      totalReplied: sql<number>`COUNT(CASE WHEN ${emails.repliedAt} IS NOT NULL THEN 1 END)`
    })
      .from(emails)
      .where(and(
        eq(emails.userId, userId),
        eq(emails.status, "sent"),
        gte(emails.sentAt, startDate)
      ));
    
    // Get team average metrics (all users in same org, excluding current user)
    const teamMetrics = await db.select({
      totalSent: count(),
      totalOpened: sql<number>`COUNT(CASE WHEN ${emails.openedAt} IS NOT NULL THEN 1 END)`,
      totalReplied: sql<number>`COUNT(CASE WHEN ${emails.repliedAt} IS NOT NULL THEN 1 END)`,
      userCount: sql<number>`COUNT(DISTINCT ${emails.userId})`
    })
      .from(emails)
      .innerJoin(users, eq(emails.userId, users.id))
      .where(and(
        sql`${users.organizationId} = ${organizationId}`,
        ne(emails.userId, userId),
        eq(emails.status, "sent"),
        gte(emails.sentAt, startDate)
      ));
    
    const user = userMetrics[0] || { totalSent: 0, totalOpened: 0, totalReplied: 0 };
    const team = teamMetrics[0] || { totalSent: 0, totalOpened: 0, totalReplied: 0, userCount: 0 };
    
    const userOpenRate = user.totalSent > 0 ? (Number(user.totalOpened) / user.totalSent) * 100 : 0;
    const userReplyRate = user.totalSent > 0 ? (Number(user.totalReplied) / user.totalSent) * 100 : 0;
    
    const teamUserCount = Math.max(1, Number(team.userCount) || 1);
    const teamAvgSent = team.totalSent / teamUserCount;
    const teamOpenRate = team.totalSent > 0 ? (Number(team.totalOpened) / team.totalSent) * 100 : 0;
    const teamReplyRate = team.totalSent > 0 ? (Number(team.totalReplied) / team.totalSent) * 100 : 0;
    
    res.json({
      period,
      you: {
        totalSent: user.totalSent,
        openRate: Math.round(userOpenRate * 10) / 10,
        replyRate: Math.round(userReplyRate * 10) / 10
      },
      teamAverage: {
        totalSent: Math.round(teamAvgSent),
        openRate: Math.round(teamOpenRate * 10) / 10,
        replyRate: Math.round(teamReplyRate * 10) / 10
      },
      comparison: {
        sentVsTeam: teamAvgSent > 0 ? Math.round(((user.totalSent - teamAvgSent) / teamAvgSent) * 100) : 0,
        openRateVsTeam: Math.round((userOpenRate - teamOpenRate) * 10) / 10,
        replyRateVsTeam: Math.round((userReplyRate - teamReplyRate) * 10) / 10
      },
      teamSize: teamUserCount
    });
  } catch (error) {
    console.error("Team benchmark error:", error);
    // BUG 4 fix: return empty benchmark data instead of a 500 so the
    // dashboard doesn't break when team metrics can't be computed.
    res.json(emptyTeamBenchmark(period));
  }
});

// ============================================
// SENDING PREFERENCES
// ============================================

interface SendingPreferences {
  sendWindowStart: number;
  sendWindowEnd: number;
  excludeWeekends: boolean;
  defaultTone: 'professional' | 'casual' | 'consultative' | 'direct';
  defaultSignature: string;
  timezone: string;
}

router.get("/preferences", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.userContext!.userId;
    
    const profile = await db.select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    
    const prefs = profile[0]?.preferences || {};
    const defaults: SendingPreferences = {
      sendWindowStart: prefs.sendWindowStart ?? 9,
      sendWindowEnd: prefs.sendWindowEnd ?? 17,
      excludeWeekends: prefs.excludeWeekends ?? true,
      defaultTone: prefs.defaultTone ?? 'professional',
      defaultSignature: prefs.defaultSignature ?? '',
      timezone: profile[0]?.timezone ?? 'UTC'
    };
    
    res.json(defaults);
  } catch (error) {
    console.error("Get preferences error:", error);
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.patch("/preferences", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.userContext!.userId;
    const updates = req.body as Partial<SendingPreferences>;
    
    // Validate inputs
    if (updates.sendWindowStart !== undefined && (updates.sendWindowStart < 0 || updates.sendWindowStart > 23)) {
      return res.status(400).json({ error: "Send window start must be 0-23" });
    }
    if (updates.sendWindowEnd !== undefined && (updates.sendWindowEnd < 0 || updates.sendWindowEnd > 23)) {
      return res.status(400).json({ error: "Send window end must be 0-23" });
    }
    if (updates.defaultTone && !['professional', 'casual', 'consultative', 'direct'].includes(updates.defaultTone)) {
      return res.status(400).json({ error: "Invalid tone" });
    }
    
    // Get existing profile
    const existing = await db.select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    
    const currentPrefs = existing[0]?.preferences || {};
    const newPrefs = {
      ...currentPrefs,
      ...(updates.sendWindowStart !== undefined && { sendWindowStart: updates.sendWindowStart }),
      ...(updates.sendWindowEnd !== undefined && { sendWindowEnd: updates.sendWindowEnd }),
      ...(updates.excludeWeekends !== undefined && { excludeWeekends: updates.excludeWeekends }),
      ...(updates.defaultTone !== undefined && { defaultTone: updates.defaultTone }),
      ...(updates.defaultSignature !== undefined && { defaultSignature: updates.defaultSignature })
    };
    
    const newTimezone = updates.timezone || existing[0]?.timezone || 'UTC';
    
    if (existing.length > 0) {
      await db.update(userProfiles)
        .set({ 
          preferences: newPrefs,
          timezone: newTimezone,
          updatedAt: new Date()
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      await db.insert(userProfiles).values({
        userId,
        preferences: newPrefs,
        timezone: newTimezone
      });
    }
    
    res.json({ 
      success: true, 
      sendWindowStart: newPrefs.sendWindowStart ?? 9,
      sendWindowEnd: newPrefs.sendWindowEnd ?? 17,
      excludeWeekends: newPrefs.excludeWeekends ?? true,
      defaultTone: newPrefs.defaultTone ?? 'professional',
      defaultSignature: newPrefs.defaultSignature ?? '',
      timezone: newTimezone
    });
  } catch (error) {
    console.error("Update preferences error:", error);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

// ============================================
// ACTIVITY FEED
// ============================================

router.get("/activity", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.userContext!.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const actionFilter = req.query.action as string | undefined;
    const targetType = req.query.targetType as string | undefined;
    
    // 90-day retention
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const conditions = [
      eq(userActivityLogs.userId, userId),
      gte(userActivityLogs.createdAt, cutoffDate)
    ];
    
    if (actionFilter) {
      conditions.push(sql`${userActivityLogs.action} ILIKE ${`%${actionFilter}%`}`);
    }
    if (targetType) {
      conditions.push(eq(userActivityLogs.targetType, targetType));
    }
    
    const [activities, totalResult] = await Promise.all([
      db.select()
        .from(userActivityLogs)
        .where(and(...conditions))
        .orderBy(desc(userActivityLogs.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() })
        .from(userActivityLogs)
        .where(and(...conditions))
    ]);
    
    const total = totalResult[0]?.count || 0;
    
    res.json({
      activities: activities.map(a => ({
        id: a.id,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        metadata: a.metadata,
        duration: a.duration,
        createdAt: a.createdAt?.toISOString()
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Activity feed error:", error);
    res.status(500).json({ error: "Failed to fetch activity feed" });
  }
});

export default router;
