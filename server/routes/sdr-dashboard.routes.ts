import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  emails, 
  sequences, 
  sequenceProspects, 
  userControls,
  sdrWorkflowProgress,
  emailReplies,
  personalizationResults
} from "@shared/schema";
import { eq, and, gte, lt, sql, count, desc, isNotNull } from "drizzle-orm";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

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

export default router;
