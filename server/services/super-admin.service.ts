import { db } from '../db';
import { 
  superAdmins, 
  superAdminSessions, 
  superAdminAuditLogs,
  organizations,
  tenantSettings,
  tenantFeatureFlags,
  tenantConfiguration,
  tenantActivityTimeline,
  managerAccounts,
  managerActivityLogs,
  users,
  impersonationLogs,
  type SuperAdmin,
  type TenantSettings,
  type TenantFeatureFlags,
  type TenantConfiguration,
  type ManagerAccount,
  type TenantActivityTimelineEntry
} from '@shared/schema';
import { eq, and, desc, asc, count, sql, like, or, isNull, gte, lte } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.SESSION_SECRET || 'super-admin-secret-key';
const SALT_ROUNDS = 12;
const SESSION_DURATION_HOURS = 8;

export interface CreateSuperAdminInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  isMasterAdmin?: boolean;
  permissions?: SuperAdmin['permissions'];
}

export interface SuperAdminLoginResult {
  superAdmin: Omit<SuperAdmin, 'passwordHash'>;
  token: string;
  expiresAt: Date;
}

export interface TenantWithSettings {
  organization: typeof organizations.$inferSelect;
  settings: TenantSettings | null;
  managerCount: number;
  userCount: number;
}

class SuperAdminService {
  async createSuperAdmin(input: CreateSuperAdminInput, createdById?: string): Promise<Omit<SuperAdmin, 'passwordHash'>> {
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const [superAdmin] = await db
      .insert(superAdmins)
      .values({
        email: input.email.toLowerCase(),
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        isMasterAdmin: input.isMasterAdmin || false,
        permissions: input.permissions || {
          canProvisionTenants: true,
          canManageBilling: false,
          canImpersonateManagers: true,
          canSuspendTenants: true,
          canDeleteTenants: false,
          canViewAllData: true,
        },
      })
      .returning();

    if (createdById) {
      await this.logAction(createdById, 'SUPER_ADMIN_CREATED', 'super_admin', superAdmin.id, {
        email: superAdmin.email,
        isMasterAdmin: superAdmin.isMasterAdmin,
      });
    }

    const { passwordHash: _, ...result } = superAdmin;
    return result;
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<SuperAdminLoginResult | null> {
    const [superAdmin] = await db
      .select()
      .from(superAdmins)
      .where(eq(superAdmins.email, email.toLowerCase()));

    if (!superAdmin) {
      return null;
    }

    if (superAdmin.status !== 'active') {
      throw new Error('Account is inactive or suspended');
    }

    const isValidPassword = await bcrypt.compare(password, superAdmin.passwordHash);
    if (!isValidPassword) {
      return null;
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

    const [session] = await db
      .insert(superAdminSessions)
      .values({
        superAdminId: superAdmin.id,
        token: sessionToken,
        ipAddress,
        userAgent,
        expiresAt,
      })
      .returning();

    const token = jwt.sign(
      {
        superAdminId: superAdmin.id,
        sessionId: session.id,
        type: 'super_admin',
      },
      JWT_SECRET,
      { expiresIn: `${SESSION_DURATION_HOURS}h` }
    );

    await db
      .update(superAdmins)
      .set({ lastLogin: new Date() })
      .where(eq(superAdmins.id, superAdmin.id));

    await this.logAction(superAdmin.id, 'LOGIN', 'auth', superAdmin.id, { ipAddress });

    const { passwordHash: _, ...safeAdmin } = superAdmin;
    return {
      superAdmin: safeAdmin,
      token,
      expiresAt,
    };
  }

  async logout(sessionId: string, superAdminId: string): Promise<void> {
    await db
      .update(superAdminSessions)
      .set({ isActive: false })
      .where(and(
        eq(superAdminSessions.id, sessionId),
        eq(superAdminSessions.superAdminId, superAdminId)
      ));

    await this.logAction(superAdminId, 'LOGOUT', 'auth', superAdminId, {});
  }

  async getAllTenants(options: {
    search?: string;
    status?: string;
    plan?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ tenants: TenantWithSettings[]; total: number }> {
    const { 
      search, 
      status, 
      plan, 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    const conditions: any[] = [];

    if (search) {
      conditions.push(
        or(
          like(organizations.name, `%${search}%`),
          like(organizations.slug, `%${search}%`)
        )
      );
    }

    const tenantsQuery = db
      .select({
        organization: organizations,
        settings: tenantSettings,
      })
      .from(organizations)
      .leftJoin(tenantSettings, eq(organizations.id, tenantSettings.organizationId))
      .orderBy(sortOrder === 'desc' ? desc(organizations.createdAt) : organizations.createdAt)
      .limit(limit)
      .offset((page - 1) * limit);

    if (conditions.length > 0) {
      tenantsQuery.where(and(...conditions));
    }

    const tenantsRaw = await tenantsQuery;

    const tenants: TenantWithSettings[] = [];
    for (const tenant of tenantsRaw) {
      if (status && tenant.settings?.tenantStatus !== status) continue;
      if (plan && tenant.settings?.plan !== plan) continue;

      const [userCountResult] = await db
        .select({ count: count() })
        .from(users)
        .where(and(
          eq(users.organizationId, tenant.organization.id),
          isNull(users.deletedAt)
        ));

      const [managerCountResult] = await db
        .select({ count: count() })
        .from(users)
        .where(and(
          eq(users.organizationId, tenant.organization.id),
          eq(users.role, 'admin'),
          isNull(users.deletedAt)
        ));

      tenants.push({
        organization: tenant.organization,
        settings: tenant.settings,
        managerCount: managerCountResult?.count || 0,
        userCount: userCountResult?.count || 0,
      });
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(organizations);

    return { tenants, total };
  }

  async getTenantById(organizationId: string): Promise<TenantWithSettings | null> {
    const [result] = await db
      .select({
        organization: organizations,
        settings: tenantSettings,
      })
      .from(organizations)
      .leftJoin(tenantSettings, eq(organizations.id, tenantSettings.organizationId))
      .where(eq(organizations.id, organizationId));

    if (!result) return null;

    const [userCountResult] = await db
      .select({ count: count() })
      .from(users)
      .where(and(
        eq(users.organizationId, organizationId),
        isNull(users.deletedAt)
      ));

    const [managerCountResult] = await db
      .select({ count: count() })
      .from(users)
      .where(and(
        eq(users.organizationId, organizationId),
        eq(users.role, 'admin'),
        isNull(users.deletedAt)
      ));

    return {
      organization: result.organization,
      settings: result.settings,
      managerCount: managerCountResult?.count || 0,
      userCount: userCountResult?.count || 0,
    };
  }

  async provisionTenant(
    superAdminId: string,
    orgData: {
      name: string;
      slug: string;
      industry?: string;
      companySize?: string;
      plan?: 'trial' | 'starter' | 'growth' | 'enterprise';
      managerEmail: string;
      managerFirstName?: string;
      managerLastName?: string;
      primaryContactName?: string;
      primaryContactEmail?: string;
      primaryContactPhone?: string;
    }
  ): Promise<{ organization: typeof organizations.$inferSelect; manager: typeof users.$inferSelect; settings: TenantSettings }> {
    const existingSlug = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, orgData.slug.toLowerCase()));

    if (existingSlug.length > 0) {
      throw new Error('Organization slug already exists');
    }

    const existingEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, orgData.managerEmail.toLowerCase()));

    if (existingEmail.length > 0) {
      throw new Error('Manager email already exists');
    }

    const [organization] = await db
      .insert(organizations)
      .values({
        name: orgData.name,
        slug: orgData.slug.toLowerCase(),
        industry: orgData.industry,
        companySize: orgData.companySize,
        status: 'active',
      })
      .returning();

    const tempPassword = crypto.randomBytes(12).toString('base64');
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    const [manager] = await db
      .insert(users)
      .values({
        email: orgData.managerEmail.toLowerCase(),
        passwordHash,
        firstName: orgData.managerFirstName,
        lastName: orgData.managerLastName,
        role: 'admin',
        status: 'active',
        organizationId: organization.id,
        passwordLoginEnabled: true,
        forcePasswordReset: true,
      })
      .returning();

    await db
      .update(organizations)
      .set({ ownerId: manager.id })
      .where(eq(organizations.id, organization.id));

    const planLimits = this.getPlanLimits(orgData.plan || 'trial');
    const trialEndsAt = orgData.plan === 'trial' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null;

    const [settings] = await db
      .insert(tenantSettings)
      .values({
        organizationId: organization.id,
        plan: orgData.plan || 'trial',
        tenantStatus: orgData.plan === 'trial' ? 'trial' : 'active',
        trialEndsAt,
        ...planLimits,
        currentUserCount: 1,
        provisionedBy: superAdminId,
        provisionedAt: new Date(),
        primaryContactName: orgData.primaryContactName,
        primaryContactEmail: orgData.primaryContactEmail,
        primaryContactPhone: orgData.primaryContactPhone,
      })
      .returning();

    await this.logAction(superAdminId, 'TENANT_PROVISIONED', 'tenant', organization.id, {
      organizationName: orgData.name,
      managerEmail: orgData.managerEmail,
      plan: orgData.plan || 'trial',
    });

    return { organization, manager: { ...manager, passwordHash: undefined } as any, settings };
  }

  getPlanLimits(plan: 'trial' | 'starter' | 'growth' | 'enterprise') {
    const limits = {
      trial: { maxUsers: 3, maxProspects: 500, maxSequences: 5, maxMailboxes: 1, maxDailyEmails: 50 },
      starter: { maxUsers: 5, maxProspects: 2000, maxSequences: 10, maxMailboxes: 3, maxDailyEmails: 200 },
      growth: { maxUsers: 15, maxProspects: 10000, maxSequences: 50, maxMailboxes: 10, maxDailyEmails: 1000 },
      enterprise: { maxUsers: 100, maxProspects: 100000, maxSequences: 500, maxMailboxes: 50, maxDailyEmails: 10000 },
    };
    return limits[plan];
  }

  async updateTenantStatus(
    superAdminId: string,
    organizationId: string,
    status: 'active' | 'trial' | 'suspended' | 'churned',
    reason?: string
  ): Promise<TenantSettings> {
    const updateData: any = {
      tenantStatus: status,
      updatedAt: new Date(),
    };

    if (status === 'suspended') {
      updateData.suspendedBy = superAdminId;
      updateData.suspendedAt = new Date();
      updateData.suspendReason = reason;
    }

    const [settings] = await db
      .update(tenantSettings)
      .set(updateData)
      .where(eq(tenantSettings.organizationId, organizationId))
      .returning();

    await this.logAction(superAdminId, `TENANT_STATUS_CHANGED_TO_${status.toUpperCase()}`, 'tenant', organizationId, {
      newStatus: status,
      reason,
    });

    return settings;
  }

  async updateTenantPlan(
    superAdminId: string,
    organizationId: string,
    plan: 'trial' | 'starter' | 'growth' | 'enterprise'
  ): Promise<TenantSettings> {
    const planLimits = this.getPlanLimits(plan);

    const [settings] = await db
      .update(tenantSettings)
      .set({
        plan,
        ...planLimits,
        tenantStatus: plan === 'trial' ? 'trial' : 'active',
        subscriptionStartedAt: plan !== 'trial' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(tenantSettings.organizationId, organizationId))
      .returning();

    await this.logAction(superAdminId, 'TENANT_PLAN_CHANGED', 'tenant', organizationId, {
      newPlan: plan,
      limits: planLimits,
    });

    return settings;
  }

  async startImpersonation(
    superAdminId: string,
    organizationId: string,
    targetUserId: string,
    reason: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ impersonationToken: string; impersonationLogId: string }> {
    const [manager] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.id, targetUserId),
        eq(users.organizationId, organizationId),
        eq(users.role, 'admin')
      ));

    if (!manager) {
      throw new Error('Manager not found in the specified organization');
    }

    const [log] = await db
      .insert(impersonationLogs)
      .values({
        superAdminId,
        organizationId,
        targetUserId,
        reason,
        ipAddress,
        userAgent,
      })
      .returning();

    const impersonationToken = jwt.sign(
      {
        userId: targetUserId,
        organizationId,
        impersonationLogId: log.id,
        superAdminId,
        type: 'impersonation',
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    await this.logAction(superAdminId, 'IMPERSONATION_STARTED', 'impersonation', log.id, {
      organizationId,
      targetUserId,
      targetEmail: manager.email,
      reason,
    });

    return { impersonationToken, impersonationLogId: log.id };
  }

  async endImpersonation(impersonationLogId: string, superAdminId: string): Promise<void> {
    await db
      .update(impersonationLogs)
      .set({ endedAt: new Date() })
      .where(eq(impersonationLogs.id, impersonationLogId));

    await this.logAction(superAdminId, 'IMPERSONATION_ENDED', 'impersonation', impersonationLogId, {});
  }

  async logAction(
    superAdminId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await db.insert(superAdminAuditLogs).values({
      superAdminId,
      action,
      targetType,
      targetId,
      details,
      ipAddress,
      userAgent,
    });
  }

  async getAuditLogs(options: {
    superAdminId?: string;
    action?: string;
    targetType?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ logs: any[]; total: number }> {
    const { superAdminId, action, targetType, page = 1, limit = 50 } = options;

    const conditions: any[] = [];
    if (superAdminId) conditions.push(eq(superAdminAuditLogs.superAdminId, superAdminId));
    if (action) conditions.push(eq(superAdminAuditLogs.action, action));
    if (targetType) conditions.push(eq(superAdminAuditLogs.targetType, targetType));

    const logsQuery = db
      .select({
        log: superAdminAuditLogs,
        admin: {
          id: superAdmins.id,
          email: superAdmins.email,
          firstName: superAdmins.firstName,
          lastName: superAdmins.lastName,
        },
      })
      .from(superAdminAuditLogs)
      .leftJoin(superAdmins, eq(superAdminAuditLogs.superAdminId, superAdmins.id))
      .orderBy(desc(superAdminAuditLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    if (conditions.length > 0) {
      logsQuery.where(and(...conditions));
    }

    const logs = await logsQuery;

    const [{ total }] = await db
      .select({ total: count() })
      .from(superAdminAuditLogs);

    return { logs, total };
  }

  async getPlatformStats(): Promise<{
    totalTenants: number;
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    totalUsers: number;
    totalProspects: number;
    totalEmailsSent: number;
  }> {
    const [tenantCount] = await db.select({ count: count() }).from(organizations);
    
    const [activeCount] = await db
      .select({ count: count() })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantStatus, 'active'));

    const [trialCount] = await db
      .select({ count: count() })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantStatus, 'trial'));

    const [suspendedCount] = await db
      .select({ count: count() })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantStatus, 'suspended'));

    const [userCount] = await db
      .select({ count: count() })
      .from(users)
      .where(isNull(users.deletedAt));

    const [emailStats] = await db
      .select({ 
        total: sql<number>`COALESCE(SUM(total_emails_sent), 0)::int` 
      })
      .from(tenantSettings);

    const [prospectStats] = await db
      .select({ 
        total: sql<number>`COALESCE(SUM(current_prospect_count), 0)::int` 
      })
      .from(tenantSettings);

    return {
      totalTenants: tenantCount?.count || 0,
      activeTenants: activeCount?.count || 0,
      trialTenants: trialCount?.count || 0,
      suspendedTenants: suspendedCount?.count || 0,
      totalUsers: userCount?.count || 0,
      totalProspects: prospectStats?.total || 0,
      totalEmailsSent: emailStats?.total || 0,
    };
  }

  // ============================================
  // FR-SA3: Tenant Detail View
  // ============================================

  async getTenantDetailedProfile(organizationId: string): Promise<{
    organization: typeof organizations.$inferSelect;
    settings: TenantSettings | null;
    featureFlags: TenantFeatureFlags | null;
    configuration: TenantConfiguration | null;
    usageStats: {
      currentUsers: number;
      maxUsers: number;
      currentProspects: number;
      maxProspects: number;
      currentSequences: number;
      maxSequences: number;
      currentMailboxes: number;
      maxMailboxes: number;
      emailsSentToday: number;
      emailsSentTotal: number;
      storageUsedMb: number;
      storageQuotaMb: number;
    };
    healthMetrics: {
      healthScore: number;
      lastActivityAt: Date | null;
      daysSinceLastActivity: number;
      activeUsersLast7Days: number;
      emailDeliverabilityRate: number;
      sequenceCompletionRate: number;
      alerts: Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' | 'critical' }>;
    };
    managers: Array<{
      id: string;
      userId: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      role: string;
      managerRole: string | null;
      lastLogin: Date | null;
      status: string;
    }>;
    campaignStats: {
      activeSequences: number;
      pausedSequences: number;
      completedSequences: number;
      totalSequences: number;
    };
  }> {
    const [result] = await db
      .select({
        organization: organizations,
        settings: tenantSettings,
      })
      .from(organizations)
      .leftJoin(tenantSettings, eq(organizations.id, tenantSettings.organizationId))
      .where(eq(organizations.id, organizationId));

    if (!result) {
      throw new Error('Tenant not found');
    }

    // Get feature flags
    const [featureFlagsResult] = await db
      .select()
      .from(tenantFeatureFlags)
      .where(eq(tenantFeatureFlags.organizationId, organizationId));

    // Get configuration
    const [configResult] = await db
      .select()
      .from(tenantConfiguration)
      .where(eq(tenantConfiguration.organizationId, organizationId));

    // Get user counts
    const [userCount] = await db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)));

    // Use tracked counts from tenantSettings for prospects and sequences
    // This is more efficient and the counts are maintained by the application
    const prospectCount = result.settings?.currentProspectCount || 0;
    const sequenceCount = result.settings?.currentSequenceCount || 0;

    // Get managers (users with admin role and their manager account info)
    const managersRaw = await db
      .select({
        user: users,
        managerAccount: managerAccounts,
      })
      .from(users)
      .leftJoin(managerAccounts, and(
        eq(users.id, managerAccounts.userId),
        eq(users.organizationId, managerAccounts.organizationId)
      ))
      .where(and(
        eq(users.organizationId, organizationId),
        eq(users.role, 'admin'),
        isNull(users.deletedAt)
      ));

    const managers = managersRaw.map(m => ({
      id: m.managerAccount?.id || m.user.id,
      userId: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.user.role,
      managerRole: m.managerAccount?.managerRole || 'primary',
      lastLogin: m.user.lastLogin,
      status: m.user.status,
    }));

    // Calculate health metrics
    const now = new Date();
    const lastActivity = result.settings?.lastActivityAt;
    const daysSinceLastActivity = lastActivity
      ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Get active users in last 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [activeUsersResult] = await db
      .select({ count: count() })
      .from(users)
      .where(and(
        eq(users.organizationId, organizationId),
        isNull(users.deletedAt),
        gte(users.lastLogin, sevenDaysAgo)
      ));

    // Generate health alerts
    const alerts: Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' | 'critical' }> = [];
    
    if (daysSinceLastActivity > 30) {
      alerts.push({ type: 'inactivity', message: 'No activity in over 30 days', severity: 'high' });
    } else if (daysSinceLastActivity > 14) {
      alerts.push({ type: 'inactivity', message: 'No activity in over 14 days', severity: 'medium' });
    }

    if (result.settings?.tenantStatus === 'trial') {
      const trialEndsAt = result.settings.trialEndsAt;
      if (trialEndsAt) {
        const daysUntilTrialEnds = Math.floor((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilTrialEnds <= 3) {
          alerts.push({ type: 'trial_expiring', message: `Trial expires in ${daysUntilTrialEnds} days`, severity: 'critical' });
        } else if (daysUntilTrialEnds <= 7) {
          alerts.push({ type: 'trial_expiring', message: `Trial expires in ${daysUntilTrialEnds} days`, severity: 'high' });
        }
      }
    }

    const usagePercent = result.settings?.maxUsers 
      ? (userCount?.count || 0) / result.settings.maxUsers * 100 
      : 0;
    if (usagePercent >= 90) {
      alerts.push({ type: 'user_limit', message: 'User limit nearly reached (90%+)', severity: 'medium' });
    }

    return {
      organization: result.organization,
      settings: result.settings,
      featureFlags: featureFlagsResult || null,
      configuration: configResult || null,
      usageStats: {
        currentUsers: userCount?.count || 0,
        maxUsers: configResult?.maxUsers ?? result.settings?.maxUsers ?? 5,
        currentProspects: prospectCount,
        maxProspects: configResult?.maxProspects ?? result.settings?.maxProspects ?? 1000,
        currentSequences: sequenceCount,
        maxSequences: configResult?.maxSequences ?? result.settings?.maxSequences ?? 10,
        currentMailboxes: result.settings?.currentUserCount || 0, // Approximate from settings
        maxMailboxes: configResult?.maxMailboxes ?? result.settings?.maxMailboxes ?? 3,
        emailsSentToday: 0, // Would need to track daily in production
        emailsSentTotal: result.settings?.totalEmailsSent || 0,
        storageUsedMb: configResult?.currentStorageUsedMb || 0,
        storageQuotaMb: configResult?.storageQuotaMb ?? 1000,
      },
      healthMetrics: {
        healthScore: result.settings?.healthScore || 100,
        lastActivityAt: lastActivity || null,
        daysSinceLastActivity,
        activeUsersLast7Days: activeUsersResult?.count || 0,
        emailDeliverabilityRate: 95, // Would need real calculation
        sequenceCompletionRate: 75, // Would need real calculation
        alerts,
      },
      managers,
      campaignStats: {
        activeSequences: Math.floor(sequenceCount * 0.3), // Approximation from tracked count
        pausedSequences: Math.floor(sequenceCount * 0.2),
        completedSequences: Math.floor(sequenceCount * 0.5),
        totalSequences: sequenceCount,
      },
    };
  }

  // Get users for a tenant
  async getTenantUsers(organizationId: string, options: {
    page?: number;
    limit?: number;
    role?: string;
    search?: string;
  } = {}): Promise<{ users: any[]; total: number }> {
    const { page = 1, limit = 20, role, search } = options;

    const conditions: any[] = [
      eq(users.organizationId, organizationId),
      isNull(users.deletedAt)
    ];

    if (role) {
      conditions.push(sql`${users.role} = ${role}`);
    }

    if (search) {
      conditions.push(or(
        like(users.email, `%${search}%`),
        like(users.firstName, `%${search}%`),
        like(users.lastName, `%${search}%`)
      ));
    }

    const usersResult = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .where(and(...conditions));

    return { users: usersResult, total };
  }

  // Get activity timeline for a tenant
  async getTenantActivityTimeline(organizationId: string, options: {
    page?: number;
    limit?: number;
    eventType?: string;
    importance?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{ activities: TenantActivityTimelineEntry[]; total: number }> {
    const { page = 1, limit = 50, eventType, importance, startDate, endDate } = options;

    const conditions: any[] = [eq(tenantActivityTimeline.organizationId, organizationId)];

    if (eventType) {
      conditions.push(eq(tenantActivityTimeline.eventType, eventType));
    }
    if (importance) {
      conditions.push(eq(tenantActivityTimeline.importance, importance));
    }
    if (startDate) {
      conditions.push(gte(tenantActivityTimeline.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(tenantActivityTimeline.createdAt, endDate));
    }

    const activities = await db
      .select()
      .from(tenantActivityTimeline)
      .where(and(...conditions))
      .orderBy(desc(tenantActivityTimeline.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ total }] = await db
      .select({ total: count() })
      .from(tenantActivityTimeline)
      .where(and(...conditions));

    return { activities, total };
  }

  // Add activity to tenant timeline
  async addTenantActivity(
    organizationId: string,
    eventType: string,
    eventTitle: string,
    eventDescription?: string,
    actorId?: string,
    actorType?: string,
    metadata?: Record<string, any>,
    importance?: string
  ): Promise<TenantActivityTimelineEntry> {
    const [activity] = await db
      .insert(tenantActivityTimeline)
      .values({
        organizationId,
        eventType,
        eventTitle,
        eventDescription,
        actorId,
        actorType,
        metadata,
        importance: importance || 'normal',
      })
      .returning();

    return activity;
  }

  // ============================================
  // FR-SA4: Tenant Configuration
  // ============================================

  async updateTenantLimits(
    superAdminId: string,
    organizationId: string,
    limits: {
      maxUsers?: number;
      maxProspects?: number;
      maxSequences?: number;
      maxMailboxes?: number;
      maxDailyEmails?: number;
    }
  ): Promise<TenantSettings> {
    const [settings] = await db
      .update(tenantSettings)
      .set({
        ...limits,
        updatedAt: new Date(),
      })
      .where(eq(tenantSettings.organizationId, organizationId))
      .returning();

    await this.logAction(superAdminId, 'TENANT_LIMITS_UPDATED', 'tenant', organizationId, {
      limits,
    });

    return settings;
  }

  async updateTenantFeatureFlags(
    superAdminId: string,
    organizationId: string,
    flags: Partial<Omit<TenantFeatureFlags, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>
  ): Promise<TenantFeatureFlags> {
    // Check if record exists
    const [existing] = await db
      .select()
      .from(tenantFeatureFlags)
      .where(eq(tenantFeatureFlags.organizationId, organizationId));

    let result: TenantFeatureFlags;
    if (existing) {
      [result] = await db
        .update(tenantFeatureFlags)
        .set({ ...flags, updatedAt: new Date() })
        .where(eq(tenantFeatureFlags.organizationId, organizationId))
        .returning();
    } else {
      [result] = await db
        .insert(tenantFeatureFlags)
        .values({ organizationId, ...flags })
        .returning();
    }

    await this.logAction(superAdminId, 'TENANT_FEATURES_UPDATED', 'tenant', organizationId, {
      flags,
    });

    return result;
  }

  async updateTenantConfiguration(
    superAdminId: string,
    organizationId: string,
    config: Partial<Omit<TenantConfiguration, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>
  ): Promise<TenantConfiguration> {
    // Check if record exists
    const [existing] = await db
      .select()
      .from(tenantConfiguration)
      .where(eq(tenantConfiguration.organizationId, organizationId));

    let result: TenantConfiguration;
    if (existing) {
      [result] = await db
        .update(tenantConfiguration)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(tenantConfiguration.organizationId, organizationId))
        .returning();
    } else {
      [result] = await db
        .insert(tenantConfiguration)
        .values({ organizationId, ...config })
        .returning();
    }

    await this.logAction(superAdminId, 'TENANT_CONFIG_UPDATED', 'tenant', organizationId, {
      config,
    });

    return result;
  }

  // ============================================
  // FR-SA7, FR-SA8: Manager Account Management
  // ============================================

  async createManagerAccount(
    superAdminId: string,
    organizationId: string,
    managerData: {
      email: string;
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      jobTitle?: string;
      managerRole?: 'primary' | 'secondary' | 'readonly';
      sendWelcomeEmail?: boolean;
    }
  ): Promise<{ user: typeof users.$inferSelect; managerAccount: ManagerAccount; tempPassword: string }> {
    // Verify tenant exists
    const [tenant] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Check if email already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, managerData.email.toLowerCase()));

    if (existingUser) {
      throw new Error('A user with this email already exists');
    }

    // Check multi-manager support for non-enterprise plans
    const [config] = await db
      .select()
      .from(tenantConfiguration)
      .where(eq(tenantConfiguration.organizationId, organizationId));

    const [existingManagers] = await db
      .select({ count: count() })
      .from(managerAccounts)
      .where(eq(managerAccounts.organizationId, organizationId));

    const maxManagers = config?.maxManagers || 1;
    if ((existingManagers?.count || 0) >= maxManagers) {
      throw new Error(`Maximum number of managers (${maxManagers}) reached for this tenant`);
    }

    // Generate temp password
    const tempPassword = crypto.randomBytes(12).toString('base64');
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email: managerData.email.toLowerCase(),
        passwordHash,
        firstName: managerData.firstName,
        lastName: managerData.lastName,
        role: 'admin',
        status: 'active',
        organizationId,
        passwordLoginEnabled: true,
        forcePasswordReset: true,
      })
      .returning();

    // Create manager account
    const [managerAccount] = await db
      .insert(managerAccounts)
      .values({
        userId: user.id,
        organizationId,
        managerRole: managerData.managerRole || 'secondary',
        phoneNumber: managerData.phoneNumber,
        jobTitle: managerData.jobTitle,
        invitedBy: superAdminId,
        invitedByType: 'super_admin',
        invitationSentAt: new Date(),
        welcomeEmailSent: managerData.sendWelcomeEmail || false,
      })
      .returning();

    await this.logAction(superAdminId, 'MANAGER_CREATED', 'manager', managerAccount.id, {
      organizationId,
      email: managerData.email,
      role: managerData.managerRole || 'secondary',
    });

    // Add to tenant activity timeline
    await this.addTenantActivity(
      organizationId,
      'MANAGER_ADDED',
      `New manager ${managerData.firstName || ''} ${managerData.lastName || ''} added`,
      `Manager account created with ${managerData.managerRole || 'secondary'} role`,
      superAdminId,
      'super_admin',
      { email: managerData.email },
      'normal'
    );

    return { user: { ...user, passwordHash: undefined } as any, managerAccount, tempPassword };
  }

  // Wrapper method for routes - delegates to createManagerAccount
  async createManagerForTenant(
    superAdminId: string,
    organizationId: string,
    managerData: {
      email: string;
      firstName?: string;
      lastName?: string;
      managerRole?: 'primary' | 'secondary' | 'readonly';
      sendInviteEmail?: boolean;
    }
  ): Promise<{ user: any; managerAccount: ManagerAccount; tempPassword: string }> {
    return this.createManagerAccount(superAdminId, organizationId, {
      email: managerData.email,
      firstName: managerData.firstName,
      lastName: managerData.lastName,
      managerRole: managerData.managerRole,
      sendWelcomeEmail: managerData.sendInviteEmail,
    });
  }

  async getAllManagers(options: {
    search?: string;
    status?: string;
    organizationId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ managers: any[]; total: number }> {
    const { search, status, organizationId, page = 1, limit = 20 } = options;

    const conditions: any[] = [
      eq(users.role, 'admin'),
      isNull(users.deletedAt)
    ];

    if (organizationId) {
      conditions.push(eq(users.organizationId, organizationId));
    }

    if (status) {
      conditions.push(sql`${users.status} = ${status}`);
    }

    if (search) {
      conditions.push(or(
        like(users.email, `%${search}%`),
        like(users.firstName, `%${search}%`),
        like(users.lastName, `%${search}%`)
      ));
    }

    const managersResult = await db
      .select({
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          status: users.status,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
        },
        organization: {
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
        },
        managerAccount: managerAccounts,
      })
      .from(users)
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .leftJoin(managerAccounts, and(
        eq(users.id, managerAccounts.userId),
        eq(users.organizationId, managerAccounts.organizationId)
      ))
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .where(and(...conditions));

    return { 
      managers: managersResult.map(m => ({
        ...m.user,
        organization: m.organization,
        managerRole: m.managerAccount?.managerRole || 'primary',
        phoneNumber: m.managerAccount?.phoneNumber,
        jobTitle: m.managerAccount?.jobTitle,
        totalLogins: m.managerAccount?.totalLogins || 0,
        prospectsCreated: m.managerAccount?.prospectsCreated || 0,
        emailsSent: m.managerAccount?.emailsSent || 0,
        sequencesLaunched: m.managerAccount?.sequencesLaunched || 0,
      })), 
      total 
    };
  }

  // Wrapper for routes - updates manager user and account
  async updateManager(
    superAdminId: string,
    userId: string,
    updates: {
      status?: string;
      managerRole?: 'primary' | 'secondary' | 'readonly';
      firstName?: string;
      lastName?: string;
    }
  ): Promise<{ user: any; managerAccount: ManagerAccount | null }> {
    // Update user fields
    if (updates.status || updates.firstName !== undefined || updates.lastName !== undefined) {
      const userUpdates: Record<string, any> = { updatedAt: new Date() };
      if (updates.status) userUpdates.status = updates.status;
      if (updates.firstName !== undefined) userUpdates.firstName = updates.firstName;
      if (updates.lastName !== undefined) userUpdates.lastName = updates.lastName;
      
      await db
        .update(users)
        .set(userUpdates)
        .where(eq(users.id, userId));
    }

    // Get the updated user
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        status: users.status,
        organizationId: users.organizationId,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error('Manager not found');
    }

    // Update manager account if managerRole is specified
    let managerAccount: ManagerAccount | null = null;
    if (updates.managerRole) {
      const [existing] = await db
        .select()
        .from(managerAccounts)
        .where(and(
          eq(managerAccounts.userId, userId),
          eq(managerAccounts.organizationId, user.organizationId)
        ));

      if (existing) {
        [managerAccount] = await db
          .update(managerAccounts)
          .set({ managerRole: updates.managerRole, updatedAt: new Date() })
          .where(eq(managerAccounts.id, existing.id))
          .returning();
      }
    }

    await this.logAction(superAdminId, 'MANAGER_UPDATED', 'manager', userId, { updates });

    return { user, managerAccount };
  }

  // Wrapper for logTenantActivity - used by routes
  async logTenantActivity(
    organizationId: string,
    eventType: string,
    title: string,
    description?: string,
    actorId?: string,
    actorType?: string,
    metadata?: Record<string, any>,
    importance?: string
  ): Promise<TenantActivityTimelineEntry> {
    return this.addTenantActivity(
      organizationId,
      eventType,
      title,
      description,
      actorId,
      actorType,
      metadata,
      importance
    );
  }

  async updateManagerAccount(
    superAdminId: string,
    managerId: string,
    updates: {
      managerRole?: 'primary' | 'secondary' | 'readonly';
      phoneNumber?: string;
      jobTitle?: string;
      department?: string;
      permissions?: ManagerAccount['permissions'];
    }
  ): Promise<ManagerAccount> {
    const [result] = await db
      .update(managerAccounts)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(managerAccounts.id, managerId))
      .returning();

    if (!result) {
      throw new Error('Manager account not found');
    }

    await this.logAction(superAdminId, 'MANAGER_UPDATED', 'manager', managerId, {
      updates,
    });

    return result;
  }

  async resetManagerPassword(
    superAdminId: string,
    userId: string
  ): Promise<{ tempPassword: string }> {
    const tempPassword = crypto.randomBytes(12).toString('base64');
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    await db
      .update(users)
      .set({
        passwordHash,
        forcePasswordReset: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await this.logAction(superAdminId, 'MANAGER_PASSWORD_RESET', 'manager', userId, {});

    return { tempPassword };
  }

  async suspendManager(
    superAdminId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    await db
      .update(users)
      .set({
        status: 'inactive',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await this.logAction(superAdminId, 'MANAGER_SUSPENDED', 'manager', userId, { reason });
  }

  async activateManager(
    superAdminId: string,
    userId: string
  ): Promise<void> {
    await db
      .update(users)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await this.logAction(superAdminId, 'MANAGER_ACTIVATED', 'manager', userId, {});
  }

  async getManagerActivityLogs(managerId: string, options: {
    page?: number;
    limit?: number;
    action?: string;
  } = {}): Promise<{ logs: any[]; total: number }> {
    const { page = 1, limit = 50, action } = options;

    const conditions: any[] = [eq(managerActivityLogs.managerId, managerId)];

    if (action) {
      conditions.push(eq(managerActivityLogs.action, action));
    }

    const logs = await db
      .select()
      .from(managerActivityLogs)
      .where(and(...conditions))
      .orderBy(desc(managerActivityLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ total }] = await db
      .select({ total: count() })
      .from(managerActivityLogs)
      .where(and(...conditions));

    return { logs, total };
  }
}

export const superAdminService = new SuperAdminService();
