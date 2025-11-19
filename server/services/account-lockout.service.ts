import { auditService } from './audit.service';

interface LockoutEntry {
  failedAttempts: number;
  lockedUntil: Date | null;
  lastAttempt: Date;
  recentIPs: string[]; // Track IPs for auditing only, not for lockout logic
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // Track attempts within 15 minutes

class AccountLockoutService {
  private lockouts = new Map<string, LockoutEntry>();

  /**
   * Get identifier for lockout tracking (email ONLY to prevent IP rotation bypass)
   */
  private getIdentifier(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Check if an account is currently locked
   */
  isLocked(email: string, ipAddress?: string): boolean {
    const identifier = this.getIdentifier(email);
    const entry = this.lockouts.get(identifier);

    if (!entry || !entry.lockedUntil) {
      return false;
    }

    // Check if lockout has expired
    if (new Date() > entry.lockedUntil) {
      // Lockout expired, clear it
      entry.lockedUntil = null;
      entry.failedAttempts = 0;
      return false;
    }

    return true;
  }

  /**
   * Get remaining lockout time in seconds
   */
  getRemainingLockoutTime(email: string, ipAddress?: string): number {
    const identifier = this.getIdentifier(email);
    const entry = this.lockouts.get(identifier);

    if (!entry || !entry.lockedUntil) {
      return 0;
    }

    const remaining = Math.max(0, entry.lockedUntil.getTime() - Date.now());
    return Math.ceil(remaining / 1000);
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
    const identifier = this.getIdentifier(email);
    const now = new Date();
    
    let entry = this.lockouts.get(identifier);

    // Create new entry or reset if attempt window expired
    if (!entry || (now.getTime() - entry.lastAttempt.getTime()) > ATTEMPT_WINDOW_MS) {
      entry = {
        failedAttempts: 1,
        lockedUntil: null,
        lastAttempt: now,
        recentIPs: [ipAddress],
      };
      this.lockouts.set(identifier, entry);
      return;
    }

    // Track IP for auditing (keep last 10 IPs)
    if (!entry.recentIPs.includes(ipAddress)) {
      entry.recentIPs.push(ipAddress);
      if (entry.recentIPs.length > 10) {
        entry.recentIPs.shift();
      }
    }

    // Increment failed attempts
    entry.failedAttempts++;
    entry.lastAttempt = now;

    // Lock account if threshold reached
    if (entry.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
      
      // Log lockout event
      if (userId) {
        await auditService.log({
          userId,
          action: 'ACCOUNT_LOCKED',
          module: 'auth',
          details: {
            email,
            currentIP: ipAddress,
            recentIPs: entry.recentIPs,
            failedAttempts: entry.failedAttempts,
            lockedUntil: entry.lockedUntil,
            reason: 'Too many failed login attempts',
          },
          ipAddress,
        });
      }

      console.log(`🔒 Account locked: ${email} from ${ipAddress} until ${entry.lockedUntil.toISOString()}`);
    }

    this.cleanupExpiredEntries();
  }

  /**
   * Reset failed attempts (call on successful login)
   */
  resetAttempts(email: string, ipAddress?: string): void {
    const identifier = this.getIdentifier(email);
    this.lockouts.delete(identifier);
  }

  /**
   * Get current lockout status for an account
   */
  getStatus(email: string, ipAddress?: string): {
    failedAttempts: number;
    isLocked: boolean;
    lockedUntil: Date | null;
    remainingSeconds: number;
    recentIPs: string[];
  } {
    const identifier = this.getIdentifier(email);
    const entry = this.lockouts.get(identifier);

    if (!entry) {
      return {
        failedAttempts: 0,
        isLocked: false,
        lockedUntil: null,
        remainingSeconds: 0,
        recentIPs: [],
      };
    }

    const isLocked = this.isLocked(email);
    const remainingSeconds = this.getRemainingLockoutTime(email);

    return {
      failedAttempts: entry.failedAttempts,
      isLocked,
      lockedUntil: entry.lockedUntil,
      remainingSeconds,
      recentIPs: entry.recentIPs,
    };
  }

  /**
   * Cleanup expired lockout entries to prevent memory leaks
   */
  private cleanupExpiredEntries(): void {
    const now = new Date();
    const entries = Array.from(this.lockouts.entries());
    
    for (const [identifier, entry] of entries) {
      // Remove if locked until has expired and no recent attempts
      if (entry.lockedUntil && now > entry.lockedUntil) {
        const timeSinceLastAttempt = now.getTime() - entry.lastAttempt.getTime();
        if (timeSinceLastAttempt > ATTEMPT_WINDOW_MS) {
          this.lockouts.delete(identifier);
        }
      }
    }
  }

  /**
   * Clear all lockouts (for testing/admin purposes)
   */
  clearAll(): void {
    this.lockouts.clear();
  }
}

export const accountLockoutService = new AccountLockoutService();
