import { db } from '../db';
import {
  tenantControls,
  throttleWindows,
  managerQuotas,
  userControls,
  backgroundJobAudit,
  usageCounters,
  idempotencyKeys,
  organizations,
  users,
  userActivityLogs,
  emailQueue,
  type TenantControl,
  type ThrottleWindow,
  type ManagerQuota,
  type UserControl,
  type BackgroundJobAudit,
  type UsageCounter,
} from '@shared/schema';
import { eq, and, sql, gte, lte, desc, isNull, or } from 'drizzle-orm';

// Helper to log system-generated events for audit trail
async function logSystemEvent(
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
    console.error("Failed to log system event:", error);
  }
}

class HardeningService {
  // =============================================
  // TENANT CONTROLS (Kill Switch)
  // =============================================
  
  async getTenantControls(organizationId: string): Promise<TenantControl | null> {
    const [controls] = await db
      .select()
      .from(tenantControls)
      .where(eq(tenantControls.organizationId, organizationId))
      .limit(1);
    return controls || null;
  }
  
  async createOrUpdateTenantControls(
    organizationId: string,
    data: Partial<TenantControl>
  ): Promise<TenantControl> {
    const existing = await this.getTenantControls(organizationId);
    
    if (existing) {
      const [updated] = await db
        .update(tenantControls)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tenantControls.organizationId, organizationId))
        .returning();
      return updated;
    }
    
    const [created] = await db
      .insert(tenantControls)
      .values({ organizationId, ...data })
      .returning();
    return created;
  }
  
  async pauseTenantAutomation(
    organizationId: string,
    pausedBy: string,
    reason: string
  ): Promise<TenantControl> {
    return this.createOrUpdateTenantControls(organizationId, {
      automationStatus: 'paused',
      pausedReason: reason,
      pausedAt: new Date(),
      pausedBy,
    });
  }
  
  async resumeTenantAutomation(organizationId: string): Promise<TenantControl> {
    return this.createOrUpdateTenantControls(organizationId, {
      automationStatus: 'active',
      pausedReason: null,
      pausedAt: null,
      pausedBy: null,
    });
  }
  
  async updateTenantThrottleLimits(
    organizationId: string,
    limits: {
      emailsPerMinute?: number;
      aiCallsPerMinute?: number;
      enrollmentsPerHour?: number;
      prospectsPerHour?: number;
    }
  ): Promise<TenantControl> {
    return this.createOrUpdateTenantControls(organizationId, limits);
  }
  
  async isAutomationPaused(organizationId: string): Promise<boolean> {
    const controls = await this.getTenantControls(organizationId);
    return controls?.automationStatus === 'paused';
  }
  
  /**
   * Get organization ID for a user - used by background jobs that only have userId
   */
  async getOrganizationIdForUser(userId: string): Promise<string | null> {
    const [user] = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.organizationId || null;
  }
  
  /**
   * Check if automation is paused for a user (resolves userId -> orgId first)
   */
  async isAutomationPausedForUser(userId: string): Promise<boolean> {
    const orgId = await this.getOrganizationIdForUser(userId);
    if (!orgId) return false; // No org = no pause controls
    return this.isAutomationPaused(orgId);
  }

  // =============================================
  // THROTTLE WINDOWS (Rate Limiting)
  // =============================================
  
  async getOrCreateThrottleWindow(
    organizationId: string,
    counterType: string,
    windowDurationMinutes: number = 1,
    userId?: string
  ): Promise<ThrottleWindow> {
    const now = new Date();
    const windowStart = new Date(
      Math.floor(now.getTime() / (windowDurationMinutes * 60 * 1000)) * windowDurationMinutes * 60 * 1000
    );
    
    const conditions = [
      eq(throttleWindows.organizationId, organizationId),
      eq(throttleWindows.counterType, counterType),
      eq(throttleWindows.windowStart, windowStart),
    ];
    
    if (userId) {
      conditions.push(eq(throttleWindows.userId, userId));
    } else {
      conditions.push(isNull(throttleWindows.userId));
    }
    
    const [existing] = await db
      .select()
      .from(throttleWindows)
      .where(and(...conditions))
      .limit(1);
    
    if (existing) return existing;
    
    const [created] = await db
      .insert(throttleWindows)
      .values({
        organizationId,
        userId: userId || null,
        counterType,
        windowStart,
        windowDurationMinutes,
        currentCount: 0,
      })
      .returning();
    
    return created;
  }
  
  async incrementThrottleCounter(
    organizationId: string,
    counterType: string,
    userId?: string,
    incrementBy: number = 1
  ): Promise<{ currentCount: number; exceeded: boolean }> {
    const controls = await this.getTenantControls(organizationId);
    const limits = {
      emails: controls?.emailsPerMinute || 10,
      ai_calls: controls?.aiCallsPerMinute || 20,
      enrollments: controls?.enrollmentsPerHour || 100,
      prospects: controls?.prospectsPerHour || 500,
    };
    
    const windowDuration = ['enrollments', 'prospects'].includes(counterType) ? 60 : 1;
    const window = await this.getOrCreateThrottleWindow(organizationId, counterType, windowDuration, userId);
    
    const [updated] = await db
      .update(throttleWindows)
      .set({ currentCount: sql`${throttleWindows.currentCount} + ${incrementBy}` })
      .where(eq(throttleWindows.id, window.id))
      .returning();
    
    const limit = limits[counterType as keyof typeof limits] || 100;
    return {
      currentCount: updated.currentCount,
      exceeded: updated.currentCount > limit,
    };
  }
  
  async checkThrottleLimit(
    organizationId: string,
    counterType: string,
    userId?: string
  ): Promise<{ allowed: boolean; currentCount: number; limit: number }> {
    const controls = await this.getTenantControls(organizationId);
    const limits = {
      emails: controls?.emailsPerMinute || 10,
      ai_calls: controls?.aiCallsPerMinute || 20,
      enrollments: controls?.enrollmentsPerHour || 100,
      prospects: controls?.prospectsPerHour || 500,
    };
    
    const windowDuration = ['enrollments', 'prospects'].includes(counterType) ? 60 : 1;
    const window = await this.getOrCreateThrottleWindow(organizationId, counterType, windowDuration, userId);
    const limit = limits[counterType as keyof typeof limits] || 100;
    
    return {
      allowed: window.currentCount < limit,
      currentCount: window.currentCount,
      limit,
    };
  }

  // =============================================
  // MANAGER QUOTAS
  // =============================================
  
  async getManagerQuota(managerId: string): Promise<ManagerQuota | null> {
    const [quota] = await db
      .select()
      .from(managerQuotas)
      .where(eq(managerQuotas.managerId, managerId))
      .limit(1);
    return quota || null;
  }
  
  async createOrUpdateManagerQuota(
    managerId: string,
    organizationId: string,
    limits: Partial<ManagerQuota>
  ): Promise<ManagerQuota> {
    const existing = await this.getManagerQuota(managerId);
    
    if (existing) {
      const [updated] = await db
        .update(managerQuotas)
        .set({ ...limits, updatedAt: new Date() })
        .where(eq(managerQuotas.managerId, managerId))
        .returning();
      return updated;
    }
    
    const [created] = await db
      .insert(managerQuotas)
      .values({ managerId, organizationId, ...limits })
      .returning();
    return created;
  }
  
  async checkManagerQuota(
    managerId: string,
    resourceType: 'users' | 'prospects' | 'sequences' | 'activeSequences' | 'activeCampaigns'
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    const quota = await this.getManagerQuota(managerId);
    
    if (!quota) {
      return { allowed: true, current: 0, limit: Infinity };
    }
    
    const mapping = {
      users: { current: quota.currentUsers || 0, limit: quota.maxUsers || 10 },
      prospects: { current: quota.currentProspects || 0, limit: quota.maxProspects || 10000 },
      sequences: { current: quota.currentSequences || 0, limit: quota.maxSequences || 50 },
      activeSequences: { current: quota.currentActiveSequences || 0, limit: quota.maxActiveSequences || 10 },
      activeCampaigns: { current: quota.currentActiveCampaigns || 0, limit: quota.maxActiveCampaigns || 5 },
    };
    
    const { current, limit } = mapping[resourceType];
    return { allowed: current < limit, current, limit };
  }
  
  // =============================================
  // MANAGER KILL SWITCH
  // =============================================
  
  async pauseManager(
    managerId: string,
    pausedBy: string,
    reason: string
  ): Promise<ManagerQuota | null> {
    const existing = await this.getManagerQuota(managerId);
    
    if (!existing) {
      return null;
    }
    
    const [updated] = await db
      .update(managerQuotas)
      .set({
        isPaused: true,
        pausedAt: new Date(),
        pausedBy,
        pausedReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(managerQuotas.managerId, managerId))
      .returning();
    
    return updated;
  }
  
  async resumeManager(managerId: string): Promise<ManagerQuota | null> {
    const existing = await this.getManagerQuota(managerId);
    
    if (!existing) {
      return null;
    }
    
    const [updated] = await db
      .update(managerQuotas)
      .set({
        isPaused: false,
        pausedAt: null,
        pausedBy: null,
        pausedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(managerQuotas.managerId, managerId))
      .returning();
    
    return updated;
  }
  
  async isManagerPaused(managerId: string): Promise<boolean> {
    const quota = await this.getManagerQuota(managerId);
    return quota?.isPaused === true;
  }
  
  /**
   * Check if a user's manager is paused (for SDR actions)
   */
  async isUserManagerPaused(userId: string): Promise<{ paused: boolean; reason?: string }> {
    const [user] = await db
      .select({ createdBy: users.createdBy })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!user?.createdBy) {
      return { paused: false };
    }
    
    const quota = await this.getManagerQuota(user.createdBy);
    if (quota?.isPaused) {
      return { paused: true, reason: quota.pausedReason || undefined };
    }
    
    return { paused: false };
  }
  
  // =============================================
  // PRE-ENQUEUE VALIDATION
  // =============================================
  
  async validateProspectUpload(
    managerId: string,
    prospectCount: number
  ): Promise<{ allowed: boolean; reason?: string; maxAllowed?: number }> {
    const quota = await this.getManagerQuota(managerId);
    
    if (!quota) {
      return { allowed: true };
    }
    
    if (quota.isPaused) {
      return { 
        allowed: false, 
        reason: `Manager is paused: ${quota.pausedReason || 'No reason provided'}` 
      };
    }
    
    const maxPerUpload = quota.maxProspectsPerUpload || 1000;
    if (prospectCount > maxPerUpload) {
      return { 
        allowed: false, 
        reason: `Batch size ${prospectCount} exceeds maximum of ${maxPerUpload} prospects per upload`,
        maxAllowed: maxPerUpload,
      };
    }
    
    const currentProspects = quota.currentProspects || 0;
    const maxProspects = quota.maxProspects || 10000;
    const remainingQuota = maxProspects - currentProspects;
    
    if (prospectCount > remainingQuota) {
      return { 
        allowed: false, 
        reason: `Upload of ${prospectCount} prospects would exceed quota. Remaining: ${remainingQuota}`,
        maxAllowed: remainingQuota,
      };
    }
    
    return { allowed: true };
  }
  
  async validateCampaignCreation(
    managerId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const quota = await this.getManagerQuota(managerId);
    
    if (!quota) {
      return { allowed: true };
    }
    
    if (quota.isPaused) {
      return { 
        allowed: false, 
        reason: `Manager is paused: ${quota.pausedReason || 'No reason provided'}` 
      };
    }
    
    const current = quota.currentActiveCampaigns || 0;
    const max = quota.maxActiveCampaigns || 5;
    
    if (current >= max) {
      return { 
        allowed: false, 
        reason: `Active campaign limit reached (${current}/${max})` 
      };
    }
    
    return { allowed: true };
  }
  
  async validateSequenceCreation(
    managerId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const quota = await this.getManagerQuota(managerId);
    
    if (!quota) {
      return { allowed: true };
    }
    
    if (quota.isPaused) {
      return { 
        allowed: false, 
        reason: `Manager is paused: ${quota.pausedReason || 'No reason provided'}` 
      };
    }
    
    const current = quota.currentSequences || 0;
    const max = quota.maxSequences || 50;
    
    if (current >= max) {
      return { 
        allowed: false, 
        reason: `Sequence limit reached (${current}/${max})` 
      };
    }
    
    return { allowed: true };
  }
  
  async incrementManagerUsage(
    managerId: string,
    resourceType: 'users' | 'prospects' | 'sequences' | 'activeSequences' | 'activeCampaigns',
    incrementBy: number = 1
  ): Promise<void> {
    const columnMap = {
      users: managerQuotas.currentUsers,
      prospects: managerQuotas.currentProspects,
      sequences: managerQuotas.currentSequences,
      activeSequences: managerQuotas.currentActiveSequences,
      activeCampaigns: managerQuotas.currentActiveCampaigns,
    };
    
    await db
      .update(managerQuotas)
      .set({ 
        [columnMap[resourceType].name]: sql`COALESCE(${columnMap[resourceType]}, 0) + ${incrementBy}`,
        updatedAt: new Date(),
      })
      .where(eq(managerQuotas.managerId, managerId));
  }

  // =============================================
  // USER CONTROLS (SDR Level)
  // =============================================
  
  async getUserControls(userId: string): Promise<UserControl | null> {
    const today = new Date().toISOString().split('T')[0];
    
    const [controls] = await db
      .select()
      .from(userControls)
      .where(eq(userControls.userId, userId))
      .limit(1);
    
    if (!controls) return null;
    
    // Check if we need to reset daily counters
    if (controls.lastResetDate !== today) {
      const [updated] = await db
        .update(userControls)
        .set({
          emailsSentToday: 0,
          failedRetriesCount: 0,
          lastResetDate: today,
          updatedAt: new Date(),
        })
        .where(eq(userControls.userId, userId))
        .returning();
      return updated;
    }
    
    return controls;
  }
  
  async createOrUpdateUserControls(
    userId: string,
    organizationId: string,
    managerId: string | null,
    data: Partial<UserControl>
  ): Promise<UserControl> {
    const existing = await this.getUserControls(userId);
    
    if (existing) {
      const [updated] = await db
        .update(userControls)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userControls.userId, userId))
        .returning();
      return updated;
    }
    
    const [created] = await db
      .insert(userControls)
      .values({ 
        userId, 
        organizationId, 
        managerId,
        lastResetDate: new Date().toISOString().split('T')[0],
        ...data 
      })
      .returning();
    return created;
  }
  
  async pauseUser(
    userId: string,
    pausedBy: string,
    reason: string
  ): Promise<UserControl | null> {
    const [updated] = await db
      .update(userControls)
      .set({
        isPaused: true,
        pausedAt: new Date(),
        pausedBy,
        pausedReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(userControls.userId, userId))
      .returning();
    
    return updated || null;
  }
  
  async resumeUser(userId: string): Promise<UserControl | null> {
    const [updated] = await db
      .update(userControls)
      .set({
        isPaused: false,
        pausedAt: null,
        pausedBy: null,
        pausedReason: null,
        autoPausedOnFailures: false,
        consecutiveFailures: 0,
        updatedAt: new Date(),
      })
      .where(eq(userControls.userId, userId))
      .returning();

    // Recover emails that failed solely due to pause (BUG-008)
    await db.update(emailQueue)
      .set({
        status: 'pending',
        deferralAttempts: 0,
        scheduledFor: new Date(),
        lastError: null,
      })
      .where(and(eq(emailQueue.userId, userId), eq(emailQueue.status, 'paused_failed')));

    return updated || null;
  }
  
  /**
   * Check full pause status: user pause + manager pause + tenant pause
   */
  async isUserFullyPaused(userId: string): Promise<{ 
    paused: boolean; 
    reason?: string;
    pauseLevel?: 'user' | 'manager' | 'tenant';
  }> {
    // Check user-level pause
    const userCtrl = await this.getUserControls(userId);
    if (userCtrl?.isPaused) {
      return { 
        paused: true, 
        reason: userCtrl.pausedReason || 'User account paused',
        pauseLevel: 'user',
      };
    }
    
    // Check manager-level pause
    const { paused: managerPaused, reason: managerReason } = await this.isUserManagerPaused(userId);
    if (managerPaused) {
      return { 
        paused: true, 
        reason: managerReason || 'Manager paused',
        pauseLevel: 'manager',
      };
    }
    
    // Check tenant-level pause
    const orgId = await this.getOrganizationIdForUser(userId);
    if (orgId) {
      const tenantPaused = await this.isAutomationPaused(orgId);
      if (tenantPaused) {
        return { 
          paused: true, 
          reason: 'Organization automation paused',
          pauseLevel: 'tenant',
        };
      }
    }
    
    return { paused: false };
  }
  
  /**
   * Check if user can send email (daily limit) with atomic reset
   */
  async canUserSendEmail(userId: string): Promise<{ 
    allowed: boolean; 
    current: number; 
    limit: number; 
    reason?: string;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const orgId = await this.getOrganizationIdForUser(userId);
    
    // Atomic upsert with daily reset
    const [controls] = await db
      .insert(userControls)
      .values({
        userId,
        organizationId: orgId || 'unknown',
        lastResetDate: today,
        emailsSentToday: 0,
      })
      .onConflictDoUpdate({
        target: userControls.userId,
        set: {
          emailsSentToday: sql`CASE WHEN ${userControls.lastResetDate} < ${today} THEN 0 ELSE ${userControls.emailsSentToday} END`,
          lastResetDate: sql`CASE WHEN ${userControls.lastResetDate} < ${today} THEN ${today} ELSE ${userControls.lastResetDate} END`,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    if (!controls) {
      return { allowed: true, current: 0, limit: 200 };
    }
    
    if (controls.isPaused) {
      return { 
        allowed: false, 
        current: controls.emailsSentToday || 0,
        limit: controls.maxEmailsPerDay || 200,
        reason: controls.pausedReason || 'User is paused',
      };
    }
    
    const current = controls.emailsSentToday || 0;
    const limit = controls.maxEmailsPerDay || 200;
    
    if (current >= limit) {
      // Log system event for audit trail (TC-SDR-AUDIT-02)
      logSystemEvent(userId, "quota.daily_email_limit_reached", {
        current,
        limit,
        reason: "Daily email limit reached",
      }).catch(() => {});
      
      return {
        allowed: false,
        current,
        limit,
        reason: `Daily email limit reached (${current}/${limit})`,
      };
    }
    
    return { allowed: true, current, limit };
  }
  
  /**
   * Check concurrency limit for enrollments with atomic upsert
   */
  async canUserEnroll(userId: string): Promise<{ 
    allowed: boolean; 
    current: number; 
    limit: number; 
    reason?: string;
  }> {
    const orgId = await this.getOrganizationIdForUser(userId);
    
    // Ensure controls exist (atomic upsert)
    const [controls] = await db
      .insert(userControls)
      .values({
        userId,
        organizationId: orgId || 'unknown',
        lastResetDate: new Date().toISOString().split('T')[0],
      })
      .onConflictDoUpdate({
        target: userControls.userId,
        set: { updatedAt: new Date() },
      })
      .returning();
    
    if (!controls) {
      return { allowed: true, current: 0, limit: 5 };
    }
    
    if (controls.isPaused) {
      return { 
        allowed: false, 
        current: controls.activeEnrollments || 0,
        limit: controls.maxConcurrentEnrollments || 5,
        reason: controls.pausedReason || 'User is paused',
      };
    }
    
    const current = controls.activeEnrollments || 0;
    const limit = controls.maxConcurrentEnrollments || 5;
    
    if (current >= limit) {
      // Log system event for audit trail (TC-SDR-AUDIT-02)
      logSystemEvent(userId, "quota.enrollment_limit_reached", {
        current,
        limit,
        reason: "Concurrent enrollment limit reached",
      }).catch(() => {});
      
      return {
        allowed: false,
        current,
        limit,
        reason: `Concurrent enrollment limit reached (${current}/${limit})`,
      };
    }
    
    return { allowed: true, current, limit };
  }
  
  /**
   * Record email sent and check for auto-pause on failures
   */
  async recordEmailSent(userId: string, success: boolean): Promise<void> {
    const controls = await this.getUserControls(userId);
    if (!controls) return;
    
    if (success) {
      await db
        .update(userControls)
        .set({
          emailsSentToday: sql`COALESCE(${userControls.emailsSentToday}, 0) + 1`,
          consecutiveFailures: 0,
          updatedAt: new Date(),
        })
        .where(eq(userControls.userId, userId));
    } else {
      const newFailures = (controls.consecutiveFailures || 0) + 1;
      const maxRetries = controls.maxRetriesPerCampaign || 3;
      
      const shouldAutoPause = newFailures >= maxRetries;
      
      await db
        .update(userControls)
        .set({
          consecutiveFailures: newFailures,
          failedRetriesCount: sql`COALESCE(${userControls.failedRetriesCount}, 0) + 1`,
          isPaused: shouldAutoPause ? true : controls.isPaused,
          autoPausedOnFailures: shouldAutoPause ? true : controls.autoPausedOnFailures,
          pausedReason: shouldAutoPause ? `Auto-paused after ${newFailures} consecutive failures` : controls.pausedReason,
          pausedAt: shouldAutoPause ? new Date() : controls.pausedAt,
          updatedAt: new Date(),
        })
        .where(eq(userControls.userId, userId));
    }
  }
  
  async incrementUserUsage(
    userId: string,
    resourceType: 'activeCampaigns' | 'activeEnrollments',
    incrementBy: number = 1
  ): Promise<void> {
    const columnMap = {
      activeCampaigns: userControls.activeCampaigns,
      activeEnrollments: userControls.activeEnrollments,
    };
    
    await db
      .update(userControls)
      .set({ 
        [columnMap[resourceType].name]: sql`COALESCE(${columnMap[resourceType]}, 0) + ${incrementBy}`,
        updatedAt: new Date(),
      })
      .where(eq(userControls.userId, userId));
  }
  
  async decrementUserUsage(
    userId: string,
    resourceType: 'activeCampaigns' | 'activeEnrollments',
    decrementBy: number = 1
  ): Promise<void> {
    const columnMap = {
      activeCampaigns: userControls.activeCampaigns,
      activeEnrollments: userControls.activeEnrollments,
    };
    
    // Decrement but don't go below 0
    await db
      .update(userControls)
      .set({ 
        [columnMap[resourceType].name]: sql`GREATEST(0, COALESCE(${columnMap[resourceType]}, 0) - ${decrementBy})`,
        updatedAt: new Date(),
      })
      .where(eq(userControls.userId, userId));
  }

  // =============================================
  // BACKGROUND JOB VISIBILITY
  // =============================================
  
  async logJobStart(
    jobType: string,
    organizationId?: string,
    payload?: object
  ): Promise<BackgroundJobAudit> {
    const [job] = await db
      .insert(backgroundJobAudit)
      .values({
        jobType,
        organizationId: organizationId || null,
        status: 'running',
        queuedAt: new Date(),
        startedAt: new Date(),
        payload: payload ? JSON.stringify(payload).substring(0, 10000) : null,
      })
      .returning();
    return job;
  }
  
  async updateJobStatus(
    jobId: string,
    status: 'completed' | 'failed' | 'cancelled',
    result?: { itemsProcessed?: number; itemsFailed?: number; error?: string; result?: object }
  ): Promise<void> {
    await db
      .update(backgroundJobAudit)
      .set({
        status,
        completedAt: new Date(),
        itemsProcessed: result?.itemsProcessed || 0,
        itemsFailed: result?.itemsFailed || 0,
        lastError: result?.error || null,
        result: result?.result ? JSON.stringify(result.result).substring(0, 10000) : null,
      })
      .where(eq(backgroundJobAudit.id, jobId));
  }
  
  async incrementJobRetry(jobId: string, error: string): Promise<void> {
    await db
      .update(backgroundJobAudit)
      .set({
        retryCount: sql`${backgroundJobAudit.retryCount} + 1`,
        lastError: error,
      })
      .where(eq(backgroundJobAudit.id, jobId));
  }
  
  async getJobQueueStats(): Promise<{
    queueDepth: number;
    oldestPendingJob: Date | null;
    failedJobs24h: number;
    byType: { jobType: string; count: number; status: string }[];
  }> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const [queueStats] = await db
      .select({
        queueDepth: sql<number>`COUNT(*) FILTER (WHERE status IN ('queued', 'running'))`,
        oldestPendingJob: sql<Date>`MIN(queued_at) FILTER (WHERE status = 'queued')`,
        failedJobs24h: sql<number>`COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= ${yesterday})`,
      })
      .from(backgroundJobAudit);
    
    const byType = await db
      .select({
        jobType: backgroundJobAudit.jobType,
        status: backgroundJobAudit.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(backgroundJobAudit)
      .where(gte(backgroundJobAudit.createdAt, yesterday))
      .groupBy(backgroundJobAudit.jobType, backgroundJobAudit.status);
    
    return {
      queueDepth: Number(queueStats?.queueDepth) || 0,
      oldestPendingJob: queueStats?.oldestPendingJob || null,
      failedJobs24h: Number(queueStats?.failedJobs24h) || 0,
      byType: byType.map(t => ({ ...t, count: Number(t.count) })),
    };
  }
  
  async getRecentFailedJobs(limit: number = 50): Promise<BackgroundJobAudit[]> {
    return db
      .select()
      .from(backgroundJobAudit)
      .where(eq(backgroundJobAudit.status, 'failed'))
      .orderBy(desc(backgroundJobAudit.createdAt))
      .limit(limit);
  }

  // =============================================
  // IDEMPOTENCY KEYS
  // =============================================
  
  async checkIdempotencyKey(
    organizationId: string,
    userId: string,
    idempotencyKey: string,
    operation: string
  ): Promise<{ exists: boolean; response?: object }> {
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.organizationId, organizationId),
          eq(idempotencyKeys.userId, userId),
          eq(idempotencyKeys.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    
    if (!existing) {
      return { exists: false };
    }
    
    if (existing.expiresAt < new Date()) {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id));
      return { exists: false };
    }
    
    return { 
      exists: true, 
      response: existing.response as object | undefined,
    };
  }
  
  async setIdempotencyKey(
    organizationId: string,
    userId: string,
    idempotencyKey: string,
    operation: string,
    response: object,
    ttlHours: number = 24
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    
    await db
      .insert(idempotencyKeys)
      .values({
        organizationId,
        userId,
        idempotencyKey,
        operation,
        status: 'completed',
        response,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [idempotencyKeys.organizationId, idempotencyKeys.userId, idempotencyKeys.idempotencyKey],
        set: { status: 'completed', response, expiresAt },
      });
  }

  // =============================================
  // USAGE COUNTERS (Cost Guardrails)
  // =============================================
  
  async incrementUsageCounter(
    organizationId: string,
    counterType: string,
    periodType: 'hourly' | 'daily' | 'monthly',
    incrementBy: number = 1,
    costUsd: number = 0,
    userId?: string
  ): Promise<UsageCounter> {
    const now = new Date();
    let periodStart: Date;
    
    if (periodType === 'hourly') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    } else if (periodType === 'daily') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const [updated] = await db
      .insert(usageCounters)
      .values({
        organizationId,
        userId: userId || null,
        counterType,
        periodType,
        periodStart,
        count: incrementBy,
        costUsd,
      })
      .onConflictDoUpdate({
        target: [usageCounters.organizationId, usageCounters.counterType, usageCounters.periodType, usageCounters.periodStart],
        set: {
          count: sql`${usageCounters.count} + ${incrementBy}`,
          costUsd: sql`${usageCounters.costUsd} + ${costUsd}`,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return updated;
  }
  
  async getUsageCounter(
    organizationId: string,
    counterType: string,
    periodType: 'hourly' | 'daily' | 'monthly'
  ): Promise<UsageCounter | null> {
    const now = new Date();
    let periodStart: Date;
    
    if (periodType === 'hourly') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    } else if (periodType === 'daily') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const [counter] = await db
      .select()
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.organizationId, organizationId),
          eq(usageCounters.counterType, counterType),
          eq(usageCounters.periodType, periodType),
          eq(usageCounters.periodStart, periodStart)
        )
      )
      .limit(1);
    
    return counter || null;
  }
  
  async getTenantDailyUsageSummary(organizationId: string): Promise<{
    emailsSent: number;
    aiTokens: number;
    prospectsUploaded: number;
    totalCostUsd: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const counters = await db
      .select({
        counterType: usageCounters.counterType,
        count: usageCounters.count,
        costUsd: usageCounters.costUsd,
      })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.organizationId, organizationId),
          eq(usageCounters.periodType, 'daily'),
          eq(usageCounters.periodStart, today)
        )
      );
    
    const summary = {
      emailsSent: 0,
      aiTokens: 0,
      prospectsUploaded: 0,
      totalCostUsd: 0,
    };
    
    for (const c of counters) {
      if (c.counterType === 'emails_sent') summary.emailsSent = c.count;
      if (c.counterType === 'ai_tokens') summary.aiTokens = c.count;
      if (c.counterType === 'prospects_uploaded') summary.prospectsUploaded = c.count;
      summary.totalCostUsd += c.costUsd || 0;
    }
    
    return summary;
  }
  
  // =============================================
  // SEQUENCE ACTIVATION VALIDATION
  // =============================================
  
  /**
   * Comprehensive pre-activation validation for sequences
   * Returns validation result with specific error codes
   */
  async validateSequenceActivation(
    sequenceId: string,
    userId: string,
    organizationId: string
  ): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
    details?: Record<string, any>;
  }> {
    const { sequences, sequenceProspects, usageCounters } = await import('@shared/schema');
    
    // 1. Get sequence and check current status
    const [sequence] = await db
      .select()
      .from(sequences)
      .where(and(
        eq(sequences.id, sequenceId),
        eq(sequences.userId, userId)
      ))
      .limit(1);
    
    if (!sequence) {
      return {
        valid: false,
        code: 'SEQUENCE_NOT_FOUND',
        message: 'Sequence not found or access denied',
      };
    }
    
    // 2. Check if sequence is already active (idempotency)
    if (sequence.status === 'active' || sequence.status === 'sending') {
      return {
        valid: false,
        code: 'SEQUENCE_ALREADY_ACTIVE',
        message: `Sequence is already in ${sequence.status} state. Deactivate first to re-activate.`,
        details: { currentStatus: sequence.status },
      };
    }
    
    // 3. Check enrolled prospect count
    const [{ count: prospectCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sequenceProspects)
      .where(eq(sequenceProspects.sequenceId, sequenceId));
    
    if (prospectCount === 0) {
      return {
        valid: false,
        code: 'SEQUENCE_EMPTY',
        message: 'Cannot activate sequence with zero enrolled prospects. Enroll prospects first.',
        details: { enrolledProspects: 0 },
      };
    }
    
    // 4. Check daily email limit
    const emailCheck = await this.canUserSendEmail(userId);
    if (!emailCheck.allowed) {
      return {
        valid: false,
        code: 'DAILY_LIMIT_EXCEEDED',
        message: emailCheck.reason || 'Daily email limit reached',
        details: { 
          current: emailCheck.current, 
          limit: emailCheck.limit,
        },
      };
    }
    
    // 5. Check AI budget if personalization is enabled
    if (sequence.aiPersonalizationEnabled) {
      const aiBudgetCheck = await this.checkAIBudget(organizationId);
      if (!aiBudgetCheck.available) {
        return {
          valid: false,
          code: 'AI_BUDGET_EXHAUSTED',
          message: aiBudgetCheck.reason || 'AI token budget exhausted for this organization',
          details: {
            currentTokens: aiBudgetCheck.currentTokens,
            limit: aiBudgetCheck.limit,
          },
        };
      }
    }
    
    // 6. Check activation rate limiting (rapid toggle abuse prevention)
    const ACTIVATION_COOLDOWN_MS = 60000; // 60 seconds cooldown
    const MAX_TOGGLES_PER_WINDOW = 5;
    const TOGGLE_WINDOW_MS = 60000; // 1 minute window
    
    if (sequence.lastStatusChangeAt) {
      const timeSinceLastChange = Date.now() - new Date(sequence.lastStatusChangeAt).getTime();
      if (timeSinceLastChange < ACTIVATION_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((ACTIVATION_COOLDOWN_MS - timeSinceLastChange) / 1000);
        return {
          valid: false,
          code: 'ACTIVATION_RATE_LIMITED',
          message: `Please wait ${remainingSeconds} seconds before toggling activation again.`,
          details: {
            cooldownRemaining: remainingSeconds,
            lastChangeAt: sequence.lastStatusChangeAt,
          },
        };
      }
    }
    
    // Check toggle count in current window
    if ((sequence.activationToggleCount || 0) >= MAX_TOGGLES_PER_WINDOW) {
      return {
        valid: false,
        code: 'ACTIVATION_RATE_LIMITED',
        message: `Too many activation toggles. Maximum ${MAX_TOGGLES_PER_WINDOW} changes per minute.`,
        details: {
          toggleCount: sequence.activationToggleCount,
          maxToggles: MAX_TOGGLES_PER_WINDOW,
        },
      };
    }
    
    // All checks passed
    return {
      valid: true,
      details: {
        enrolledProspects: prospectCount,
        emailsRemaining: emailCheck.limit - emailCheck.current,
        aiPersonalizationEnabled: sequence.aiPersonalizationEnabled,
      },
    };
  }
  
  /**
   * Check if AI budget is available for the organization
   */
  async checkAIBudget(organizationId: string): Promise<{
    available: boolean;
    currentTokens: number;
    limit: number;
    reason?: string;
  }> {
    const { usageCounters } = await import('@shared/schema');
    
    // Default limit: 1 million tokens per month (can be extended to tenant settings later)
    const monthlyLimit = 1000000;
    
    // Get current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const [usage] = await db
      .select({ totalTokens: sql<number>`COALESCE(SUM(${usageCounters.count}), 0)::int` })
      .from(usageCounters)
      .where(and(
        eq(usageCounters.organizationId, organizationId),
        eq(usageCounters.counterType, 'ai_tokens'),
        gte(usageCounters.periodStart, startOfMonth)
      ));
    
    const currentTokens = usage?.totalTokens || 0;
    
    if (currentTokens >= monthlyLimit) {
      return {
        available: false,
        currentTokens,
        limit: monthlyLimit,
        reason: `Monthly AI token limit reached (${currentTokens.toLocaleString()}/${monthlyLimit.toLocaleString()})`,
      };
    }
    
    return {
      available: true,
      currentTokens,
      limit: monthlyLimit,
    };
  }
  
  /**
   * Record sequence activation toggle for rate limiting
   * Must be called after successful activation/deactivation
   */
  async recordSequenceStatusChange(sequenceId: string, newStatus: string): Promise<void> {
    const { sequences } = await import('@shared/schema');
    const now = new Date();
    
    // Get current toggle count
    const [sequence] = await db
      .select({ 
        activationToggleCount: sequences.activationToggleCount,
        lastStatusChangeAt: sequences.lastStatusChangeAt,
      })
      .from(sequences)
      .where(eq(sequences.id, sequenceId))
      .limit(1);
    
    // Reset counter if last change was more than 1 minute ago
    const TOGGLE_WINDOW_MS = 60000;
    let newToggleCount = 1;
    if (sequence?.lastStatusChangeAt) {
      const timeSinceLastChange = now.getTime() - new Date(sequence.lastStatusChangeAt).getTime();
      if (timeSinceLastChange < TOGGLE_WINDOW_MS) {
        newToggleCount = (sequence.activationToggleCount || 0) + 1;
      }
    }
    
    // Update sequence with new status change timestamp
    await db
      .update(sequences)
      .set({
        lastStatusChangeAt: now,
        activationToggleCount: newToggleCount,
        lastActivatedAt: newStatus === 'active' ? now : undefined,
        updatedAt: now,
      })
      .where(eq(sequences.id, sequenceId));
  }
  
  // =============================================
  // CLEANUP
  // =============================================
  
  async cleanupExpiredIdempotencyKeys(): Promise<number> {
    const result = await db
      .delete(idempotencyKeys)
      .where(lte(idempotencyKeys.expiresAt, new Date()));
    return 0;
  }
  
  async cleanupOldThrottleWindows(olderThanHours: number = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const result = await db
      .delete(throttleWindows)
      .where(lte(throttleWindows.windowStart, cutoff));
    return 0;
  }
}

export const hardeningService = new HardeningService();
