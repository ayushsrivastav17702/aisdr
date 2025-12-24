import { Router } from "express";
import { db } from "../db";
import { 
  userBadges, 
  leaderboardPeriods, 
  leaderboardEntries, 
  users,
  emailSendLog,
  emailReplies,
  prospects
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { authenticate } from "../middleware/auth.middleware";
import { z } from "zod";

const router = Router();

const BADGE_DEFINITIONS = [
  { type: "first_meeting", name: "First Steps", description: "Booked your first meeting", icon: "Trophy", color: "#FFD700", threshold: 1 },
  { type: "meetings_milestone", name: "Meeting Master", description: "Booked 10 meetings", icon: "Star", color: "#4CAF50", threshold: 10 },
  { type: "meetings_milestone", name: "Deal Dynamo", description: "Booked 50 meetings", icon: "Zap", color: "#2196F3", threshold: 50 },
  { type: "meetings_milestone", name: "Sales Superstar", description: "Booked 100 meetings", icon: "Crown", color: "#9C27B0", threshold: 100 },
  { type: "reply_rate", name: "Conversation Starter", description: "Achieved 10% reply rate", icon: "MessageSquare", color: "#FF9800", threshold: 10 },
  { type: "reply_rate", name: "Engagement Expert", description: "Achieved 20% reply rate", icon: "TrendingUp", color: "#E91E63", threshold: 20 },
  { type: "streak", name: "On Fire", description: "7-day meeting streak", icon: "Flame", color: "#F44336", threshold: 7 },
  { type: "top_performer", name: "Top Performer", description: "Ranked #1 in weekly leaderboard", icon: "Award", color: "#673AB7", threshold: 1 },
  { type: "speed_demon", name: "Speed Demon", description: "Responded to 10 replies under 30 minutes", icon: "Clock", color: "#00BCD4", threshold: 10 },
  { type: "team_player", name: "Team Player", description: "Helped teammates with 5 handoffs", icon: "Users", color: "#795548", threshold: 5 },
];

router.get("/api/leaderboard", authenticate, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { periodType = "weekly" } = req.query;
    const now = new Date();
    
    let periodStart: Date;
    let periodEnd: Date;
    
    if (periodType === "daily") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    } else if (periodType === "monthly") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      periodStart = new Date(now.setDate(diff));
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    let period = await db.query.leaderboardPeriods.findFirst({
      where: and(
        eq(leaderboardPeriods.organizationId, userContext.organizationId),
        eq(leaderboardPeriods.periodType, periodType as string),
        gte(leaderboardPeriods.periodStart, periodStart),
        lte(leaderboardPeriods.periodEnd, periodEnd)
      )
    });

    if (!period) {
      const [newPeriod] = await db.insert(leaderboardPeriods).values({
        organizationId: userContext.organizationId,
        periodType: periodType as string,
        periodStart,
        periodEnd,
        isActive: true,
      }).returning();
      period = newPeriod;
    }

    const entries = await db
      .select({
        id: leaderboardEntries.id,
        userId: leaderboardEntries.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        meetingsBooked: leaderboardEntries.meetingsBooked,
        emailsSent: leaderboardEntries.emailsSent,
        repliesReceived: leaderboardEntries.repliesReceived,
        positiveReplies: leaderboardEntries.positiveReplies,
        openRate: leaderboardEntries.openRate,
        replyRate: leaderboardEntries.replyRate,
        rank: leaderboardEntries.rank,
        points: leaderboardEntries.points,
        previousRank: leaderboardEntries.previousRank,
        rankChange: leaderboardEntries.rankChange,
      })
      .from(leaderboardEntries)
      .innerJoin(users, eq(leaderboardEntries.userId, users.id))
      .where(eq(leaderboardEntries.periodId, period.id))
      .orderBy(desc(leaderboardEntries.points), leaderboardEntries.rank);

    const myEntry = entries.find(e => e.userId === userContext.userId);

    res.json({
      period: {
        id: period.id,
        type: period.periodType,
        start: period.periodStart,
        end: period.periodEnd,
      },
      entries,
      myRank: myEntry?.rank || null,
      myPoints: myEntry?.points || 0,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.post("/api/leaderboard/refresh", authenticate, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { periodType = "weekly" } = req.body;
    const now = new Date();
    
    let periodStart: Date;
    let periodEnd: Date;
    
    if (periodType === "daily") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    } else if (periodType === "monthly") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      periodStart = new Date(now.setDate(diff));
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    let [period] = await db
      .select()
      .from(leaderboardPeriods)
      .where(and(
        eq(leaderboardPeriods.organizationId, userContext.organizationId),
        eq(leaderboardPeriods.periodType, periodType),
        gte(leaderboardPeriods.periodStart, periodStart)
      ))
      .limit(1);

    if (!period) {
      [period] = await db.insert(leaderboardPeriods).values({
        organizationId: userContext.organizationId,
        periodType,
        periodStart,
        periodEnd,
        isActive: true,
      }).returning();
    }

    const orgUsers = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.organizationId, userContext.organizationId));

    for (const user of orgUsers) {
      const [emailStats] = await db
        .select({
          sent: sql<number>`count(*)::int`,
          delivered: sql<number>`count(*) filter (where ${emailSendLog.deliveredAt} is not null)::int`,
        })
        .from(emailSendLog)
        .where(and(
          eq(emailSendLog.userId, user.id),
          gte(emailSendLog.sentAt, periodStart),
          lte(emailSendLog.sentAt, periodEnd)
        ));

      const [replyStats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')::int`,
        })
        .from(emailReplies)
        .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
        .where(and(
          eq(prospects.userId, user.id),
          gte(emailReplies.receivedAt, periodStart),
          lte(emailReplies.receivedAt, periodEnd)
        ));

      const emailsSent = emailStats?.sent || 0;
      const repliesReceived = replyStats?.total || 0;
      const positiveReplies = replyStats?.positive || 0;
      const openRate = emailsSent > 0 ? (emailStats?.delivered || 0) / emailsSent * 100 : 0;
      const replyRate = emailsSent > 0 ? repliesReceived / emailsSent * 100 : 0;

      const points = (positiveReplies * 100) + (repliesReceived * 50) + (emailsSent * 1);

      const existingEntry = await db.query.leaderboardEntries.findFirst({
        where: and(
          eq(leaderboardEntries.periodId, period.id),
          eq(leaderboardEntries.userId, user.id)
        )
      });

      if (existingEntry) {
        await db.update(leaderboardEntries)
          .set({
            emailsSent,
            repliesReceived,
            positiveReplies,
            openRate,
            replyRate,
            points,
            previousRank: existingEntry.rank,
            updatedAt: new Date(),
          })
          .where(eq(leaderboardEntries.id, existingEntry.id));
      } else {
        await db.insert(leaderboardEntries).values({
          periodId: period.id,
          userId: user.id,
          organizationId: userContext.organizationId,
          emailsSent,
          repliesReceived,
          positiveReplies,
          openRate,
          replyRate,
          points,
        });
      }
    }

    const rankedEntries = await db
      .select()
      .from(leaderboardEntries)
      .where(eq(leaderboardEntries.periodId, period.id))
      .orderBy(desc(leaderboardEntries.points));

    for (let i = 0; i < rankedEntries.length; i++) {
      const entry = rankedEntries[i];
      const newRank = i + 1;
      const rankChange = entry.previousRank ? entry.previousRank - newRank : 0;
      
      await db.update(leaderboardEntries)
        .set({ rank: newRank, rankChange })
        .where(eq(leaderboardEntries.id, entry.id));
    }

    res.json({ success: true, message: "Leaderboard refreshed" });
  } catch (error) {
    console.error("Error refreshing leaderboard:", error);
    res.status(500).json({ error: "Failed to refresh leaderboard" });
  }
});

router.get("/api/badges", authenticate, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.userId) {
      return res.status(403).json({ error: "Authentication required" });
    }

    const badges = await db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userContext.userId))
      .orderBy(desc(userBadges.achievedAt));

    res.json({
      badges,
      availableBadges: BADGE_DEFINITIONS,
    });
  } catch (error) {
    console.error("Error fetching badges:", error);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

router.get("/api/badges/check", authenticate, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.userId || !userContext?.organizationId) {
      return res.status(403).json({ error: "Authentication required" });
    }

    const existingBadges = await db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userContext.userId));

    const existingTypes = new Set(existingBadges.map(b => `${b.badgeType}-${b.achievementValue}`));
    const newBadges: any[] = [];

    const [replyStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')::int`,
      })
      .from(emailReplies)
      .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(eq(prospects.userId, userContext.userId));

    const [emailStats] = await db
      .select({
        sent: sql<number>`count(*)::int`,
      })
      .from(emailSendLog)
      .where(eq(emailSendLog.userId, userContext.userId));

    const meetings = replyStats?.positive || 0;
    const emailsSent = emailStats?.sent || 0;
    const replyRate = emailsSent > 0 ? (replyStats?.total || 0) / emailsSent * 100 : 0;

    for (const badge of BADGE_DEFINITIONS) {
      const key = `${badge.type}-${badge.threshold}`;
      if (existingTypes.has(key)) continue;

      let earned = false;
      if (badge.type === "first_meeting" && meetings >= 1) earned = true;
      if (badge.type === "meetings_milestone" && meetings >= badge.threshold) earned = true;
      if (badge.type === "reply_rate" && replyRate >= badge.threshold) earned = true;

      if (earned) {
        const [newBadge] = await db.insert(userBadges).values({
          userId: userContext.userId,
          organizationId: userContext.organizationId,
          badgeType: badge.type as any,
          badgeName: badge.name,
          badgeDescription: badge.description,
          badgeIcon: badge.icon,
          badgeColor: badge.color,
          achievementValue: badge.threshold,
        }).returning();
        newBadges.push(newBadge);
      }
    }

    res.json({ newBadges, totalBadges: existingBadges.length + newBadges.length });
  } catch (error) {
    console.error("Error checking badges:", error);
    res.status(500).json({ error: "Failed to check badges" });
  }
});

export default router;
