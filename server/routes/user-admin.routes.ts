import { Router } from "express";
import { db } from "../db";
import { 
  users, 
  userProfiles, 
  userLicenses, 
  userActivityLogs,
  userInvitations,
  passwordResetTokens
} from "@shared/schema";
import { eq, and, or, like, desc, asc, count, sql, isNull } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";
import { auditService } from "../services/audit.service";
import { checkQuota } from "../middleware/quota-enforcement.middleware";
import bcrypt from "bcrypt";
import crypto from "crypto";

const router = Router();

router.get("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { 
      search, 
      role, 
      status, 
      page = "1", 
      limit = "20",
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [
      isNull(users.deletedAt),
      eq(users.organizationId, userContext.organizationId)
    ];
    
    if (search) {
      conditions.push(
        or(
          like(users.email, `%${search}%`),
          like(users.firstName, `%${search}%`),
          like(users.lastName, `%${search}%`)
        )!
      );
    }
    
    if (role) {
      conditions.push(eq(users.role, role as any));
    }
    
    if (status) {
      conditions.push(eq(users.status, status as any));
    }

    const allUsers = await db.select({
      user: users,
      profile: userProfiles,
      license: userLicenses,
    })
    .from(users)
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .leftJoin(userLicenses, eq(users.id, userLicenses.userId))
    .where(and(...conditions))
    .orderBy(sortOrder === 'desc' ? desc(users.createdAt) : asc(users.createdAt))
    .limit(limitNum)
    .offset(offset);

    const [{ total }] = await db.select({ total: count() })
      .from(users)
      .where(and(...conditions));

    res.json({
      users: allUsers.map(({ user, profile, license }) => ({
        ...user,
        passwordHash: undefined,
        profile,
        license,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/api/admin/users/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;

    const [result] = await db.select({
      user: users,
      profile: userProfiles,
      license: userLicenses,
    })
    .from(users)
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .leftJoin(userLicenses, eq(users.id, userLicenses.userId))
    .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
    .limit(1);

    if (!result) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      ...result.user,
      passwordHash: undefined,
      profile: result.profile,
      license: result.license,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.patch("/api/admin/users/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const { 
      firstName, 
      lastName, 
      role, 
      status, 
      isActive,
      passwordLoginEnabled,
      forcePasswordReset,
      defaultWorkspaceId
    } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (passwordLoginEnabled !== undefined) updateData.passwordLoginEnabled = passwordLoginEnabled;
    if (forcePasswordReset !== undefined) updateData.forcePasswordReset = forcePasswordReset;
    if (defaultWorkspaceId !== undefined) updateData.defaultWorkspaceId = defaultWorkspaceId;

    const [updatedUser] = await db.update(users)
      .set(updateData)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .returning();

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    auditService.logFromRequest(req, 'USER_UPDATED', 'user_admin', {
      targetUserId: userId,
      changes: Object.keys(updateData).filter(k => k !== 'updatedAt'),
    });

    res.json({ ...updatedUser, passwordHash: undefined });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.post("/api/admin/users/:userId/toggle-status", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    
    const [user] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!user) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const newStatus = user.isActive ? false : true;
    const [updatedUser] = await db.update(users)
      .set({ 
        isActive: newStatus, 
        status: newStatus ? 'active' : 'inactive',
        updatedAt: new Date() 
      })
      .where(eq(users.id, userId))
      .returning();

    auditService.logFromRequest(req, newStatus ? 'USER_ENABLED' : 'USER_DISABLED', 'user_admin', {
      targetUserId: userId,
    });

    res.json({ ...updatedUser, passwordHash: undefined });
  } catch (error) {
    console.error("Error toggling user status:", error);
    res.status(500).json({ error: "Failed to toggle user status" });
  }
});

router.post("/api/admin/users/:userId/reset-password", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const { newPassword, forceChange = true } = req.body;

    const [user] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .limit(1);
    if (!user) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    await db.update(users)
      .set({ 
        passwordHash,
        forcePasswordReset: forceChange,
        passwordLoginEnabled: true,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    auditService.logFromRequest(req, 'PASSWORD_RESET_BY_ADMIN', 'user_admin', {
      targetUserId: userId,
      forceChange,
    });

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.post("/api/admin/users/:userId/force-password-change", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const { force = true } = req.body;

    const [updatedUser] = await db.update(users)
      .set({ 
        forcePasswordReset: force,
        updatedAt: new Date() 
      })
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .returning();

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    auditService.logFromRequest(req, force ? 'FORCE_PASSWORD_CHANGE_SET' : 'FORCE_PASSWORD_CHANGE_CLEARED', 'user_admin', {
      targetUserId: userId,
    });

    res.json({ success: true, forcePasswordReset: force });
  } catch (error) {
    console.error("Error setting force password change:", error);
    res.status(500).json({ error: "Failed to set force password change" });
  }
});

router.delete("/api/admin/users/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { userId } = req.params;
    const adminUser = (req as any).user;

    if (adminUser.id === userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const [deletedUser] = await db.update(users)
      .set({ 
        deletedAt: new Date(),
        isActive: false,
        status: 'inactive',
        updatedAt: new Date()
      })
      .where(and(eq(users.id, userId), eq(users.organizationId, userContext.organizationId)))
      .returning();

    if (!deletedUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    auditService.logFromRequest(req, 'USER_DELETED', 'user_admin', {
      targetUserId: userId,
      targetEmail: deletedUser.email,
    });

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.post("/api/admin/users/bulk-invite", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { emails, role = 'user', workspaceId } = req.body;
    const adminUser = (req as any).user;
    const organizationId = userContext.organizationId;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: "No emails provided" });
    }

    if (emails.length > 100) {
      return res.status(400).json({ error: "Maximum 100 invitations at a time" });
    }

    const quotaCheck = await checkQuota(organizationId, 'users', emails.length);
    if (!quotaCheck.allowed) {
      return res.status(429).json({
        error: quotaCheck.message,
        code: 'QUOTA_EXCEEDED',
        details: {
          resource: 'users',
          current: quotaCheck.current,
          limit: quotaCheck.limit,
          requested: emails.length,
        }
      });
    }

    const results = {
      invited: [] as string[],
      alreadyExists: [] as string[],
      alreadyInvited: [] as string[],
      failed: [] as string[],
    };

    for (const email of emails) {
      try {
        const normalizedEmail = email.toLowerCase().trim();
        
        const [existingUser] = await db.select()
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1);
        
        if (existingUser) {
          results.alreadyExists.push(normalizedEmail);
          continue;
        }

        const [existingInvite] = await db.select()
          .from(userInvitations)
          .where(and(
            eq(userInvitations.email, normalizedEmail),
            eq(userInvitations.status, 'pending')
          ))
          .limit(1);
        
        if (existingInvite) {
          results.alreadyInvited.push(normalizedEmail);
          continue;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await db.insert(userInvitations).values({
          email: normalizedEmail,
          token,
          role: role as any,
          invitedBy: adminUser.id,
          organizationId,
          workspaceId,
          status: 'pending',
          expiresAt,
        });

        results.invited.push(normalizedEmail);
      } catch (err) {
        results.failed.push(email);
      }
    }

    auditService.logFromRequest(req, 'BULK_INVITE_SENT', 'user_admin', {
      totalEmails: emails.length,
      invited: results.invited.length,
      alreadyExists: results.alreadyExists.length,
      alreadyInvited: results.alreadyInvited.length,
      failed: results.failed.length,
    });

    res.json(results);
  } catch (error) {
    console.error("Error bulk inviting users:", error);
    res.status(500).json({ error: "Failed to bulk invite users" });
  }
});

router.get("/api/admin/users/:userId/activity", authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = "1", 
      limit = "50",
      action,
      startDate,
      endDate
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(userActivityLogs.userId, userId)];
    
    if (action) {
      conditions.push(like(userActivityLogs.action, `%${action}%`));
    }
    
    if (startDate) {
      conditions.push(sql`${userActivityLogs.createdAt} >= ${new Date(startDate as string)}`);
    }
    
    if (endDate) {
      conditions.push(sql`${userActivityLogs.createdAt} <= ${new Date(endDate as string)}`);
    }

    const logs = await db.select()
      .from(userActivityLogs)
      .where(and(...conditions))
      .orderBy(desc(userActivityLogs.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [{ total }] = await db.select({ total: count() })
      .from(userActivityLogs)
      .where(and(...conditions));

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching user activity:", error);
    res.status(500).json({ error: "Failed to fetch user activity" });
  }
});

router.get("/api/admin/users/:userId/profile", authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const [profile] = await db.select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    res.json(profile || null);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

router.put("/api/admin/users/:userId/profile", authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const profileData = req.body;

    const [existing] = await db.select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    let profile;
    if (existing) {
      [profile] = await db.update(userProfiles)
        .set({ ...profileData, updatedAt: new Date() })
        .where(eq(userProfiles.userId, userId))
        .returning();
    } else {
      [profile] = await db.insert(userProfiles)
        .values({ userId, ...profileData })
        .returning();
    }

    auditService.logFromRequest(req, 'USER_PROFILE_UPDATED', 'user_admin', {
      targetUserId: userId,
    });

    res.json(profile);
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ error: "Failed to update user profile" });
  }
});

router.get("/api/admin/users/:userId/license", authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const [license] = await db.select()
      .from(userLicenses)
      .where(eq(userLicenses.userId, userId))
      .limit(1);

    res.json(license || null);
  } catch (error) {
    console.error("Error fetching user license:", error);
    res.status(500).json({ error: "Failed to fetch user license" });
  }
});

router.put("/api/admin/users/:userId/license", authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { tier, features, expiresAt, organizationId } = req.body;
    const adminUser = (req as any).user;

    const [existing] = await db.select()
      .from(userLicenses)
      .where(eq(userLicenses.userId, userId))
      .limit(1);

    let license;
    if (existing) {
      [license] = await db.update(userLicenses)
        .set({ 
          tier, 
          features, 
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          allocatedBy: adminUser.id,
        })
        .where(eq(userLicenses.userId, userId))
        .returning();
    } else {
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required for new license" });
      }
      [license] = await db.insert(userLicenses)
        .values({ 
          userId, 
          organizationId,
          tier, 
          features, 
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          allocatedBy: adminUser.id,
        })
        .returning();
    }

    auditService.logFromRequest(req, 'USER_LICENSE_UPDATED', 'user_admin', {
      targetUserId: userId,
      tier,
    });

    res.json(license);
  } catch (error) {
    console.error("Error updating user license:", error);
    res.status(500).json({ error: "Failed to update user license" });
  }
});

router.get("/api/admin/stats", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [{ totalUsers }] = await db.select({ totalUsers: count() })
      .from(users)
      .where(and(isNull(users.deletedAt), eq(users.organizationId, userContext.organizationId)));

    const [{ activeUsers }] = await db.select({ activeUsers: count() })
      .from(users)
      .where(and(
        isNull(users.deletedAt),
        eq(users.organizationId, userContext.organizationId),
        eq(users.isActive, true)
      ));

    const [{ adminCount }] = await db.select({ adminCount: count() })
      .from(users)
      .where(and(
        isNull(users.deletedAt),
        eq(users.organizationId, userContext.organizationId),
        eq(users.role, 'admin')
      ));

    const [{ pendingInvites }] = await db.select({ pendingInvites: count() })
      .from(userInvitations)
      .where(and(
        eq(userInvitations.organizationId, userContext.organizationId),
        eq(userInvitations.status, 'pending')
      ));

    res.json({
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      adminCount,
      pendingInvites,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

router.get("/api/admin/users/activity-logs", authenticate, requireAdmin, async (req, res) => {
  try {
    const userContext = req.userContext;
    if (!userContext?.organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const logs = await db.select({
      log: userActivityLogs,
      user: {
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      }
    })
    .from(userActivityLogs)
    .innerJoin(users, eq(userActivityLogs.userId, users.id))
    .where(eq(users.organizationId, userContext.organizationId))
    .orderBy(desc(userActivityLogs.createdAt))
    .limit(limitNum)
    .offset(offset);

    const [{ total }] = await db.select({ total: count() })
      .from(userActivityLogs)
      .innerJoin(users, eq(userActivityLogs.userId, users.id))
      .where(eq(users.organizationId, userContext.organizationId));

    res.json({
      logs: logs.map(({ log, user }) => ({ ...log, user })),
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    res.status(500).json({ error: "Failed to fetch activity logs" });
  }
});

export default router;
