import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { 
  tenantSettings, 
  tenantConfiguration, 
  users, 
  prospects, 
  sequences, 
  emailMailboxes 
} from '@shared/schema';
import { eq, and, count, sql } from 'drizzle-orm';

export interface QuotaCheckResult {
  allowed: boolean;
  resource: string;
  current: number;
  limit: number;
  message?: string;
}

async function getTenantLimits(organizationId: string): Promise<{
  maxUsers: number;
  maxProspects: number;
  maxSequences: number;
  maxMailboxes: number;
  maxDailyEmails: number;
}> {
  const [settings] = await db
    .select({
      maxUsers: tenantSettings.maxUsers,
      maxProspects: tenantSettings.maxProspects,
      maxSequences: tenantSettings.maxSequences,
      maxMailboxes: tenantSettings.maxMailboxes,
    })
    .from(tenantSettings)
    .where(eq(tenantSettings.organizationId, organizationId));

  const [config] = await db
    .select({
      maxUsers: tenantConfiguration.maxUsers,
      maxProspects: tenantConfiguration.maxProspects,
      maxSequences: tenantConfiguration.maxSequences,
      maxMailboxes: tenantConfiguration.maxMailboxes,
      maxDailyEmails: tenantConfiguration.maxDailyEmails,
    })
    .from(tenantConfiguration)
    .where(eq(tenantConfiguration.organizationId, organizationId));

  const defaultLimits = {
    maxUsers: 5,
    maxProspects: 1000,
    maxSequences: 10,
    maxMailboxes: 3,
    maxDailyEmails: 500,
  };

  return {
    maxUsers: config?.maxUsers || settings?.maxUsers || defaultLimits.maxUsers,
    maxProspects: config?.maxProspects || settings?.maxProspects || defaultLimits.maxProspects,
    maxSequences: config?.maxSequences || settings?.maxSequences || defaultLimits.maxSequences,
    maxMailboxes: config?.maxMailboxes || settings?.maxMailboxes || defaultLimits.maxMailboxes,
    maxDailyEmails: config?.maxDailyEmails || defaultLimits.maxDailyEmails,
  };
}

async function getCurrentUsage(organizationId: string): Promise<{
  users: number;
  prospects: number;
  sequences: number;
  mailboxes: number;
}> {
  const [userCount] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.organizationId, organizationId));

  const userIds = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.organizationId, organizationId));
  
  const userIdList = userIds.map(u => u.id);

  let prospectCountValue = 0;
  let sequenceCount = 0;
  let mailboxCount = 0;

  if (userIdList.length > 0) {
    const [prospectResult] = await db
      .select({ count: count() })
      .from(prospects)
      .where(sql`${prospects.userId} IN (${sql.join(userIdList.map(id => sql`${id}`), sql`, `)})`);
    prospectCountValue = Number(prospectResult?.count || 0);

    const [seqCount] = await db
      .select({ count: count() })
      .from(sequences)
      .where(sql`${sequences.userId} IN (${sql.join(userIdList.map(id => sql`${id}`), sql`, `)})`);
    sequenceCount = Number(seqCount?.count || 0);

    const [mbCount] = await db
      .select({ count: count() })
      .from(emailMailboxes)
      .where(sql`${emailMailboxes.userId} IN (${sql.join(userIdList.map(id => sql`${id}`), sql`, `)})`);
    mailboxCount = Number(mbCount?.count || 0);
  }

  return {
    users: Number(userCount?.count || 0),
    prospects: prospectCountValue,
    sequences: sequenceCount,
    mailboxes: mailboxCount,
  };
}

export async function checkQuota(
  organizationId: string,
  resource: 'users' | 'prospects' | 'sequences' | 'mailboxes',
  incrementBy: number = 1
): Promise<QuotaCheckResult> {
  const limits = await getTenantLimits(organizationId);
  const usage = await getCurrentUsage(organizationId);

  const resourceLimitMap: Record<string, { current: number; limit: number }> = {
    users: { current: usage.users, limit: limits.maxUsers },
    prospects: { current: usage.prospects, limit: limits.maxProspects },
    sequences: { current: usage.sequences, limit: limits.maxSequences },
    mailboxes: { current: usage.mailboxes, limit: limits.maxMailboxes },
  };

  const { current, limit } = resourceLimitMap[resource];
  const projectedTotal = current + incrementBy;

  if (projectedTotal > limit) {
    return {
      allowed: false,
      resource,
      current,
      limit,
      message: `${resource} quota exceeded. Current: ${current}, Limit: ${limit}. Trying to add: ${incrementBy}`,
    };
  }

  return {
    allowed: true,
    resource,
    current,
    limit,
  };
}

export function enforceUserQuota(req: Request, res: Response, next: NextFunction) {
  enforceQuota('users')(req, res, next);
}

export function enforceProspectQuota(req: Request, res: Response, next: NextFunction) {
  enforceQuota('prospects')(req, res, next);
}

export function enforceSequenceQuota(req: Request, res: Response, next: NextFunction) {
  enforceQuota('sequences')(req, res, next);
}

export function enforceMailboxQuota(req: Request, res: Response, next: NextFunction) {
  enforceQuota('mailboxes')(req, res, next);
}

function enforceQuota(resource: 'users' | 'prospects' | 'sequences' | 'mailboxes') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      
      if (!organizationId) {
        return res.status(403).json({ 
          error: 'Organization context required for quota check',
          code: 'NO_ORGANIZATION_CONTEXT'
        });
      }

      const incrementBy = req.body?.count || 1;
      const quotaCheck = await checkQuota(organizationId, resource, incrementBy);

      if (!quotaCheck.allowed) {
        return res.status(429).json({
          error: quotaCheck.message,
          code: 'QUOTA_EXCEEDED',
          details: {
            resource: quotaCheck.resource,
            current: quotaCheck.current,
            limit: quotaCheck.limit,
          }
        });
      }

      (req as any).quotaInfo = quotaCheck;
      next();
    } catch (error) {
      console.error('Quota enforcement error:', error);
      next();
    }
  };
}

export function enforceBulkProspectQuota(req: Request, res: Response, next: NextFunction) {
  return (async () => {
    try {
      const organizationId = req.user?.organizationId;
      
      if (!organizationId) {
        return res.status(403).json({ 
          error: 'Organization context required for quota check',
          code: 'NO_ORGANIZATION_CONTEXT'
        });
      }

      const prospectCount = Array.isArray(req.body?.prospects) 
        ? req.body.prospects.length 
        : (req.body?.count || 1);

      const quotaCheck = await checkQuota(organizationId, 'prospects', prospectCount);

      if (!quotaCheck.allowed) {
        return res.status(429).json({
          error: quotaCheck.message,
          code: 'QUOTA_EXCEEDED',
          details: {
            resource: 'prospects',
            current: quotaCheck.current,
            limit: quotaCheck.limit,
            requestedCount: prospectCount,
          }
        });
      }

      (req as any).quotaInfo = quotaCheck;
      next();
    } catch (error) {
      console.error('Bulk quota enforcement error:', error);
      next();
    }
  })();
}

export async function getQuotaStatus(organizationId: string): Promise<{
  users: QuotaCheckResult;
  prospects: QuotaCheckResult;
  sequences: QuotaCheckResult;
  mailboxes: QuotaCheckResult;
}> {
  const limits = await getTenantLimits(organizationId);
  const usage = await getCurrentUsage(organizationId);

  return {
    users: {
      allowed: usage.users < limits.maxUsers,
      resource: 'users',
      current: usage.users,
      limit: limits.maxUsers,
    },
    prospects: {
      allowed: usage.prospects < limits.maxProspects,
      resource: 'prospects',
      current: usage.prospects,
      limit: limits.maxProspects,
    },
    sequences: {
      allowed: usage.sequences < limits.maxSequences,
      resource: 'sequences',
      current: usage.sequences,
      limit: limits.maxSequences,
    },
    mailboxes: {
      allowed: usage.mailboxes < limits.maxMailboxes,
      resource: 'mailboxes',
      current: usage.mailboxes,
      limit: limits.maxMailboxes,
    },
  };
}

export { getTenantLimits, getCurrentUsage };
