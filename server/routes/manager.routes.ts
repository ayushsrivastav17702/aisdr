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
import { cacheService } from "../services/cache.service";
import { invitationService } from "../services/invitation.service";
import { sdrWorkflowService } from "../services/sdr-workflow.service";
import bcrypt from "bcrypt";
import crypto from "crypto";

const router = Router();

async function getManagerCreatedUserIds(managerId: string, organizationId: string): Promise<string[]> {
  const managedUsers = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.organizationId, organizationId),
      eq(users.createdBy, managerId),
      isNull(users.deletedAt)
    ));
  return managedUsers.map(m => m.id);
}

async function verifyUserCreatedByManager(userId: string, managerId: string, organizationId: string): Promise<typeof users.$inferSelect | null> {
  const [user] = await db.select().from(users)
    .where(and(
      eq(users.id, userId),
      eq(users.organizationId, organizationId),
      eq(users.createdBy, managerId),
      isNull(users.deletedAt)
    ))
    .limit(1);
  return user || null;
}

async function verifyCampaignBelongsToManager(campaignId: string, managerId: string, organizationId: string): Promise<typeof sequences.$inferSelect | null> {
  const result = await db.select({
    sequence: sequences,
    user: users,
  })
  .from(sequences)
  .innerJoin(users, eq(sequences.userId, users.id))
  .where(and(
    eq(sequences.id, campaignId),
    eq(users.organizationId, organizationId),
    eq(users.createdBy, managerId),
    isNull(users.deletedAt)
  ))
  .limit(1);
  
  return result[0]?.sequence || null;
}

router.get("/api/manager/team", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { page = "1", limit = "50", search, status: statusFilter, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit as string, 10) || 50), 100);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [
      eq(users.organizationId, userContext.organizationId),
      eq(users.createdBy, currentUser.id),
      isNull(users.deletedAt)
    ];
    
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      conditions.push(sql`(lower(${users.email}) like ${searchTerm} OR lower(${users.firstName}) like ${searchTerm} OR lower(${users.lastName}) like ${searchTerm})`);
    }
    
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'active') {
        conditions.push(eq(users.isActive, true));
      } else if (statusFilter === 'inactive') {
        conditions.push(eq(users.isActive, false));
      }
    }

    const getOrderColumn = () => {
      switch (sortBy) {
        case 'lastLogin': return users.lastLogin;
        case 'email': return users.email;
        default: return users.createdAt;
      }
    };
    const orderColumn = getOrderColumn();

    const [teamMembers, totalResult] = await Promise.all([
      db.select({
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
      .where(and(...conditions))
      .orderBy(sortOrder === 'asc' ? sql`${orderColumn} asc nulls last` : sql`${orderColumn} desc nulls last`)
      .limit(limitNum)
      .offset(offset),
      
      db.select({ total: count() })
        .from(users)
        .where(and(...conditions))
        .then(r => r[0]?.total || 0)
    ]);

    res.json({
      members: teamMembers,
      total: totalResult,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalResult / limitNum),
    });
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ error: "Failed to fetch team members" });
  }
});

router.get("/api/manager/stats", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const managerId = currentUser.id;
    const cacheKey = cacheService.buildKey(userContext.organizationId, 'manager-stats', { managerId });
    
    const orgId = userContext.organizationId;
    const stats = await cacheService.getOrSet(cacheKey, async () => {
      const [memberIds, userCounts] = await Promise.all([
        getManagerCreatedUserIds(managerId, orgId),
        db.select({
          totalUsers: count(),
          activeUsers: sql<number>`count(*) filter (where ${users.isActive} = true)`,
        })
        .from(users)
        .where(and(
          eq(users.organizationId, orgId),
          eq(users.createdBy, managerId),
          isNull(users.deletedAt)
        ))
        .then(r => r[0])
      ]);

      let totalEmailsSent = 0;
      let totalMeetingsBooked = 0;
      let replyRate = 0;
      let activeCampaigns = 0;
      
      if (memberIds.length > 0) {
        const [emailStatsResult, campaignStatsResult, replyStatsResult] = await Promise.all([
          db.select({ sent: count() })
            .from(emailQueue)
            .where(and(
              inArray(emailQueue.userId, memberIds),
              eq(emailQueue.status, 'sent')
            ))
            .then(r => r[0]),
          
          db.select({ active: count() })
            .from(sequences)
            .where(and(
              inArray(sequences.userId, memberIds),
              eq(sequences.status, 'active')
            ))
            .then(r => r[0]),
          
          db.select({
            total: count(),
            positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
          })
          .from(emailReplies)
          .innerJoin(sequences, eq(emailReplies.sequenceId, sequences.id))
          .where(inArray(sequences.userId, memberIds))
          .then(r => r[0])
        ]);

        totalEmailsSent = emailStatsResult?.sent || 0;
        activeCampaigns = campaignStatsResult?.active || 0;
        totalMeetingsBooked = replyStatsResult?.positive || 0;
        
        if (totalEmailsSent > 0) {
          replyRate = Math.round(((replyStatsResult?.total || 0) / totalEmailsSent) * 100);
        }
      }

      return {
        totalUsers: userCounts?.totalUsers || 0,
        activeUsers: userCounts?.activeUsers || 0,
        totalEmailsSent,
        totalMeetingsBooked,
        replyRate,
        openRate: 0,
        activeCampaigns,
      };
    }, { ttl: 30 });

    res.json(stats);
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

    // Only check for duplicate email within this manager's scope (per-manager email uniqueness)
    const [existingUserUnderManager] = await db.select()
      .from(users)
      .where(and(
        eq(users.email, email.toLowerCase()),
        eq(users.createdBy, currentUser.id)
      ))
      .limit(1);
    
    if (existingUserUnderManager) {
      return res.status(400).json({ error: "This user is already on your team" });
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

    // Auto-initialize SDR workflow for user role (prevents WORKFLOW_BLOCKED error)
    if (newUser.role === 'user' && userContext.organizationId) {
      try {
        await sdrWorkflowService.getOrCreateProgress(newUser.id, userContext.organizationId);
        console.log(`✅ Workflow initialized for new SDR user: ${newUser.email}`);
      } catch (workflowError) {
        console.error(`⚠️ Failed to initialize workflow for user ${newUser.email}:`, workflowError);
        // Continue - user creation succeeded, workflow can be initialized later
      }
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(inviteToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(userInvitations).values({
      email: email.toLowerCase(),
      role: role === 'admin' ? 'admin' : 'user',
      invitedBy: currentUser.id,
      token: hashedToken,
      expiresAt,
      organizationId: userContext.organizationId,
    });

    // Generate invite URL (always provide for manual sharing)
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000';
    const inviteUrl = `${baseUrl}/accept-invitation?token=${inviteToken}`;

    // Send invitation email
    const inviterName = currentUser.firstName && currentUser.lastName 
      ? `${currentUser.firstName} ${currentUser.lastName}` 
      : currentUser.email;
    
    const userRole = role === 'admin' ? 'admin' : 'user';
    let emailSent = false;
    try {
      await invitationService.sendInvitationEmail({
        email: email.toLowerCase(),
        token: inviteToken,
        inviterName,
        expiresAt,
        role: userRole,
      });
      emailSent = true;
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
    }

    auditService.logFromRequest(req, 'USER_CREATED_BY_MANAGER', 'manager', {
      newUserId: newUser.id,
      email: email.toLowerCase(),
      role,
      emailSent,
    });

    await cacheService.invalidateOrg(userContext.organizationId);

    const { passwordHash: _, ...safeUser } = newUser;
    res.status(201).json({
      ...safeUser,
      inviteUrl,
      emailSent,
      message: emailSent 
        ? "User created. An invitation email has been sent." 
        : "User created. Email sending failed - please share the invite link manually.",
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    if (error?.code === '23505' || /duplicate key value violates unique constraint/i.test(error?.message || '')) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Resend invitation email for a pending user
router.post("/api/manager/users/:userId/resend-invite", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;

    // Verify user was created by this manager
    const user = await verifyUserCreatedByManager(userId, currentUser.id, userContext.organizationId);
    if (!user) {
      return res.status(404).json({ error: "User not found or you don't have permission to manage this user" });
    }

    if (user.status !== 'pending') {
      return res.status(400).json({ error: "User has already accepted the invitation" });
    }

    // Get or create invitation - scope to organization and manager
    const [existingInvite] = await db.select()
      .from(userInvitations)
      .where(and(
        eq(userInvitations.email, user.email),
        eq(userInvitations.invitedBy, currentUser.id),
        eq(userInvitations.organizationId, userContext.organizationId),
        isNull(userInvitations.acceptedAt)
      ))
      .limit(1);

    let inviteToken: string;
    let expiresAt: Date;
    const userRole = (user.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user';

    if (existingInvite) {
      // Update existing invitation with new token, expiry, and current role
      inviteToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(inviteToken, 10);
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.update(userInvitations)
        .set({ token: hashedToken, expiresAt, role: userRole })
        .where(eq(userInvitations.id, existingInvite.id));
    } else {
      // Create new invitation
      inviteToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(inviteToken, 10);
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(userInvitations).values({
        email: user.email,
        role: userRole,
        invitedBy: currentUser.id,
        token: hashedToken,
        expiresAt,
        organizationId: userContext.organizationId,
      });
    }

    // Generate invite URL (always provide for manual sharing)
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000';
    const inviteUrl = `${baseUrl}/accept-invitation?token=${inviteToken}`;

    // Send invitation email
    const inviterName = currentUser.firstName && currentUser.lastName 
      ? `${currentUser.firstName} ${currentUser.lastName}` 
      : currentUser.email;
    
    let emailSent = false;
    try {
      await invitationService.sendInvitationEmail({
        email: user.email,
        token: inviteToken,
        inviterName,
        expiresAt,
        role: userRole,
      });
      emailSent = true;
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
    }

    auditService.logFromRequest(req, 'INVITATION_RESENT', 'manager', {
      targetUserId: userId,
      email: user.email,
      emailSent,
    });

    res.json({
      success: true,
      inviteUrl,
      emailSent,
      message: emailSent 
        ? "Invitation email has been resent." 
        : "Email sending failed - please share the invite link manually.",
    });
  } catch (error) {
    console.error("Error resending invitation:", error);
    res.status(500).json({ error: "Failed to resend invitation" });
  }
});

router.patch("/api/manager/users/:userId", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const { firstName, lastName, role, status, isActive } = req.body;

    const existingUser = await verifyUserCreatedByManager(userId, currentUser.id, userContext.organizationId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found or you don't have permission to manage this user" });
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

    await cacheService.invalidateOrg(userContext.organizationId);

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
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;

    if (userId === currentUser.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const existingUser = await verifyUserCreatedByManager(userId, currentUser.id, userContext.organizationId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found or you don't have permission to manage this user" });
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
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;

    const existingUser = await verifyUserCreatedByManager(userId, currentUser.id, userContext.organizationId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found or you don't have permission to manage this user" });
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
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { status, userId, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    if (userId && typeof userId === 'string') {
      const userBelongsToManager = await verifyUserCreatedByManager(userId, currentUser.id, userContext.organizationId);
      if (!userBelongsToManager) {
        return res.status(403).json({ error: "You don't have permission to view campaigns for this user" });
      }
    }

    const baseConditions: any[] = [
      eq(users.organizationId, userContext.organizationId),
      eq(users.createdBy, currentUser.id),
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
      sequenceUserId: sequences.userId,
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

    const campaignIds = campaignList.map(c => c.id);
    
    let emailStatsMap: Record<string, number> = {};
    let replyStatsMap: Record<string, number> = {};
    
    if (campaignIds.length > 0) {
      const emailStats = await db.select({
        sequenceId: emailQueue.sequenceId,
        sentCount: count(),
      })
      .from(emailQueue)
      .where(and(
        inArray(emailQueue.sequenceId, campaignIds),
        eq(emailQueue.status, 'sent')
      ))
      .groupBy(emailQueue.sequenceId);
      
      emailStatsMap = Object.fromEntries(emailStats.map(s => [s.sequenceId, s.sentCount]));
      
      const replyStats = await db.select({
        sequenceId: emailReplies.sequenceId,
        replyCount: count(),
      })
      .from(emailReplies)
      .where(inArray(emailReplies.sequenceId, campaignIds))
      .groupBy(emailReplies.sequenceId);
      
      replyStatsMap = Object.fromEntries(replyStats.map(s => [s.sequenceId, s.replyCount]));
    }

    const campaignsWithStats = campaignList.map(campaign => {
      const sent = emailStatsMap[campaign.id] || 0;
      const replies = replyStatsMap[campaign.id] || 0;
      
      return {
        ...campaign,
        userId: campaign.sequenceUserId,
        ownerName: `${campaign.ownerFirstName || ''} ${campaign.ownerLastName || ''}`.trim() || campaign.ownerEmail,
        stats: {
          totalProspects: campaign.totalProspects || 0,
          sent,
          replies,
          replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
        }
      };
    });

    res.json({
      campaigns: campaignsWithStats,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
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
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { period = "30d" } = req.query;
    const managerId = currentUser.id;
    
    let daysBack = 30;
    if (period === "7d") daysBack = 7;
    else if (period === "90d") daysBack = 90;
    
    const orgId = userContext.organizationId;
    const cacheKey = cacheService.buildKey(orgId, 'manager-analytics', { period, managerId });
    
    const result = await cacheService.getOrSet(cacheKey, async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const memberIds = await getManagerCreatedUserIds(managerId, orgId);

      if (memberIds.length === 0) {
        return {
          period,
          emailStats: { sent: 0, replied: 0, positiveReplies: 0, replyRate: 0 },
          campaignStats: { active: 0, paused: 0, completed: 0, draft: 0 },
          topPerformers: [],
        };
      }

      const [emailStatsResult, campaignStatusCounts, topPerformersResult, replyStatsResult] = await Promise.all([
        db.select({ sent: count() })
          .from(emailQueue)
          .where(and(
            inArray(emailQueue.userId, memberIds),
            eq(emailQueue.status, 'sent'),
            gte(emailQueue.sentAt, startDate)
          ))
          .then(r => r[0]),
        
        db.select({
          status: sequences.status,
          count: count(),
        })
        .from(sequences)
        .where(inArray(sequences.userId, memberIds))
        .groupBy(sequences.status),
        
        db.select({
          odUserId: users.id,
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
          eq(users.organizationId, orgId),
          eq(users.createdBy, managerId),
          isNull(users.deletedAt)
        ))
        .groupBy(users.id, users.email, users.firstName, users.lastName)
        .orderBy(sql`count(${emailQueue.id}) filter (where ${emailQueue.status} = 'sent') desc`)
        .limit(5),
        
        db.select({
          total: count(),
          positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
        })
        .from(emailReplies)
        .innerJoin(sequences, eq(emailReplies.sequenceId, sequences.id))
        .where(and(
          inArray(sequences.userId, memberIds),
          gte(emailReplies.receivedAt, startDate)
        ))
        .then(r => r[0])
      ]);

      const campaignStats: Record<string, number> = { active: 0, paused: 0, completed: 0, draft: 0 };
      campaignStatusCounts.forEach(s => {
        if (s.status && s.status in campaignStats) {
          campaignStats[s.status] = s.count;
        }
      });

      const sent = emailStatsResult?.sent || 0;
      const replyTotal = replyStatsResult?.total || 0;
      const positiveReplies = replyStatsResult?.positive || 0;

      return {
        period,
        emailStats: {
          sent,
          replied: replyTotal,
          positiveReplies,
          replyRate: sent > 0 ? Math.round((replyTotal / sent) * 100) : 0,
        },
        campaignStats,
        topPerformers: topPerformersResult.map(p => ({
          id: p.odUserId,
          email: p.email,
          name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
          emailsSent: p.emailsSent || 0,
        })),
      };
    }, { ttl: 60 });

    res.json(result);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get("/api/manager/resources", authenticate, requireManager, async (req, res) => {
  try {
    const userContext = req.userContext;
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const managerId = currentUser.id;
    const memberIds = await getManagerCreatedUserIds(managerId, userContext.organizationId);

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
      eq(users.createdBy, managerId),
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
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const { period = "30d" } = req.query;

    const targetUser = await verifyUserCreatedByManager(userId, currentUser.id, userContext.organizationId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found or you don't have permission to view this user" });
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
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;

    const targetUser = await verifyUserCreatedByManager(userId, currentUser.id, userContext.organizationId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found or you don't have permission to view this user" });
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
    const currentUser = (req as any).user;
    if (!userContext?.organizationId || !currentUser?.id) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { period = "30d", sortBy = "emails" } = req.query;
    const managerId = currentUser.id;
    
    let daysBack = 30;
    if (period === "7d") daysBack = 7;
    else if (period === "90d") daysBack = 90;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const memberIds = await getManagerCreatedUserIds(managerId, userContext.organizationId);

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
