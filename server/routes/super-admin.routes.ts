import { Router } from 'express';
import { z } from 'zod';
import { superAdminService } from '../services/super-admin.service';
import { 
  authenticateSuperAdmin, 
  requireMasterAdmin,
  requireSuperAdminPermission 
} from '../middleware/super-admin.middleware';
import { db } from '../db';
import { superAdmins, users, organizations, tenantSettings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const provisionTenantSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255),
  slug: z.string().min(1, 'Slug is required').max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  industry: z.string().max(100).optional().nullable(),
  companySize: z.string().max(50).optional().nullable(),
  plan: z.enum(['trial', 'starter', 'growth', 'enterprise']).default('trial'),
  managerEmail: z.string().email('Invalid manager email'),
  managerFirstName: z.string().max(100).optional().nullable(),
  managerLastName: z.string().max(100).optional().nullable(),
  primaryContactName: z.string().max(200).optional().nullable(),
  primaryContactEmail: z.string().email().optional().nullable(),
  primaryContactPhone: z.string().max(50).optional().nullable(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'trial', 'suspended', 'churned']),
  reason: z.string().max(500).optional(),
});

const updatePlanSchema = z.object({
  plan: z.enum(['trial', 'starter', 'growth', 'enterprise']),
});

const impersonateSchema = z.object({
  targetUserId: z.string().uuid('Invalid target user ID'),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});

const createSuperAdminSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
  isMasterAdmin: z.boolean().default(false),
  permissions: z.object({
    canProvisionTenants: z.boolean().default(false),
    canManageBilling: z.boolean().default(false),
    canImpersonateManagers: z.boolean().default(false),
    canSuspendTenants: z.boolean().default(false),
    canDeleteTenants: z.boolean().default(false),
    canViewAllData: z.boolean().default(false),
  }).optional(),
});

const bootstrapSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
});

router.post('/login', async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => e.message) 
      });
    }

    const { email, password } = validation.data;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await superAdminService.login(email, password, ipAddress, userAgent);

    if (!result) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.cookie('super_admin_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/api/super-admin',
    });

    res.json({
      superAdmin: result.superAdmin,
      expiresAt: result.expiresAt,
    });
  } catch (error: any) {
    console.error('Super Admin login error:', error);
    res.status(401).json({ error: error.message || 'Login failed' });
  }
});

router.post('/logout', authenticateSuperAdmin, async (req, res) => {
  try {
    if (req.superAdmin && req.superAdminSessionId) {
      await superAdminService.logout(req.superAdminSessionId, req.superAdmin.id);
    }

    res.clearCookie('super_admin_token');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Super Admin logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

router.get('/me', authenticateSuperAdmin, async (req, res) => {
  res.json({ superAdmin: req.superAdmin });
});

router.get('/stats', authenticateSuperAdmin, async (req, res) => {
  try {
    const stats = await superAdminService.getPlatformStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({ error: 'Failed to fetch platform stats' });
  }
});

router.get('/tenants', authenticateSuperAdmin, async (req, res) => {
  try {
    const { search, status, plan, page, limit, sortBy, sortOrder } = req.query;

    const result = await superAdminService.getAllTenants({
      search: search as string,
      status: status as string,
      plan: plan as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

router.get('/tenants/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const tenant = await superAdminService.getTenantById(req.params.id);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const managers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        status: users.status,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(
        eq(users.organizationId, req.params.id),
        eq(users.role, 'admin')
      ));

    res.json({ ...tenant, managers });
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

router.post('/tenants', authenticateSuperAdmin, requireSuperAdminPermission('canProvisionTenants'), async (req, res) => {
  try {
    const validation = provisionTenantSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
      });
    }

    // Transform null values to undefined for service compatibility
    const data = {
      ...validation.data,
      industry: validation.data.industry ?? undefined,
      companySize: validation.data.companySize ?? undefined,
      managerFirstName: validation.data.managerFirstName ?? undefined,
      managerLastName: validation.data.managerLastName ?? undefined,
      primaryContactName: validation.data.primaryContactName ?? undefined,
      primaryContactEmail: validation.data.primaryContactEmail ?? undefined,
      primaryContactPhone: validation.data.primaryContactPhone ?? undefined,
    };
    const result = await superAdminService.provisionTenant(req.superAdmin!.id, data);

    res.status(201).json({
      message: 'Tenant provisioned successfully',
      ...result,
    });
  } catch (error: any) {
    console.error('Error provisioning tenant:', error);
    res.status(400).json({ error: error.message || 'Failed to provision tenant' });
  }
});

router.patch('/tenants/:id/status', authenticateSuperAdmin, requireSuperAdminPermission('canSuspendTenants'), async (req, res) => {
  try {
    const validation = updateStatusSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => e.message) 
      });
    }

    const { status, reason } = validation.data;
    const settings = await superAdminService.updateTenantStatus(
      req.superAdmin!.id,
      req.params.id,
      status,
      reason
    );

    res.json(settings);
  } catch (error) {
    console.error('Error updating tenant status:', error);
    res.status(500).json({ error: 'Failed to update tenant status' });
  }
});

router.patch('/tenants/:id/plan', authenticateSuperAdmin, requireSuperAdminPermission('canManageBilling'), async (req, res) => {
  try {
    const validation = updatePlanSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => e.message) 
      });
    }

    const { plan } = validation.data;
    const settings = await superAdminService.updateTenantPlan(
      req.superAdmin!.id,
      req.params.id,
      plan
    );

    res.json(settings);
  } catch (error) {
    console.error('Error updating tenant plan:', error);
    res.status(500).json({ error: 'Failed to update tenant plan' });
  }
});

router.patch('/tenants/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const allowedOrgFields = ['name', 'industry', 'companySize', 'website', 'phone', 'address', 'city', 'state', 'country'];
    const allowedSettingsFields = ['primaryContactName', 'primaryContactEmail', 'primaryContactPhone', 'billingEmail', 'internalNotes'];

    const orgUpdates: Record<string, any> = { updatedAt: new Date() };
    const settingsUpdates: Record<string, any> = { updatedAt: new Date() };

    for (const [key, value] of Object.entries(req.body)) {
      if (allowedOrgFields.includes(key)) {
        orgUpdates[key] = value;
      } else if (allowedSettingsFields.includes(key)) {
        settingsUpdates[key] = value;
      }
    }

    if (Object.keys(orgUpdates).length > 1) {
      await db
        .update(organizations)
        .set(orgUpdates)
        .where(eq(organizations.id, req.params.id));
    }

    if (Object.keys(settingsUpdates).length > 1) {
      await db
        .update(tenantSettings)
        .set(settingsUpdates)
        .where(eq(tenantSettings.organizationId, req.params.id));
    }

    const tenant = await superAdminService.getTenantById(req.params.id);
    res.json(tenant);
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

router.delete('/tenants/:id', authenticateSuperAdmin, requireSuperAdminPermission('canDeleteTenants'), async (req, res) => {
  try {
    await db
      .update(organizations)
      .set({ status: 'archived' })
      .where(eq(organizations.id, req.params.id));

    await superAdminService.updateTenantStatus(
      req.superAdmin!.id,
      req.params.id,
      'churned',
      'Deleted by super admin'
    );

    await superAdminService['logAction'](
      req.superAdmin!.id,
      'TENANT_DELETED',
      'tenant',
      req.params.id,
      { reason: req.body.reason || 'Deleted by super admin' }
    );

    res.json({ success: true, message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

// Phase 2: Detailed tenant profile (FR-SA3)
router.get('/tenants/:id/details', authenticateSuperAdmin, async (req, res) => {
  try {
    const details = await superAdminService.getTenantDetailedProfile(req.params.id);
    res.json(details);
  } catch (error: any) {
    console.error('Error fetching tenant details:', error);
    res.status(error.message === 'Tenant not found' ? 404 : 500).json({ 
      error: error.message || 'Failed to fetch tenant details' 
    });
  }
});

// Phase 2: Tenant users list (FR-SA3)
router.get('/tenants/:id/users', authenticateSuperAdmin, async (req, res) => {
  try {
    const { page, limit, role, search } = req.query;
    const result = await superAdminService.getTenantUsers(req.params.id, {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      role: role as string,
      search: search as string,
    });
    res.json(result);
  } catch (error) {
    console.error('Error fetching tenant users:', error);
    res.status(500).json({ error: 'Failed to fetch tenant users' });
  }
});

// Phase 2: Tenant activity timeline (FR-SA3)
router.get('/tenants/:id/activity', authenticateSuperAdmin, async (req, res) => {
  try {
    const { limit, page, eventType } = req.query;
    const result = await superAdminService.getTenantActivityTimeline(req.params.id, {
      limit: limit ? parseInt(limit as string) : 50,
      page: page ? parseInt(page as string) : 1,
      eventType: eventType as string,
    });
    res.json(result);
  } catch (error) {
    console.error('Error fetching tenant activity:', error);
    res.status(500).json({ error: 'Failed to fetch tenant activity' });
  }
});

// Phase 2: Update tenant configuration (FR-SA4)
const updateConfigurationSchema = z.object({
  maxUsers: z.number().min(1).optional(),
  maxProspects: z.number().min(100).optional(),
  maxSequences: z.number().min(1).optional(),
  maxMailboxes: z.number().min(1).optional(),
  maxDailyEmails: z.number().min(10).optional(),
  maxHourlyEmails: z.number().min(1).optional(),
  storageQuotaMb: z.number().min(100).optional(),
  apiRateLimitPerMinute: z.number().min(10).optional(),
  retentionDays: z.number().min(30).optional(),
  customDomainEnabled: z.boolean().optional(),
  whitelabelEnabled: z.boolean().optional(),
  customBranding: z.object({
    primaryColor: z.string().optional(),
    logoUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
  }).optional(),
});

router.patch('/tenants/:id/configuration', authenticateSuperAdmin, requireSuperAdminPermission('canManageBilling'), async (req, res) => {
  try {
    const validation = updateConfigurationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
      });
    }

    const config = await superAdminService.updateTenantConfiguration(
      req.superAdmin!.id,
      req.params.id,
      validation.data
    );
    res.json(config);
  } catch (error: any) {
    console.error('Error updating tenant configuration:', error);
    res.status(500).json({ error: error.message || 'Failed to update tenant configuration' });
  }
});

// Phase 2: Update tenant feature flags (FR-SA4)
// Keys match database schema column names (camelCase from Drizzle)
const updateFeatureFlagsSchema = z.object({
  aiProspecting: z.boolean().optional(),
  aiEmailGeneration: z.boolean().optional(),
  aiSentimentAnalysis: z.boolean().optional(),
  advancedAnalytics: z.boolean().optional(),
  customReports: z.boolean().optional(),
  exportCapabilities: z.boolean().optional(),
  whiteLabel: z.boolean().optional(),
  customBranding: z.boolean().optional(),
  customDomain: z.boolean().optional(),
  crmIntegration: z.boolean().optional(),
  webhookAccess: z.boolean().optional(),
  apiAccess: z.boolean().optional(),
  multiMailbox: z.boolean().optional(),
  emailSequences: z.boolean().optional(),
  bulkOperations: z.boolean().optional(),
});

router.patch('/tenants/:id/features', authenticateSuperAdmin, requireSuperAdminPermission('canManageBilling'), async (req, res) => {
  try {
    const validation = updateFeatureFlagsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
      });
    }

    const features = await superAdminService.updateTenantFeatureFlags(
      req.superAdmin!.id,
      req.params.id,
      validation.data
    );
    res.json(features);
  } catch (error: any) {
    console.error('Error updating tenant features:', error);
    res.status(500).json({ error: error.message || 'Failed to update tenant features' });
  }
});

// Phase 2: Create manager for tenant (FR-SA7, FR-SA8)
const createManagerSchema = z.object({
  email: z.string().email('Invalid email format'),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  managerRole: z.enum(['primary', 'secondary', 'readonly']).default('secondary'),
  sendInviteEmail: z.boolean().default(true),
});

router.post('/tenants/:id/managers', authenticateSuperAdmin, requireSuperAdminPermission('canProvisionTenants'), async (req, res) => {
  try {
    const validation = createManagerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
      });
    }

    const result = await superAdminService.createManagerForTenant(
      req.superAdmin!.id,
      req.params.id,
      validation.data
    );

    res.status(201).json({
      message: 'Manager created successfully',
      ...result,
    });
  } catch (error: any) {
    console.error('Error creating manager:', error);
    res.status(400).json({ error: error.message || 'Failed to create manager' });
  }
});

// Phase 2: List all managers across tenants (FR-SA10)
router.get('/managers', authenticateSuperAdmin, async (req, res) => {
  try {
    const { search, status, organizationId, page, limit } = req.query;

    const result = await superAdminService.getAllManagers({
      search: search as string,
      status: status as string,
      organizationId: organizationId as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching managers:', error);
    res.status(500).json({ error: 'Failed to fetch managers' });
  }
});

// Phase 2: Update manager (FR-SA8)
router.patch('/managers/:userId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { status, managerRole, firstName, lastName } = req.body;
    
    const result = await superAdminService.updateManager(
      req.superAdmin!.id,
      req.params.userId,
      { status, managerRole, firstName, lastName }
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error updating manager:', error);
    res.status(400).json({ error: error.message || 'Failed to update manager' });
  }
});

// Phase 2: Reset manager password (FR-SA8)
router.post('/managers/:userId/reset-password', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await superAdminService.resetManagerPassword(
      req.superAdmin!.id,
      req.params.userId
    );

    res.json({
      message: 'Password reset successfully',
      tempPassword: result.tempPassword,
    });
  } catch (error: any) {
    console.error('Error resetting manager password:', error);
    res.status(400).json({ error: error.message || 'Failed to reset password' });
  }
});

// Phase 2: Log manager activity (internal use)
router.post('/tenants/:id/activity', authenticateSuperAdmin, async (req, res) => {
  try {
    const { eventType, title, description, importance } = req.body;
    
    await superAdminService.logTenantActivity(
      req.params.id,
      eventType,
      title,
      description,
      req.superAdmin!.id,
      'super_admin',
      {},
      importance || 'normal'
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

router.post('/tenants/:id/impersonate', authenticateSuperAdmin, requireSuperAdminPermission('canImpersonateManagers'), async (req, res) => {
  try {
    const validation = impersonateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => e.message) 
      });
    }

    const { targetUserId, reason } = validation.data;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await superAdminService.startImpersonation(
      req.superAdmin!.id,
      req.params.id,
      targetUserId,
      reason,
      ipAddress,
      userAgent
    );

    res.json({
      message: 'Impersonation started',
      impersonationToken: result.impersonationToken,
      impersonationLogId: result.impersonationLogId,
    });
  } catch (error: any) {
    console.error('Error starting impersonation:', error);
    res.status(400).json({ error: error.message || 'Failed to start impersonation' });
  }
});

router.post('/impersonation/:logId/end', authenticateSuperAdmin, async (req, res) => {
  try {
    await superAdminService.endImpersonation(req.params.logId, req.superAdmin!.id);
    res.json({ success: true, message: 'Impersonation ended' });
  } catch (error) {
    console.error('Error ending impersonation:', error);
    res.status(500).json({ error: 'Failed to end impersonation' });
  }
});

router.get('/audit-logs', authenticateSuperAdmin, async (req, res) => {
  try {
    const { superAdminId, action, targetType, page, limit } = req.query;

    const result = await superAdminService.getAuditLogs({
      superAdminId: superAdminId as string,
      action: action as string,
      targetType: targetType as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.get('/super-admins', authenticateSuperAdmin, requireMasterAdmin, async (req, res) => {
  try {
    const admins = await db
      .select({
        id: superAdmins.id,
        email: superAdmins.email,
        firstName: superAdmins.firstName,
        lastName: superAdmins.lastName,
        status: superAdmins.status,
        isMasterAdmin: superAdmins.isMasterAdmin,
        permissions: superAdmins.permissions,
        lastLogin: superAdmins.lastLogin,
        createdAt: superAdmins.createdAt,
      })
      .from(superAdmins);

    res.json({ superAdmins: admins });
  } catch (error) {
    console.error('Error fetching super admins:', error);
    res.status(500).json({ error: 'Failed to fetch super admins' });
  }
});

router.post('/super-admins', authenticateSuperAdmin, requireMasterAdmin, async (req, res) => {
  try {
    const validation = createSuperAdminSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
      });
    }

    // Transform null values to undefined for service compatibility
    const data = {
      ...validation.data,
      firstName: validation.data.firstName ?? undefined,
      lastName: validation.data.lastName ?? undefined,
    };
    const superAdmin = await superAdminService.createSuperAdmin(
      data,
      req.superAdmin!.id
    );

    res.status(201).json(superAdmin);
  } catch (error: any) {
    console.error('Error creating super admin:', error);
    res.status(400).json({ error: error.message || 'Failed to create super admin' });
  }
});

router.patch('/super-admins/:id', authenticateSuperAdmin, requireMasterAdmin, async (req, res) => {
  try {
    const { firstName, lastName, status, isMasterAdmin, permissions } = req.body;

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (status !== undefined) updateData.status = status;
    if (isMasterAdmin !== undefined) updateData.isMasterAdmin = isMasterAdmin;
    if (permissions !== undefined) updateData.permissions = permissions;

    const [updated] = await db
      .update(superAdmins)
      .set(updateData)
      .where(eq(superAdmins.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Super admin not found' });
    }

    const { passwordHash: _, ...result } = updated;
    res.json(result);
  } catch (error) {
    console.error('Error updating super admin:', error);
    res.status(500).json({ error: 'Failed to update super admin' });
  }
});

router.post('/super-admins/:id/reset-password', authenticateSuperAdmin, requireMasterAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(superAdmins)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(superAdmins.id, req.params.id));

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.post('/bootstrap', async (req, res) => {
  try {
    const existingAdmins = await db.select().from(superAdmins).limit(1);
    
    if (existingAdmins.length > 0) {
      return res.status(400).json({ error: 'Super admins already exist. Bootstrap is not allowed.' });
    }

    const validation = bootstrapSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors.map(e => e.message) 
      });
    }

    const { email, password, firstName, lastName } = validation.data;

    const superAdmin = await superAdminService.createSuperAdmin({
      email,
      password,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      isMasterAdmin: true,
      permissions: {
        canProvisionTenants: true,
        canManageBilling: true,
        canImpersonateManagers: true,
        canSuspendTenants: true,
        canDeleteTenants: true,
        canViewAllData: true,
      },
    });

    res.status(201).json({
      message: 'Master Super Admin created successfully',
      superAdmin,
    });
  } catch (error: any) {
    console.error('Error bootstrapping super admin:', error);
    res.status(400).json({ error: error.message || 'Failed to bootstrap super admin' });
  }
});

export default router;
