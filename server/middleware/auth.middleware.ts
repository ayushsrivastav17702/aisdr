import { Request, Response, NextFunction } from 'express';
import { authService, AuthUser } from '../services/auth.service';
import { auditService } from '../services/audit.service';
import { RequestContext } from '../storage';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
      userContext?: RequestContext;
    }
  }
}

// ============================================================================
// RBAC PERMISSION SYSTEM (PRD-ALIGNED)
// ============================================================================

// Permission constants
export const PERMISSIONS = {
  // Campaign permissions (User role only)
  CAMPAIGN_CREATE: 'CAMPAIGN_CREATE',
  CAMPAIGN_EDIT_OWN: 'CAMPAIGN_EDIT_OWN',
  CAMPAIGN_VIEW_OWN: 'CAMPAIGN_VIEW_OWN',
  CAMPAIGN_VIEW_TEAM: 'CAMPAIGN_VIEW_TEAM',
  CAMPAIGN_ANALYTICS_BASIC: 'CAMPAIGN_ANALYTICS_BASIC',
  CAMPAIGN_ANALYTICS_TEAM: 'CAMPAIGN_ANALYTICS_TEAM',
  
  // Prospect permissions (User role only)
  PROSPECT_VIEW_OWN: 'PROSPECT_VIEW_OWN',
  PROSPECT_IMPORT: 'PROSPECT_IMPORT',
  PROSPECT_AI_SUGGEST: 'PROSPECT_AI_SUGGEST',
  
  // Sequence/Email permissions (User role only - SDR execution)
  SEQUENCE_CREATE: 'SEQUENCE_CREATE',
  SEQUENCE_EDIT_OWN: 'SEQUENCE_EDIT_OWN',
  EMAIL_SEND: 'EMAIL_SEND',
  AUTOMATION_MANAGE: 'AUTOMATION_MANAGE',
  MAILBOX_MANAGE: 'MAILBOX_MANAGE',
  
  // User management permissions (Manager + Super Admin)
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DISABLE: 'USER_DISABLE',
  USER_VIEW_TEAM: 'USER_VIEW_TEAM',
  
  // Tenant/System permissions (Super Admin only)
  TENANT_CREATE: 'TENANT_CREATE',
  TENANT_CONFIGURE: 'TENANT_CONFIGURE',
  TENANT_SUSPEND: 'TENANT_SUSPEND',
  TENANT_BILLING_VIEW: 'TENANT_BILLING_VIEW',
  AUDIT_LOG_VIEW: 'AUDIT_LOG_VIEW',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Role-Permission Matrix (PRD Source of Truth)
// IMPORTANT: Managers do NOT inherit User permissions
// IMPORTANT: Super Admin does NOT inherit campaign/prospect permissions
export const RBAC_MATRIX: Record<string, Permission[]> = {
  // User role: Full SDR execution capabilities
  user: [
    PERMISSIONS.CAMPAIGN_CREATE,
    PERMISSIONS.CAMPAIGN_EDIT_OWN,
    PERMISSIONS.CAMPAIGN_VIEW_OWN,
    PERMISSIONS.CAMPAIGN_ANALYTICS_BASIC,
    PERMISSIONS.PROSPECT_VIEW_OWN,
    PERMISSIONS.PROSPECT_IMPORT,
    PERMISSIONS.PROSPECT_AI_SUGGEST,
    PERMISSIONS.SEQUENCE_CREATE,
    PERMISSIONS.SEQUENCE_EDIT_OWN,
    PERMISSIONS.EMAIL_SEND,
    PERMISSIONS.AUTOMATION_MANAGE,
    PERMISSIONS.MAILBOX_MANAGE,
  ],
  
  // Manager role: Team oversight only, NO SDR execution
  // NOTE: 'manager' is the canonical role name (DB stores 'admin' for legacy)
  manager: [
    PERMISSIONS.CAMPAIGN_VIEW_TEAM,
    PERMISSIONS.CAMPAIGN_ANALYTICS_TEAM,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DISABLE,
    PERMISSIONS.USER_VIEW_TEAM,
  ],
  
  // Legacy 'admin' alias for backward compatibility
  admin: [
    PERMISSIONS.CAMPAIGN_VIEW_TEAM,
    PERMISSIONS.CAMPAIGN_ANALYTICS_TEAM,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DISABLE,
    PERMISSIONS.USER_VIEW_TEAM,
  ],
  
  // Super Admin role: Platform governance only, NO SDR execution or tenant data access
  super_admin: [
    PERMISSIONS.TENANT_CREATE,
    PERMISSIONS.TENANT_CONFIGURE,
    PERMISSIONS.TENANT_SUSPEND,
    PERMISSIONS.TENANT_BILLING_VIEW,
    PERMISSIONS.AUDIT_LOG_VIEW,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DISABLE,
  ],
};

// Check if a role has a specific permission
export function hasPermission(role: string, permission: Permission): boolean {
  const rolePermissions = RBAC_MATRIX[role] || [];
  return rolePermissions.includes(permission);
}

// Manager role variants that should be blocked from SDR execution
// NOTE: Database stores 'admin', but we normalize to 'manager' in auth responses
const MANAGER_ROLES = ['manager', 'admin', 'tenant_admin', 'org_admin'];

// Super Admin role - platform owner (blocked from ALL SDR execution)
const SUPER_ADMIN_ROLE = 'super_admin';

// Roles blocked from SDR execution (managers AND super_admin per PRD)
const SDR_BLOCKED_ROLES = [...MANAGER_ROLES, SUPER_ADMIN_ROLE];

// Check if a role is a manager (admin role in org context)
export function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.includes(role);
}

// Check if a role is super admin
export function isSuperAdminRole(role: string): boolean {
  return role === SUPER_ADMIN_ROLE;
}

// Check if a role is blocked from SDR execution (managers OR super_admin)
export function isBlockedFromSDR(role: string): boolean {
  return SDR_BLOCKED_ROLES.includes(role);
}

// Check if a role is a regular user (SDR)
export function isUserRole(role: string): boolean {
  return role === 'user';
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  // Try to get token from Authorization header first, then from cookie
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }
  
  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }

  try {
    const user = await authService.validateSession(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const decoded = authService.verifyToken(token);
    req.user = user;
    req.sessionId = decoded?.sessionId;
    
    const actingAs = req.query.actingAs as string | undefined;
    
    if (actingAs && user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can use actingAs' });
    }
    
    if (actingAs) {
      console.log(`🔐 Admin impersonation: ${user.email} (${user.id}) acting as user ${actingAs}`);
      auditService.logImpersonation(req, actingAs);
    }
    
    req.userContext = {
      userId: user.id,
      roles: [user.role],
      actingAs: actingAs,
      organizationId: user.organizationId || undefined
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // Try to get token from Authorization header first, then from cookie
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }
  
  if (!token) {
    return next();
  }

  authService.validateSession(token)
    .then(user => {
      if (user) {
        const decoded = authService.verifyToken(token);
        req.user = user;
        req.sessionId = decoded?.sessionId;
        
        const actingAs = req.query.actingAs as string | undefined;
        
        if (actingAs && user.role !== 'admin') {
          console.warn(`⚠️ Non-admin user ${user.email} attempted to use actingAs`);
          req.userContext = {
            userId: user.id,
            roles: [user.role],
            organizationId: user.organizationId || undefined
          };
        } else {
          if (actingAs) {
            console.log(`🔐 Admin impersonation: ${user.email} (${user.id}) acting as user ${actingAs}`);
            auditService.logImpersonation(req, actingAs);
          }
          req.userContext = {
            userId: user.id,
            roles: [user.role],
            actingAs: actingAs,
            organizationId: user.organizationId || undefined
          };
        }
      }
      next();
    })
    .catch(error => {
      console.error('Optional auth error:', error);
      next();
    });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

export function requireRole(...allowedRoles: Array<'admin' | 'user'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

export function requireActiveStatus(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.status !== 'active') {
    return res.status(403).json({ error: 'Account is not active' });
  }

  next();
}

export function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Managers have role='manager' (normalized from 'admin' in DB)
  // Also accept 'admin' for backward compatibility during transition
  if (req.user.role !== 'manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Manager access required' });
  }

  next();
}

/**
 * Require Super Admin role for platform governance routes.
 * Super Admin can: Tenant provisioning, config, manager creation, audit logs, impersonation
 * Super Admin cannot: Campaigns, Prospects, Emails, Sequences (SDR execution)
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!isSuperAdminRole(req.user.role)) {
    console.warn(`🚫 RBAC: Non-super-admin ${req.user.email} (${req.user.role}) attempted super-admin route: ${req.method} ${req.path}`);
    return res.status(403).json({ 
      error: 'FORBIDDEN',
      message: 'Super Admin access required' 
    });
  }

  next();
}

// ============================================================================
// RBAC ENFORCEMENT MIDDLEWARE (SEV-1 FIX)
// ============================================================================

/**
 * Block Super Admin from ALL SDR routes (both read and write).
 * Per PRD: Super Admin cannot see campaigns, prospects, emails, or sequences.
 * Managers CAN read SDR data (read-only), but Super Admin is completely blocked.
 */
export function blockSuperAdminFromSDR(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (isSuperAdminRole(req.user.role)) {
    console.warn(`🚫 RBAC: Super Admin ${req.user.email} blocked from SDR data access: ${req.method} ${req.path}`);
    return res.status(403).json({ 
      error: 'FORBIDDEN',
      message: 'Super Admins cannot access SDR data. Platform governance features are available at /super-admin.' 
    });
  }

  next();
}

/**
 * Forbid managers AND super_admins from accessing SDR execution routes.
 * Per PRD: Only regular users (role='user') have SDR execution capabilities.
 * 
 * BLOCKED ROLES:
 * - Managers (role='admin' and variants): Team oversight only
 * - Super Admin (role='super_admin'): Platform governance only
 * 
 * IMPORTANT: This check uses the ORIGINAL user's role, not impersonated context.
 * Non-user roles cannot bypass RBAC via actingAs impersonation.
 */
export function forbidManager(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // CRITICAL: Check the ORIGINAL user's role, not impersonated context
  // Managers/Super Admins cannot bypass RBAC by impersonating a user
  const originalRole = req.user.role;
  
  // If original user is blocked from SDR (manager OR super_admin), deny access
  if (isBlockedFromSDR(originalRole)) {
    // Check if they're trying to use impersonation to bypass
    const isImpersonating = req.userContext?.actingAs !== undefined;
    const roleType = isSuperAdminRole(originalRole) ? 'Super Admin' : 'Manager';
    const logMessage = isImpersonating 
      ? `${roleType} ${req.user.email} attempted to bypass RBAC via impersonation`
      : `${roleType} ${req.user.email} blocked from SDR route`;
    
    console.warn(`🚫 RBAC: ${logMessage}: ${req.method} ${req.path}`);
    return res.status(403).json({ 
      error: 'FORBIDDEN',
      message: `${roleType}s cannot access SDR execution features. This action is only available to users.` 
    });
  }

  next();
}

/**
 * Require specific permission to access a route.
 * Uses RBAC_MATRIX to check if user's role has the required permission.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasPermission(req.user.role, permission)) {
      console.warn(`🚫 RBAC: User ${req.user.email} (${req.user.role}) denied permission: ${permission}`);
      return res.status(403).json({ 
        error: 'FORBIDDEN',
        message: 'Insufficient permissions for this action' 
      });
    }

    next();
  };
}

/**
 * Require any of the specified permissions.
 */
export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasAny = permissions.some(p => hasPermission(req.user!.role, p));
    if (!hasAny) {
      console.warn(`🚫 RBAC: User ${req.user.email} (${req.user.role}) denied all permissions: ${permissions.join(', ')}`);
      return res.status(403).json({ 
        error: 'FORBIDDEN',
        message: 'Insufficient permissions for this action' 
      });
    }

    next();
  };
}

/**
 * Only allow users with 'user' role (SDR execution role).
 * This explicitly blocks managers from SDR routes.
 */
export function requireUserRole(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!isUserRole(req.user.role)) {
    console.warn(`🚫 RBAC: Non-user ${req.user.email} (${req.user.role}) blocked from user-only route: ${req.method} ${req.path}`);
    return res.status(403).json({ 
      error: 'FORBIDDEN',
      message: 'This feature is only available to users, not managers' 
    });
  }

  next();
}
