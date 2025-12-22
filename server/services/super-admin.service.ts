import { db } from '../db';
import { 
  superAdmins, 
  superAdminSessions, 
  superAdminAuditLogs,
  organizations,
  tenantSettings,
  users,
  impersonationLogs,
  type SuperAdmin,
  type TenantSettings
} from '@shared/schema';
import { eq, and, desc, count, sql, like, or, isNull } from 'drizzle-orm';
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
}

export const superAdminService = new SuperAdminService();
