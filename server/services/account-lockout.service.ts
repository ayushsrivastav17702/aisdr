import { auditService } from './audit.service';
import { db } from '../db';
import { accountLockouts } from '@shared/schema';
import { eq, and, gt, lt, sql } from 'drizzle-orm';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // Track attempts within 15 minutes

class AccountLockoutService {
  /**
   * Normalize email for consistent lookups
   */
  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Cleanup expired lockout entries from database
   */
  private async cleanupExpiredEntries(): Promise<void> {
    try {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
      
      // Delete entries where lockout expired AND last attempt is old
      await db.delete(accountLockouts).where(
        and(
          lt(accountLockouts.lastAttemptAt, cutoffTime),
          lt(accountLockouts.lockedUntil, now)
        )
      );
    } catch (error) {
      console.error('Failed to cleanup expired lockouts:', error);
    }
  }

  /**
   * Check if an account is currently locked
   */
  async isLocked(email: string, ipAddress?: string): Promise<boolean> {
    const normalizedEmail = this.normalizeEmail(email);
    
    try {
      const [lockout] = await db
        .select()
        .from(accountLockouts)
        .where(eq(accountLockouts.email, normalizedEmail))
        .limit(1);

      if (!lockout || !lockout.lockedUntil) {
        return false;
      }

      const now = new Date();
      
      // Check if lockout has expired
      if (now > lockout.lockedUntil) {
        // Lockout expired, clear it
        await db
          .update(accountLockouts)
          .set({
            lockedUntil: null,
            failedAttempts: 0,
            updatedAt: now,
          })
          .where(eq(accountLockouts.id, lockout.id));
        
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking lockout status:', error);
      return false; // Fail open on error
    }
  }

  /**
   * Get remaining lockout time in seconds
   */
  async getRemainingLockoutTime(email: string, ipAddress?: string): Promise<number> {
    const normalizedEmail = this.normalizeEmail(email);
    
    try {
      const [lockout] = await db
        .select()
        .from(accountLockouts)
        .where(eq(accountLockouts.email, normalizedEmail))
        .limit(1);

      if (!lockout || !lockout.lockedUntil) {
        return 0;
      }

      const remaining = Math.max(0, lockout.lockedUntil.getTime() - Date.now());
      return Math.ceil(remaining / 1000);
    } catch (error) {
      console.error('Error getting remaining lockout time:', error);
      return 0;
    }
  }

  /**
   * Record a failed login attempt
   * NOTE: Tracks by email ONLY to prevent IP rotation bypass
   * IP is stored for auditing only
   */
  async recordFailedAttempt(
    email: string, 
    ipAddress: string, 
    userId?: string
  ): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const now = new Date();
    
    try {
      // Get existing lockout record
      const [existing] = await db
        .select()
        .from(accountLockouts)
        .where(eq(accountLockouts.email, normalizedEmail))
        .limit(1);

      const cutoffTime = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
      
      // Create new entry or reset if attempt window expired
      if (!existing || (existing.lastAttemptAt && existing.lastAttemptAt < cutoffTime)) {
        if (existing) {
          // Reset existing entry
          await db
            .update(accountLockouts)
            .set({
              failedAttempts: 1,
              lockedUntil: null,
              lastAttemptAt: now,
              recentIPs: [ipAddress],
              updatedAt: now,
            })
            .where(eq(accountLockouts.id, existing.id));
        } else {
          // Create new entry
          await db.insert(accountLockouts).values({
            email: normalizedEmail,
            failedAttempts: 1,
            lockedUntil: null,
            lastAttemptAt: now,
            recentIPs: [ipAddress],
          });
        }
        return;
      }

      // Update existing record
      const recentIPs = Array.isArray(existing.recentIPs) ? [...existing.recentIPs] : [];
      
      // Track IP for auditing (keep last 10 IPs)
      if (!recentIPs.includes(ipAddress)) {
        recentIPs.push(ipAddress);
        if (recentIPs.length > 10) {
          recentIPs.shift();
        }
      }

      const newFailedAttempts = (existing.failedAttempts || 0) + 1;
      let lockedUntil = existing.lockedUntil;

      // Lock account if threshold reached
      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
        
        // Log lockout event
        if (userId) {
          await auditService.log({
            userId,
            action: 'ACCOUNT_LOCKED',
            module: 'auth',
            details: {
              email: normalizedEmail,
              currentIP: ipAddress,
              recentIPs,
              failedAttempts: newFailedAttempts,
              lockedUntil,
              reason: 'Too many failed login attempts',
            },
            ipAddress,
          });
        }

        console.log(`🔒 Account locked: ${normalizedEmail} from ${ipAddress} until ${lockedUntil.toISOString()}`);
      }

      // Update the lockout record
      await db
        .update(accountLockouts)
        .set({
          failedAttempts: newFailedAttempts,
          lockedUntil,
          lastAttemptAt: now,
          recentIPs,
          updatedAt: now,
        })
        .where(eq(accountLockouts.id, existing.id));
    } catch (error) {
      console.error('Error recording failed login attempt:', error);
      throw new Error('Failed to record lockout attempt');
    }

    // Always cleanup after recording attempt
    try {
      await this.cleanupExpiredEntries();
    } catch (cleanupError) {
      console.error('Cleanup failed (non-fatal):', cleanupError);
    }
  }

  /**
   * Reset failed attempts (call on successful login)
   */
  async resetAttempts(email: string, ipAddress?: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    
    try {
      await db
        .delete(accountLockouts)
        .where(eq(accountLockouts.email, normalizedEmail));
    } catch (error) {
      console.error('Error resetting failed attempts:', error);
      throw new Error('Failed to reset lockout attempts');
    }

    // Cleanup expired entries opportunistically
    try {
      await this.cleanupExpiredEntries();
    } catch (cleanupError) {
      console.error('Cleanup failed (non-fatal):', cleanupError);
    }
  }

  /**
   * Get current lockout status for an account
   */
  async getStatus(email: string, ipAddress?: string): Promise<{
    failedAttempts: number;
    isLocked: boolean;
    lockedUntil: Date | null;
    remainingSeconds: number;
    recentIPs: string[];
  }> {
    const normalizedEmail = this.normalizeEmail(email);
    
    try {
      const [lockout] = await db
        .select()
        .from(accountLockouts)
        .where(eq(accountLockouts.email, normalizedEmail))
        .limit(1);

      if (!lockout) {
        return {
          failedAttempts: 0,
          isLocked: false,
          lockedUntil: null,
          remainingSeconds: 0,
          recentIPs: [],
        };
      }

      const isLocked = await this.isLocked(email);
      const remainingSeconds = await this.getRemainingLockoutTime(email);

      return {
        failedAttempts: lockout.failedAttempts || 0,
        isLocked,
        lockedUntil: lockout.lockedUntil,
        remainingSeconds,
        recentIPs: Array.isArray(lockout.recentIPs) ? lockout.recentIPs : [],
      };
    } catch (error) {
      console.error('Error getting lockout status:', error);
      return {
        failedAttempts: 0,
        isLocked: false,
        lockedUntil: null,
        remainingSeconds: 0,
        recentIPs: [],
      };
    }
  }

  /**
   * Clear all lockouts (for testing/admin purposes)
   */
  async clearAll(): Promise<void> {
    try {
      await db.delete(accountLockouts);
    } catch (error) {
      console.error('Error clearing all lockouts:', error);
    }
  }
}

export const accountLockoutService = new AccountLockoutService();
