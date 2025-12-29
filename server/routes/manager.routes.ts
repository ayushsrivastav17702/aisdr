import { Router } from "express";
import { db } from "../db";
import { 
  users, 
  sequences,
  emailQueue,
  emailReplies,
  prospects,
  emailMailboxes,
  userInvitations,
} from "@shared/schema";
import { eq, and, count, sql, isNull, inArray, gte } from "drizzle-orm";
import { authenticate, requireManager } from "../middleware/auth.middleware";
import { auditService } from "../services/audit.service";
import bcrypt from "bcrypt";
import crypto from "crypto";

const router = Router();

async function getTeamMemberIds(organizationId: string): Promise<string[]> {
  const teamMembers = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.organizationId, organizationId),
      isNull(users.deletedAt)
    ));
  return teamMembers.map(m => m.id);
}

async function verifyUserBelongsToOrg(userId: string, organizationId: string): Promise<typeof users.$inferSelect | null> {
  const [user] = await db.select().from(users)
    .where(and(
      eq(users.id, userId),
      eq(users.organizationId, organizationId),
      isNull(users.deletedAt)
    ))
    .limit(1);
  return user || null;
}

async function verifyCampaignBelongsToOrg(campaignId: string, organizationId: string): Promise<typeof sequences.$inferSelect | null> {
  const result = await db.select({
    sequence: sequences,
    user: users,
  })
  .from(sequences)
  .innerJoin(users, eq(sequences.userId, users.id))
  .where(and(
    eq(sequences.id, campaignId),
    eq(users.organizationId, organizationId),
    isNull(users.deletedAt)
  ))
  .limit(1);
  
  return result[0]?.sequence || null;
}

router.get("/api/manager/team", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const teamMembers = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      isActive: users.isActive,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
      onboardingCompleted: users.onboardingCompleted,
    })
    .from(users)
    .where(and(
      eq(users.organizationId, userContext.organizationId),
      isNull(users.deletedAt)
    ))
    .orderBy(sql`${users.createdAt} desc`);

    res.json(teamMembers);
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ error: "Failed to fetch team members" });
  }
});

router.get("/api/manager/stats", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const memberIds = await getTeamMemberIds(userContext.organizationId);

    const [userCounts] = await db.select({
      totalUsers: count(),
      activeUsers: sql<number>`count(*) filter (where ${users.isActive} = true)`,
    })
    .from(users)
    .where(and(
      eq(users.organizationId, userContext.organizationId),
      isNull(users.deletedAt)
    ));

    let totalEmailsSent = 0;
    let totalMeetingsBooked = 0;
    let replyRate = 0;
    let activeCampaigns = 0;
    
    if (memberIds.length > 0) {
      const [emailStats] = await db.select({ sent: count() })
        .from(emailQueue)
        .where(and(
          inArray(emailQueue.userId, memberIds),
          eq(emailQueue.status, 'sent')
        ));
      totalEmailsSent = emailStats?.sent || 0;

      const teamSequenceIds = await db.select({ id: sequences.id })
        .from(sequences)
        .where(inArray(sequences.userId, memberIds));
      
      const seqIds = teamSequenceIds.map(s => s.id);
      if (seqIds.length > 0) {
        const [replyStats] = await db.select({
          total: count(),
          positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
        })
        .from(emailReplies)
        .where(inArray(emailReplies.sequenceId, seqIds));
        totalMeetingsBooked = replyStats?.positive || 0;
        
        if (totalEmailsSent > 0) {
          replyRate = Math.round(((replyStats?.total || 0) / totalEmailsSent) * 100);
        }
      }

      const [campaignStats] = await db.select({ active: count() })
        .from(sequences)
        .where(and(
          inArray(sequences.userId, memberIds),
          eq(sequences.status, 'active')
        ));
      activeCampaigns = campaignStats?.active || 0;
    }

    res.json({
      totalUsers: userCounts?.totalUsers || 0,
      activeUsers: userCounts?.activeUsers || 0,
      totalEmailsSent,
      totalMeetingsBooked,
      replyRate,
      openRate: 0,
      activeCampaigns,
    });
  } catch (error) {
    console.error("Error fetching team stats:", error);
    res.status(500).json({ error: "Failed to fetch team statistics" });
  }
});

router.post("/api/manager/users", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { email, firstName, lastName, role = "user" } = req.body;
    const currentUser = (req as any).user;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const [existingUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const [newUser] = await db.insert(users).values({
      email: email.toLowerCase(),
      firstName: firstName || null,
      lastName: lastName || null,
      role: role === 'admin' ? 'admin' : 'user',
      status: 'pending',
      isActive: true,
      passwordHash,
      passwordLoginEnabled: true,
      forcePasswordReset: true,
      organizationId: userContext.organizationId,
      createdBy: currentUser.id,
    }).returning();

    const inviteToken = crypto.randomBytes(32).toString('hex');
    await db.insert(userInvitations).values({
      email: email.toLowerCase(),
      role: role === 'admin' ? 'admin' : 'user',
      invitedBy: currentUser.id,
      token: inviteToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      organizationId: userContext.organizationId,
    });

    auditService.logFromRequest(req, 'USER_CREATED_BY_MANAGER', 'manager', {
      newUserId: newUser.id,
      email: email.toLowerCase(),
      role,
    });

    const { passwordHash: _, ...safeUser } = newUser;
    res.status(201).json({
      ...safeUser,
      message: "User created. An invitation email has been sent.",
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/api/manager/users/:userId", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const { firstName, lastName, role, status, isActive } = req.body;

    const existingUser = await verifyUserBelongsToOrg(userId, userContext.organizationId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const updateData: any = { updatedAt: new Date() };
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined && ['admin', 'user'].includes(role)) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const [updatedUser] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    auditService.logFromRequest(req, 'USER_UPDATED_BY_MANAGER', 'manager', {
      targetUserId: userId,
      changes: Object.keys(updateData).filter(k => k !== 'updatedAt'),
    });

    const { passwordHash: _, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/api/manager/users/:userId", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const currentUser = (req as any).user;

    if (userId === currentUser.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const existingUser = await verifyUserBelongsToOrg(userId, userContext.organizationId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    if (existingUser.status === 'inactive' || !existingUser.isActive) {
      return res.status(400).json({ error: "User is already inactive" });
    }

    if (existingUser.role === 'admin' && currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Cannot deactivate an admin user" });
    }

    await db.update(users)
      .set({ 
        deletedAt: new Date(),
        isActive: false,
        status: 'inactive',
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    auditService.logFromRequest(req, 'USER_DELETED_BY_MANAGER', 'manager', {
      targetUserId: userId,
      email: existingUser.email,
    });

    res.json({ message: "User has been deactivated" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.post("/api/manager/users/:userId/reset-password", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;

    const existingUser = await verifyUserBelongsToOrg(userId, userContext.organizationId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    if (!existingUser.isActive || existingUser.status === 'inactive') {
      return res.status(400).json({ error: "Cannot reset password for inactive user" });
    }

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await db.update(users)
      .set({
        passwordHash,
        forcePasswordReset: true,
        passwordLoginEnabled: true,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    auditService.logFromRequest(req, 'PASSWORD_RESET_BY_MANAGER', 'manager', {
      targetUserId: userId,
    });

    res.json({ 
      message: "Password has been reset. User will need to change it on next login.",
      tempPassword
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.get("/api/manager/campaigns", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { status, userId, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    const baseConditions: any[] = [
      eq(users.organizationId, userContext.organizationId),
      isNull(users.deletedAt)
    ];
    
    const statusConditions: any[] = [];
    if (status && status !== 'all') {
      statusConditions.push(eq(sequences.status, status as string));
    }
    if (userId) {
      statusConditions.push(eq(sequences.userId, userId as string));
    }

    const campaignList = await db.select({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
      userId: sequences.userId,
      totalProspects: sequences.totalProspects,
      activeProspects: sequences.activeProspects,
      completedProspects: sequences.completedProspects,
      createdAt: sequences.createdAt,
      updatedAt: sequences.updatedAt,
      ownerEmail: users.email,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
    })
    .from(sequences)
    .innerJoin(users, eq(sequences.userId, users.id))
    .where(and(...baseConditions, ...statusConditions))
    .orderBy(sql`${sequences.createdAt} desc`)
    .limit(limitNum)
    .offset(offset);

    const [{ total }] = await db.select({ total: count() })
      .from(sequences)
      .innerJoin(users, eq(sequences.userId, users.id))
      .where(and(...baseConditions, ...statusConditions));

    const campaignsWithStats = await Promise.all(campaignList.map(async (campaign) => {
      const [stats] = await db.select({ sentCount: count() })
        .from(emailQueue)
        .where(and(
          eq(emailQueue.sequenceId, campaign.id),
          eq(emailQueue.status, 'sent')
        ));

      const [replyCount] = await db.select({ replies: count() })
        .from(emailReplies)
        .where(eq(emailReplies.sequenceId, campaign.id));

      const sent = stats?.sentCount || 0;
      const replies = replyCount?.replies || 0;

      return {
        ...campaign,
        ownerName: `${campaign.ownerFirstName || ''} ${campaign.ownerLastName || ''}`.trim() || campaign.ownerEmail,
        stats: {
          totalProspects: campaign.totalProspects || 0,
          sent,
          replies,
          replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
        }
      };
    }));

    res.json({
      campaigns: campaignsWithStats,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

// PRD REQUIREMENT: Managers cannot approve/activate campaigns (read-only oversight)
router.post("/api/manager/campaigns/:campaignId/approve", authenticate, requireManager, async (req, res) => {
  console.warn(`🚫 RBAC: Manager ${req.user?.email} attempted to approve campaign ${req.params.campaignId} - DENIED`);
  return res.status(403).json({ 
    error: "FORBIDDEN",
    message: "Managers cannot approve campaigns. This is a read-only oversight feature." 
  });
});

// PRD REQUIREMENT: Managers cannot pause campaigns (read-only oversight)
router.post("/api/manager/campaigns/:campaignId/pause", authenticate, requireManager, async (req, res) => {
  console.warn(`🚫 RBAC: Manager ${req.user?.email} attempted to pause campaign ${req.params.campaignId} - DENIED`);
  return res.status(403).json({ 
    error: "FORBIDDEN",
    message: "Managers cannot pause campaigns. This is a read-only oversight feature." 
  });
});

router.get("/api/manager/analytics", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { period = "30d" } = req.query;
    
    let daysBack = 30;
    if (period === "7d") daysBack = 7;
    else if (period === "90d") daysBack = 90;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const memberIds = await getTeamMemberIds(userContext.organizationId);

    if (memberIds.length === 0) {
      return res.json({
        period,
        emailStats: { sent: 0, replied: 0, positiveReplies: 0, replyRate: 0 },
        campaignStats: { active: 0, paused: 0, completed: 0, draft: 0 },
        topPerformers: [],
      });
    }

    const [emailStats] = await db.select({ sent: count() })
      .from(emailQueue)
      .where(and(
        inArray(emailQueue.userId, memberIds),
        eq(emailQueue.status, 'sent'),
        gte(emailQueue.sentAt, startDate)
      ));

    const teamSequenceIds = await db.select({ id: sequences.id })
      .from(sequences)
      .where(inArray(sequences.userId, memberIds));
    
    const seqIds = teamSequenceIds.map(s => s.id);

    let replyTotal = 0;
    let positiveReplies = 0;
    if (seqIds.length > 0) {
      const [replyStats] = await db.select({
        total: count(),
        positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
      })
      .from(emailReplies)
      .where(and(
        inArray(emailReplies.sequenceId, seqIds),
        gte(emailReplies.receivedAt, startDate)
      ));
      replyTotal = replyStats?.total || 0;
      positiveReplies = replyStats?.positive || 0;
    }

    const campaignStatusCounts = await db.select({
      status: sequences.status,
      count: count(),
    })
    .from(sequences)
    .where(inArray(sequences.userId, memberIds))
    .groupBy(sequences.status);

    const campaignStats: Record<string, number> = { active: 0, paused: 0, completed: 0, draft: 0 };
    campaignStatusCounts.forEach(s => {
      if (s.status && s.status in campaignStats) {
        campaignStats[s.status] = s.count;
      }
    });

    const topPerformers = await db.select({
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      emailsSent: sql<number>`count(${emailQueue.id}) filter (where ${emailQueue.status} = 'sent')`,
    })
    .from(users)
    .leftJoin(emailQueue, and(
      eq(users.id, emailQueue.userId),
      gte(emailQueue.sentAt, startDate)
    ))
    .where(and(
      eq(users.organizationId, userContext.organizationId),
      isNull(users.deletedAt)
    ))
    .groupBy(users.id, users.email, users.firstName, users.lastName)
    .orderBy(sql`count(${emailQueue.id}) filter (where ${emailQueue.status} = 'sent') desc`)
    .limit(5);

    const sent = emailStats?.sent || 0;

    res.json({
      period,
      emailStats: {
        sent,
        replied: replyTotal,
        positiveReplies,
        replyRate: sent > 0 ? Math.round((replyTotal / sent) * 100) : 0,
      },
      campaignStats,
      topPerformers: topPerformers.map(p => ({
        id: p.userId,
        email: p.email,
        name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
        emailsSent: p.emailsSent || 0,
      })),
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get("/api/manager/resources", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const memberIds = await getTeamMemberIds(userContext.organizationId);

    const mailboxAllocation = memberIds.length > 0 ? await db.select({
      userId: emailMailboxes.userId,
      mailboxCount: count(),
      activeCount: sql<number>`count(*) filter (where ${emailMailboxes.status} = 'active')`,
    })
    .from(emailMailboxes)
    .where(inArray(emailMailboxes.userId, memberIds))
    .groupBy(emailMailboxes.userId) : [];

    const prospectAllocation = memberIds.length > 0 ? await db.select({
      userId: prospects.userId,
      prospectCount: count(),
    })
    .from(prospects)
    .where(inArray(prospects.userId, memberIds))
    .groupBy(prospects.userId) : [];

    const teamWithResources = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(and(
      eq(users.organizationId, userContext.organizationId),
      isNull(users.deletedAt)
    ));

    const enrichedTeam = teamWithResources.map(member => {
      const mailbox = mailboxAllocation.find(m => m.userId === member.id);
      const prospect = prospectAllocation.find(p => p.userId === member.id);

      return {
        ...member,
        mailboxes: mailbox?.mailboxCount || 0,
        activeMailboxes: mailbox?.activeCount || 0,
        prospects: prospect?.prospectCount || 0,
      };
    });

    res.json({
      teamResources: enrichedTeam,
      totals: {
        totalMailboxes: mailboxAllocation.reduce((sum, m) => sum + (m.mailboxCount || 0), 0),
        totalActiveMailboxes: mailboxAllocation.reduce((sum, m) => sum + (m.activeCount || 0), 0),
        totalProspects: prospectAllocation.reduce((sum, p) => sum + (p.prospectCount || 0), 0),
      }
    });
  } catch (error) {
    console.error("Error fetching resources:", error);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

router.get("/api/manager/users/:userId/performance", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const { period = "30d" } = req.query;

    const targetUser = await verifyUserBelongsToOrg(userId, userContext.organizationId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    let daysBack = 30;
    if (period === "7d") daysBack = 7;
    else if (period === "90d") daysBack = 90;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const [emailStats] = await db.select({ sent: count() })
      .from(emailQueue)
      .where(and(
        eq(emailQueue.userId, userId),
        eq(emailQueue.status, 'sent'),
        gte(emailQueue.sentAt, startDate)
      ));

    const userSequenceIds = await db.select({ id: sequences.id })
      .from(sequences)
      .where(eq(sequences.userId, userId));
    
    const seqIds = userSequenceIds.map(s => s.id);

    let replyTotal = 0;
    let positiveReplies = 0;
    if (seqIds.length > 0) {
      const [replyStats] = await db.select({
        total: count(),
        positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
      })
      .from(emailReplies)
      .where(and(
        inArray(emailReplies.sequenceId, seqIds),
        gte(emailReplies.receivedAt, startDate)
      ));
      replyTotal = replyStats?.total || 0;
      positiveReplies = replyStats?.positive || 0;
    }

    const [campaignStats] = await db.select({
      total: count(),
      active: sql<number>`count(*) filter (where ${sequences.status} = 'active')`,
    })
    .from(sequences)
    .where(eq(sequences.userId, userId));

    const userCampaigns = await db.select({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
      totalProspects: sequences.totalProspects,
      createdAt: sequences.createdAt,
    })
    .from(sequences)
    .where(eq(sequences.userId, userId))
    .orderBy(sql`${sequences.createdAt} desc`)
    .limit(10);

    const [mailboxStats] = await db.select({
      total: count(),
      active: sql<number>`count(*) filter (where ${emailMailboxes.status} = 'active')`,
    })
    .from(emailMailboxes)
    .where(eq(emailMailboxes.userId, userId));

    const [prospectStats] = await db.select({ total: count() })
      .from(prospects)
      .where(eq(prospects.userId, userId));

    const sent = emailStats?.sent || 0;

    res.json({
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim(),
        role: targetUser.role,
        status: targetUser.status,
        lastLogin: targetUser.lastLogin,
        createdAt: targetUser.createdAt,
      },
      period,
      performance: {
        emailsSent: sent,
        replies: replyTotal,
        positiveReplies,
        replyRate: sent > 0 ? Math.round((replyTotal / sent) * 100) : 0,
        totalCampaigns: campaignStats?.total || 0,
        activeCampaigns: campaignStats?.active || 0,
      },
      resources: {
        totalMailboxes: mailboxStats?.total || 0,
        activeMailboxes: mailboxStats?.active || 0,
        totalProspects: prospectStats?.total || 0,
      },
      recentCampaigns: userCampaigns,
    });
  } catch (error) {
    console.error("Error fetching user performance:", error);
    res.status(500).json({ error: "Failed to fetch user performance" });
  }
});

router.get("/api/manager/users/:userId/campaigns", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;

    const targetUser = await verifyUserBelongsToOrg(userId, userContext.organizationId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const userCampaigns = await db.select({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
      totalProspects: sequences.totalProspects,
      activeProspects: sequences.activeProspects,
      completedProspects: sequences.completedProspects,
      createdAt: sequences.createdAt,
      updatedAt: sequences.updatedAt,
    })
    .from(sequences)
    .where(eq(sequences.userId, userId))
    .orderBy(sql`${sequences.createdAt} desc`);

    const campaignsWithStats = await Promise.all(userCampaigns.map(async (campaign) => {
      const [stats] = await db.select({ sentCount: count() })
        .from(emailQueue)
        .where(and(
          eq(emailQueue.sequenceId, campaign.id),
          eq(emailQueue.status, 'sent')
        ));

      const [replyCount] = await db.select({ replies: count() })
        .from(emailReplies)
        .where(eq(emailReplies.sequenceId, campaign.id));

      const sent = stats?.sentCount || 0;
      const replies = replyCount?.replies || 0;

      return {
        ...campaign,
        stats: {
          sent,
          replies,
          replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
        }
      };
    }));

    res.json({ campaigns: campaignsWithStats, total: campaignsWithStats.length });
  } catch (error) {
    console.error("Error fetching user campaigns:", error);
    res.status(500).json({ error: "Failed to fetch user campaigns" });
  }
});

// PRD REQUIREMENT: Managers cannot reassign campaigns (read-only oversight)
router.post("/api/manager/campaigns/:campaignId/reassign", authenticate, requireManager, async (req, res) => {
  console.warn(`🚫 RBAC: Manager ${req.user?.email} attempted to reassign campaign ${req.params.campaignId} - DENIED`);
  return res.status(403).json({ 
    error: "FORBIDDEN",
    message: "Managers cannot reassign campaigns. This is a read-only oversight feature." 
  });
});

router.get("/api/manager/team/leaderboard", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { period = "30d", sortBy = "emails" } = req.query;
    
    let daysBack = 30;
    if (period === "7d") daysBack = 7;
    else if (period === "90d") daysBack = 90;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const memberIds = await getTeamMemberIds(userContext.organizationId);

    if (memberIds.length === 0) {
      return res.json({ leaderboard: [], period });
    }

    const teamStats = await Promise.all(memberIds.map(async (memberId) => {
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, memberId))
      .limit(1);

      const [emailStats] = await db.select({ sent: count() })
        .from(emailQueue)
        .where(and(
          eq(emailQueue.userId, memberId),
          eq(emailQueue.status, 'sent'),
          gte(emailQueue.sentAt, startDate)
        ));

      const userSequenceIds = await db.select({ id: sequences.id })
        .from(sequences)
        .where(eq(sequences.userId, memberId));
      
      const seqIds = userSequenceIds.map(s => s.id);
      let replies = 0;
      let positiveReplies = 0;
      
      if (seqIds.length > 0) {
        const [replyStats] = await db.select({
          total: count(),
          positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
        })
        .from(emailReplies)
        .where(and(
          inArray(emailReplies.sequenceId, seqIds),
          gte(emailReplies.receivedAt, startDate)
        ));
        replies = replyStats?.total || 0;
        positiveReplies = replyStats?.positive || 0;
      }

      const sent = emailStats?.sent || 0;

      return {
        id: user?.id || memberId,
        email: user?.email || 'Unknown',
        name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Unknown',
        emailsSent: sent,
        replies,
        positiveReplies,
        replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
      };
    }));

    const sortField = sortBy === 'replies' ? 'replies' : sortBy === 'positiveReplies' ? 'positiveReplies' : 'emailsSent';
    const sortedStats = teamStats.sort((a, b) => (b as any)[sortField] - (a as any)[sortField]);

    res.json({
      leaderboard: sortedStats.map((s, i) => ({ ...s, rank: i + 1 })),
      period,
      sortBy: sortField,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
