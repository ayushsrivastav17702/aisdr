import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { superAdmins, superAdminSessions } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SESSION_SECRET || 'super-admin-secret-key';

export interface SuperAdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  isMasterAdmin: boolean;
  permissions: {
    canProvisionTenants?: boolean;
    canManageBilling?: boolean;
    canImpersonateManagers?: boolean;
    canSuspendTenants?: boolean;
    canDeleteTenants?: boolean;
    canViewAllData?: boolean;
  } | null;
}

declare global {
  namespace Express {
    interface Request {
      superAdmin?: SuperAdminUser;
      superAdminSessionId?: string;
    }
  }
}

export async function authenticateSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.super_admin_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Super Admin authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { 
      superAdminId: string; 
      sessionId: string;
      type: string;
    };
    
    if (decoded.type !== 'super_admin') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const [session] = await db
      .select()
      .from(superAdminSessions)
      .where(and(
        eq(superAdminSessions.id, decoded.sessionId),
        eq(superAdminSessions.superAdminId, decoded.superAdminId),
        eq(superAdminSessions.isActive, true),
        gt(superAdminSessions.expiresAt, new Date())
      ));

    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    const [superAdmin] = await db
      .select()
      .from(superAdmins)
      .where(and(
        eq(superAdmins.id, decoded.superAdminId),
        eq(superAdmins.status, 'active')
      ));

    if (!superAdmin) {
      return res.status(401).json({ error: 'Super Admin account not found or inactive' });
    }

    await db
      .update(superAdminSessions)
      .set({ lastActivity: new Date() })
      .where(eq(superAdminSessions.id, session.id));

    req.superAdmin = {
      id: superAdmin.id,
      email: superAdmin.email,
      firstName: superAdmin.firstName,
      lastName: superAdmin.lastName,
      status: superAdmin.status || 'active',
      isMasterAdmin: superAdmin.isMasterAdmin || false,
      permissions: superAdmin.permissions,
    };
    req.superAdminSessionId = session.id;
    
    next();
  } catch (error) {
    console.error('Super Admin authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.superAdmin) {
    return res.status(401).json({ error: 'Super Admin authentication required' });
  }

  if (!req.superAdmin.isMasterAdmin) {
    return res.status(403).json({ error: 'Master Admin access required' });
  }

  next();
}

export function requireSuperAdminPermission(permission: keyof NonNullable<SuperAdminUser['permissions']>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.superAdmin) {
      return res.status(401).json({ error: 'Super Admin authentication required' });
    }

    if (req.superAdmin.isMasterAdmin) {
      return next();
    }

    if (!req.superAdmin.permissions?.[permission]) {
      return res.status(403).json({ error: `Permission required: ${permission}` });
    }

    next();
  };
}
