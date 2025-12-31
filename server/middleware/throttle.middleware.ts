import { Request, Response, NextFunction } from 'express';
import { hardeningService } from '../services/hardening.service';
import { observability } from '../services/observability.service';

declare global {
  namespace Express {
    interface Request {
      throttleInfo?: {
        allowed: boolean;
        currentCount: number;
        limit: number;
      };
    }
  }
}

export async function checkAutomationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return next();
    }
    
    const isPaused = await hardeningService.isAutomationPaused(organizationId);
    
    if (isPaused) {
      return res.status(503).json({
        error: 'Automation paused',
        message: 'Email sending, AI enrichment, and sequence execution are temporarily paused for this organization. Read access is still available.',
        code: 'AUTOMATION_PAUSED',
      });
    }
    
    next();
  } catch (error) {
    console.error('Error checking automation status:', error);
    next();
  }
}

export function throttleOperation(counterType: 'emails' | 'ai_calls' | 'enrollments' | 'prospects') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      
      if (!organizationId) {
        return next();
      }
      
      const userId = req.user?.id;
      const { allowed, currentCount, limit } = await hardeningService.checkThrottleLimit(
        organizationId,
        counterType,
        userId
      );
      
      req.throttleInfo = { allowed, currentCount, limit };
      
      if (!allowed) {
        // Emit throttle violation event for observability
        observability.emitThrottleViolation({
          organizationId,
          userId,
          counterType,
          currentCount,
          limit,
        });
        
        const periodName = ['enrollments', 'prospects'].includes(counterType) ? 'hour' : 'minute';
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `You have exceeded the ${counterType.replace('_', ' ')} limit of ${limit} per ${periodName}. Current usage: ${currentCount}.`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: ['enrollments', 'prospects'].includes(counterType) ? 3600 : 60,
        });
      }
      
      next();
    } catch (error) {
      console.error('Error checking throttle limit:', error);
      next();
    }
  };
}

export async function incrementThrottle(
  organizationId: string,
  counterType: 'emails' | 'ai_calls' | 'enrollments' | 'prospects',
  incrementBy: number = 1,
  userId?: string
): Promise<void> {
  try {
    await hardeningService.incrementThrottleCounter(organizationId, counterType, userId, incrementBy);
  } catch (error) {
    console.error('Error incrementing throttle counter:', error);
  }
}

export async function trackUsage(
  organizationId: string,
  counterType: string,
  incrementBy: number = 1,
  costUsd: number = 0,
  userId?: string
): Promise<void> {
  try {
    await hardeningService.incrementUsageCounter(
      organizationId,
      counterType,
      'daily',
      incrementBy,
      costUsd,
      userId
    );
  } catch (error) {
    console.error('Error tracking usage:', error);
  }
}

export function checkManagerQuota(resourceType: 'users' | 'prospects' | 'sequences' | 'activeSequences' | 'activeCampaigns') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user || user.role !== 'manager') {
        return next();
      }
      
      const { allowed, current, limit } = await hardeningService.checkManagerQuota(user.id, resourceType);
      
      if (!allowed) {
        return res.status(403).json({
          error: 'Quota exceeded',
          message: `You have reached your ${resourceType} limit of ${limit}. Current usage: ${current}.`,
          code: 'QUOTA_EXCEEDED',
        });
      }
      
      next();
    } catch (error) {
      console.error('Error checking manager quota:', error);
      next();
    }
  };
}

export async function checkManagerPause(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    
    if (!user?.id) {
      return next();
    }
    
    // If user is a manager, check if they themselves are paused
    if (user.role === 'manager') {
      const paused = await hardeningService.isManagerPaused(user.id);
      if (paused) {
        const quota = await hardeningService.getManagerQuota(user.id);
        return res.status(503).json({
          error: 'Manager paused',
          message: quota?.pausedReason || 'Your account has been paused. All operations are temporarily suspended.',
          code: 'MANAGER_PAUSED',
        });
      }
    } else {
      // For SDRs, check if their manager is paused
      const { paused, reason } = await hardeningService.isUserManagerPaused(user.id);
      if (paused) {
        return res.status(503).json({
          error: 'Manager paused',
          message: reason || 'Your manager has been paused. All SDR operations are temporarily suspended.',
          code: 'MANAGER_PAUSED',
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Error checking manager pause status:', error);
    next();
  }
}

export async function validateProspectUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const prospectCount = req.body?.prospects?.length || req.body?.prospectCount || 0;
    
    if (!user?.id || prospectCount === 0) {
      return next();
    }
    
    // For managers, use their own ID. For SDRs, use their manager's ID.
    const managerId = user.role === 'manager' ? user.id : user.createdBy;
    if (!managerId) {
      return next();
    }
    
    const validation = await hardeningService.validateProspectUpload(managerId, prospectCount);
    
    if (!validation.allowed) {
      return res.status(403).json({
        error: 'Upload validation failed',
        message: validation.reason,
        maxAllowed: validation.maxAllowed,
        code: 'UPLOAD_VALIDATION_FAILED',
      });
    }
    
    next();
  } catch (error) {
    console.error('Error validating prospect upload:', error);
    next();
  }
}

export async function validateCampaignCreation(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    
    if (!user?.id) {
      return next();
    }
    
    // For managers, use their own ID. For SDRs, use their manager's ID.
    const managerId = user.role === 'manager' ? user.id : user.createdBy;
    if (!managerId) {
      return next();
    }
    
    const validation = await hardeningService.validateCampaignCreation(managerId);
    
    if (!validation.allowed) {
      return res.status(403).json({
        error: 'Campaign creation failed',
        message: validation.reason,
        code: 'CAMPAIGN_LIMIT_REACHED',
      });
    }
    
    next();
  } catch (error) {
    console.error('Error validating campaign creation:', error);
    next();
  }
}

export async function validateSequenceCreation(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    
    if (!user?.id) {
      return next();
    }
    
    // For managers, use their own ID. For SDRs, use their manager's ID.
    const managerId = user.role === 'manager' ? user.id : user.createdBy;
    if (!managerId) {
      return next();
    }
    
    const validation = await hardeningService.validateSequenceCreation(managerId);
    
    if (!validation.allowed) {
      return res.status(403).json({
        error: 'Sequence creation failed',
        message: validation.reason,
        code: 'SEQUENCE_LIMIT_REACHED',
      });
    }
    
    next();
  } catch (error) {
    console.error('Error validating sequence creation:', error);
    next();
  }
}

export function requireIdempotencyKey(operation: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      
      if (!idempotencyKey) {
        return res.status(400).json({
          error: 'Missing idempotency key',
          message: 'This operation requires an X-Idempotency-Key header to prevent duplicate requests.',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        });
      }
      
      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;
      
      if (!organizationId || !userId) {
        return next();
      }
      
      const { exists, response } = await hardeningService.checkIdempotencyKey(
        organizationId,
        userId,
        idempotencyKey,
        operation
      );
      
      if (exists && response) {
        return res.status(200).json({
          ...response,
          _idempotent: true,
        });
      }
      
      (req as any).idempotencyKey = idempotencyKey;
      (req as any).idempotencyOperation = operation;
      
      next();
    } catch (error) {
      console.error('Error checking idempotency key:', error);
      next();
    }
  };
}

export async function saveIdempotencyResponse(
  req: Request,
  response: object
): Promise<void> {
  try {
    const idempotencyKey = (req as any).idempotencyKey;
    const operation = (req as any).idempotencyOperation;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    
    if (!idempotencyKey || !organizationId || !userId) {
      return;
    }
    
    await hardeningService.setIdempotencyKey(
      organizationId,
      userId,
      idempotencyKey,
      operation,
      response
    );
  } catch (error) {
    console.error('Error saving idempotency response:', error);
  }
}
