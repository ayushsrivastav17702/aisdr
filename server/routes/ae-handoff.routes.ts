import { Router } from "express";
import { db } from "../db";
import { 
  aeHandoffs, 
  handoffActivities,
  prospects,
  users
} from "@shared/schema";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { authenticate, forbidManager, blockSuperAdminFromSDR } from "../middleware/auth.middleware";
import { z } from "zod";

const router = Router();

const createHandoffSchema = z.object({
  prospectId: z.string(),
  aeUserId: z.string().optional(),
  qualificationFramework: z.enum(["bant", "meddic", "custom"]).default("bant"),
  budget: z.string().optional(),
  budgetConfirmed: z.boolean().optional(),
  authority: z.string().optional(),
  authorityConfirmed: z.boolean().optional(),
  need: z.string().optional(),
  needConfirmed: z.boolean().optional(),
  timeline: z.string().optional(),
  timelineConfirmed: z.boolean().optional(),
  metrics: z.string().optional(),
  economicBuyer: z.string().optional(),
  decisionCriteria: z.string().optional(),
  decisionProcess: z.string().optional(),
  identifyPain: z.string().optional(),
  champion: z.string().optional(),
  meetingScheduledAt: z.string().optional(),
  meetingNotes: z.string().optional(),
  handoffNotes: z.string().optional(),
  handoffReason: z.string().optional(),
});

const updateHandoffSchema = z.object({
  status: z.enum(["pending_review", "accepted", "rejected", "converted", "lost"]).optional(),
  aeUserId: z.string().optional(),
  aeFeedback: z.string().optional(),
  aeRating: z.number().min(1).max(5).optional(),
  dealValue: z.number().optional(),
  dealCurrency: z.string().optional(),
  outcome: z.string().optional(),
  meetingCompletedAt: z.string().optional(),
  meetingNotes: z.string().optional(),
});

function calculateQualificationScore(handoff: any): number {
  let score = 0;
  
  if (handoff.qualificationFramework === "bant") {
    if (handoff.budget) score += 15;
    if (handoff.budgetConfirmed) score += 10;
    if (handoff.authority) score += 15;
    if (handoff.authorityConfirmed) score += 10;
    if (handoff.need) score += 15;
    if (handoff.needConfirmed) score += 10;
    if (handoff.timeline) score += 15;
    if (handoff.timelineConfirmed) score += 10;
  } else if (handoff.qualificationFramework === "meddic") {
    if (handoff.metrics) score += 17;
    if (handoff.economicBuyer) score += 17;
    if (handoff.decisionCriteria) score += 17;
    if (handoff.decisionProcess) score += 17;
    if (handoff.identifyPain) score += 16;
    if (handoff.champion) score += 16;
  }

  return Math.min(score, 100);
}

router.get("/api/handoffs", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { status, role } = req.query;
    const user = (req as any).user;

    let whereCondition = eq(aeHandoffs.organizationId, userContext.organizationId);

    if (role === "ae") {
      whereCondition = and(whereCondition, eq(aeHandoffs.aeUserId, user.id))!;
    } else if (role === "sdr") {
      whereCondition = and(whereCondition, eq(aeHandoffs.sdrUserId, user.id))!;
    }

    if (status && status !== "all") {
      whereCondition = and(whereCondition, eq(aeHandoffs.status, status as any))!;
    }

    const handoffs = await db
      .select({
        id: aeHandoffs.id,
        prospectId: aeHandoffs.prospectId,
        sdrUserId: aeHandoffs.sdrUserId,
        aeUserId: aeHandoffs.aeUserId,
        qualificationFramework: aeHandoffs.qualificationFramework,
        qualificationScore: aeHandoffs.qualificationScore,
        budget: aeHandoffs.budget,
        budgetConfirmed: aeHandoffs.budgetConfirmed,
        authority: aeHandoffs.authority,
        authorityConfirmed: aeHandoffs.authorityConfirmed,
        need: aeHandoffs.need,
        needConfirmed: aeHandoffs.needConfirmed,
        timeline: aeHandoffs.timeline,
        timelineConfirmed: aeHandoffs.timelineConfirmed,
        meetingScheduledAt: aeHandoffs.meetingScheduledAt,
        meetingCompletedAt: aeHandoffs.meetingCompletedAt,
        status: aeHandoffs.status,
        handoffNotes: aeHandoffs.handoffNotes,
        handoffReason: aeHandoffs.handoffReason,
        aeFeedback: aeHandoffs.aeFeedback,
        aeRating: aeHandoffs.aeRating,
        dealValue: aeHandoffs.dealValue,
        dealCurrency: aeHandoffs.dealCurrency,
        outcome: aeHandoffs.outcome,
        createdAt: aeHandoffs.createdAt,
        prospectName: prospects.fullName,
        prospectEmail: prospects.primaryEmail,
        prospectCompany: prospects.companyName,
        prospectTitle: prospects.jobTitle,
        sdrName: sql<string>`trim(concat(sdr.first_name, ' ', sdr.last_name))`,
        aeName: sql<string>`trim(concat(ae.first_name, ' ', ae.last_name))`,
      })
      .from(aeHandoffs)
      .leftJoin(prospects, eq(aeHandoffs.prospectId, prospects.id))
      .leftJoin(sql`users as sdr`, sql`${aeHandoffs.sdrUserId} = sdr.id`)
      .leftJoin(sql`users as ae`, sql`${aeHandoffs.aeUserId} = ae.id`)
      .where(whereCondition)
      .orderBy(desc(aeHandoffs.createdAt));

    const stats = {
      total: handoffs.length,
      pending: handoffs.filter(h => h.status === "pending_review").length,
      accepted: handoffs.filter(h => h.status === "accepted").length,
      converted: handoffs.filter(h => h.status === "converted").length,
      rejected: handoffs.filter(h => h.status === "rejected").length,
      avgQualificationScore: handoffs.length > 0 
        ? Math.round(handoffs.reduce((sum, h) => sum + (h.qualificationScore || 0), 0) / handoffs.length)
        : 0,
    };

    res.json({ handoffs, stats });
  } catch (error) {
    console.error("Error fetching handoffs:", error);
    res.status(500).json({ error: "Failed to fetch handoffs" });
  }
});

router.get("/api/handoffs/:id", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { id } = req.params;

    const handoff = await db.query.aeHandoffs.findFirst({
      where: and(
        eq(aeHandoffs.id, id),
        eq(aeHandoffs.organizationId, userContext.organizationId)
      )
    });

    if (!handoff) {
      return res.status(404).json({ error: "Handoff not found" });
    }

    const prospect = await db.query.prospects.findFirst({
      where: eq(prospects.id, handoff.prospectId)
    });

    const sdr = await db.query.users.findFirst({
      where: eq(users.id, handoff.sdrUserId)
    });

    const ae = handoff.aeUserId ? await db.query.users.findFirst({
      where: eq(users.id, handoff.aeUserId)
    }) : null;

    const activities = await db
      .select({
        id: handoffActivities.id,
        activityType: handoffActivities.activityType,
        description: handoffActivities.description,
        metadata: handoffActivities.metadata,
        createdAt: handoffActivities.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(handoffActivities)
      .leftJoin(users, eq(handoffActivities.userId, users.id))
      .where(eq(handoffActivities.handoffId, id))
      .orderBy(desc(handoffActivities.createdAt));

    res.json({
      handoff,
      prospect,
      sdr: sdr ? { id: sdr.id, fullName: `${sdr.firstName || ''} ${sdr.lastName || ''}`.trim(), email: sdr.email } : null,
      ae: ae ? { id: ae.id, fullName: `${ae.firstName || ''} ${ae.lastName || ''}`.trim(), email: ae.email } : null,
      activities,
    });
  } catch (error) {
    console.error("Error fetching handoff:", error);
    res.status(500).json({ error: "Failed to fetch handoff" });
  }
});

router.post("/api/handoffs", authenticate, forbidManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId || !userContext?.userId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const validation = createHandoffSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid data", details: validation.error.errors });
    }

    const data = validation.data;

    const prospectResult = await db
      .select({ id: prospects.id })
      .from(prospects)
      .innerJoin(users, eq(prospects.userId, users.id))
      .where(and(
        eq(prospects.id, data.prospectId),
        eq(users.organizationId, userContext.organizationId)
      ))
      .limit(1);

    if (prospectResult.length === 0) {
      return res.status(404).json({ error: "Prospect not found or access denied" });
    }

    if (data.aeUserId) {
      const aeUser = await db.query.users.findFirst({
        where: and(
          eq(users.id, data.aeUserId),
          eq(users.organizationId, userContext.organizationId)
        )
      });
      if (!aeUser) {
        return res.status(404).json({ error: "AE user not found in your organization" });
      }
    }

    const handoffData = {
      organizationId: userContext.organizationId,
      prospectId: data.prospectId,
      sdrUserId: userContext.userId,
      aeUserId: data.aeUserId || null,
      qualificationFramework: data.qualificationFramework,
      budget: data.budget,
      budgetConfirmed: data.budgetConfirmed,
      authority: data.authority,
      authorityConfirmed: data.authorityConfirmed,
      need: data.need,
      needConfirmed: data.needConfirmed,
      timeline: data.timeline,
      timelineConfirmed: data.timelineConfirmed,
      metrics: data.metrics,
      economicBuyer: data.economicBuyer,
      decisionCriteria: data.decisionCriteria,
      decisionProcess: data.decisionProcess,
      identifyPain: data.identifyPain,
      champion: data.champion,
      meetingScheduledAt: data.meetingScheduledAt ? new Date(data.meetingScheduledAt) : null,
      meetingNotes: data.meetingNotes,
      handoffNotes: data.handoffNotes,
      handoffReason: data.handoffReason,
      qualificationScore: 0,
      status: "pending_review" as const,
    };

    handoffData.qualificationScore = calculateQualificationScore(handoffData);

    const [handoff] = await db.insert(aeHandoffs).values(handoffData).returning();

    await db.insert(handoffActivities).values({
      handoffId: handoff.id,
      userId: userContext.userId,
      activityType: "note",
      description: "Handoff created",
      metadata: { qualificationScore: handoff.qualificationScore },
    });

    res.status(201).json({ handoff });
  } catch (error) {
    console.error("Error creating handoff:", error);
    res.status(500).json({ error: "Failed to create handoff" });
  }
});

router.patch("/api/handoffs/:id", authenticate, forbidManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId || !userContext?.userId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { id } = req.params;

    const validation = updateHandoffSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid data", details: validation.error.errors });
    }

    const data = validation.data;

    const existing = await db.query.aeHandoffs.findFirst({
      where: and(
        eq(aeHandoffs.id, id),
        eq(aeHandoffs.organizationId, userContext.organizationId)
      )
    });

    if (!existing) {
      return res.status(404).json({ error: "Handoff not found" });
    }

    if (data.aeUserId && data.aeUserId !== existing.aeUserId) {
      const aeUser = await db.query.users.findFirst({
        where: and(
          eq(users.id, data.aeUserId),
          eq(users.organizationId, userContext.organizationId)
        )
      });
      if (!aeUser) {
        return res.status(404).json({ error: "AE user not found in your organization" });
      }
    }

    const updateData: any = {
      ...data,
      updatedAt: new Date(),
    };

    if (data.meetingCompletedAt) {
      updateData.meetingCompletedAt = new Date(data.meetingCompletedAt);
    }

    if (data.outcome === "won" && data.dealValue) {
      updateData.closedAt = new Date();
      updateData.status = "converted";
    } else if (data.outcome === "lost") {
      updateData.closedAt = new Date();
      updateData.status = "lost";
    }

    const [handoff] = await db.update(aeHandoffs)
      .set(updateData)
      .where(eq(aeHandoffs.id, id))
      .returning();

    if (data.status && data.status !== existing.status) {
      await db.insert(handoffActivities).values({
        handoffId: id,
        userId: userContext.userId,
        activityType: "status_change",
        description: `Status changed from ${existing.status} to ${data.status}`,
        metadata: { oldStatus: existing.status, newStatus: data.status },
      });
    }

    if (data.aeFeedback) {
      await db.insert(handoffActivities).values({
        handoffId: id,
        userId: userContext.userId,
        activityType: "feedback",
        description: data.aeFeedback,
        metadata: { rating: data.aeRating },
      });
    }

    res.json({ handoff });
  } catch (error) {
    console.error("Error updating handoff:", error);
    res.status(500).json({ error: "Failed to update handoff" });
  }
});

router.post("/api/handoffs/:id/activity", authenticate, forbidManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId || !userContext?.userId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { id } = req.params;
    const { activityType, description, metadata } = req.body;

    const handoff = await db.query.aeHandoffs.findFirst({
      where: and(
        eq(aeHandoffs.id, id),
        eq(aeHandoffs.organizationId, userContext.organizationId)
      )
    });

    if (!handoff) {
      return res.status(404).json({ error: "Handoff not found" });
    }

    const [activity] = await db.insert(handoffActivities).values({
      handoffId: id,
      userId: userContext.userId,
      activityType,
      description,
      metadata,
    }).returning();

    res.status(201).json({ activity });
  } catch (error) {
    console.error("Error adding activity:", error);
    res.status(500).json({ error: "Failed to add activity" });
  }
});

router.get("/api/handoffs/stats/conversion", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const allHandoffs = await db
      .select()
      .from(aeHandoffs)
      .where(eq(aeHandoffs.organizationId, userContext.organizationId));

    const total = allHandoffs.length;
    const converted = allHandoffs.filter(h => h.status === "converted").length;
    const rejected = allHandoffs.filter(h => h.status === "rejected").length;
    const lost = allHandoffs.filter(h => h.status === "lost").length;
    const pending = allHandoffs.filter(h => h.status === "pending_review").length;
    const accepted = allHandoffs.filter(h => h.status === "accepted").length;

    const totalValue = allHandoffs
      .filter(h => h.dealValue && h.status === "converted")
      .reduce((sum, h) => sum + (h.dealValue || 0), 0);

    const avgQualScore = total > 0 
      ? allHandoffs.reduce((sum, h) => sum + (h.qualificationScore || 0), 0) / total 
      : 0;

    const avgRating = allHandoffs.filter(h => h.aeRating).length > 0
      ? allHandoffs.filter(h => h.aeRating).reduce((sum, h) => sum + (h.aeRating || 0), 0) / allHandoffs.filter(h => h.aeRating).length
      : 0;

    res.json({
      total,
      converted,
      rejected,
      lost,
      pending,
      accepted,
      conversionRate: total > 0 ? (converted / total * 100).toFixed(1) : 0,
      rejectionRate: total > 0 ? (rejected / total * 100).toFixed(1) : 0,
      totalPipelineValue: totalValue,
      avgQualificationScore: Math.round(avgQualScore),
      avgAeRating: avgRating.toFixed(1),
    });
  } catch (error) {
    console.error("Error fetching conversion stats:", error);
    res.status(500).json({ error: "Failed to fetch conversion stats" });
  }
});

router.get("/api/team/ae-users", authenticate, blockSuperAdminFromSDR, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const aeUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.organizationId, userContext.organizationId));

    const usersWithFullName = aeUsers.map(u => ({
      id: u.id,
      fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      email: u.email,
    }));
    res.json({ users: usersWithFullName });
  } catch (error) {
    console.error("Error fetching AE users:", error);
    res.status(500).json({ error: "Failed to fetch AE users" });
  }
});

export default router;
