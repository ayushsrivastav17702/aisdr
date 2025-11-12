import { db } from '../db';
import { auditLogs, type InsertAuditLog } from '@shared/schema';
import type { Request } from 'express';

export interface AuditLogData {
  userId?: string;
  action: string;
  module?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

class AuditService {
  async log(data: AuditLogData): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        userId: data.userId || null,
        action: data.action,
        module: data.module || null,
        details: data.details ? JSON.stringify(data.details) : null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  logFromRequest(req: Request, action: string, module?: string, details?: Record<string, any>): void {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                      req.socket.remoteAddress || 
                      'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    this.log({
      userId: req.user?.id,
      action,
      module,
      details,
      ipAddress,
      userAgent,
    }).catch(err => {
      console.error('Async audit log failed:', err);
    });
  }

  logImpersonation(req: Request, actingAsUserId: string): void {
    this.logFromRequest(
      req,
      'ADMIN_IMPERSONATION',
      'auth',
      {
        adminUserId: req.user?.id,
        adminEmail: req.user?.email,
        actingAsUserId,
        timestamp: new Date().toISOString(),
      }
    );
  }

  logAuth(req: Request, action: 'LOGIN' | 'LOGOUT' | 'PASSWORD_RESET' | 'INVITATION_ACCEPTED', details?: Record<string, any>): void {
    this.logFromRequest(req, action, 'auth', details);
  }

  logUserAction(req: Request, action: string, details?: Record<string, any>): void {
    this.logFromRequest(req, action, 'user_management', details);
  }

  logDataModification(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entity: string, entityId: string, details?: Record<string, any>): void {
    this.logFromRequest(
      req,
      `${action}_${entity.toUpperCase()}`,
      entity,
      {
        entityId,
        ...details,
      }
    );
  }
}

export const auditService = new AuditService();
