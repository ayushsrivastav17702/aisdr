import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db';
import { users, userSessions, userInvitations, auditLogs, passwordResetTokens, emailVerificationTokens, managerAccounts } from '@shared/schema';
import { eq, and, gt, isNull } from 'drizzle-orm';

const SALT_ROUNDS = 12;
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set for JWT signing. This is a critical security requirement.');
}
const JWT_SECRET: string = process.env.SESSION_SECRET;
const JWT_EXPIRES_IN = '7d';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const SESSION_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity
const INVITATION_TOKEN_LENGTH = 32;
const INVITATION_EXPIRY_HOURS = 72; // 3 days
const RESET_TOKEN_LENGTH = 32;
const RESET_TOKEN_EXPIRY_MINUTES = 30; // 30 minutes for password reset
const EMAIL_VERIFICATION_TOKEN_LENGTH = 32;
const EMAIL_VERIFICATION_EXPIRY_HOURS = 24; // 24 hours for email verification

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  role: 'manager' | 'user' | 'super_admin';
  status: 'active' | 'inactive' | 'suspended';
  organizationId: string | null;
  createdBy: string | null;
  isManager: boolean;
}

export interface SessionData {
  userId: string;
  sessionId: string;
  token: string;
  expiresAt: Date;
}

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  generateToken(userId: string, sessionId: string, role: string, tenantId: string | null): string {
    return jwt.sign({ userId, sessionId, role, tenantId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  verifyToken(token: string): { userId: string; sessionId: string; role?: string; tenantId?: string | null } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; sessionId: string; role?: string; tenantId?: string | null };
      return decoded;
    } catch (error) {
      return null;
    }
  }

  generateInvitationToken(): string {
    return crypto.randomBytes(INVITATION_TOKEN_LENGTH).toString('hex');
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string, userId?: string): Promise<SessionData | { multipleAccounts: true; accounts: Array<{ id: string; organizationId: string | null; createdBy: string | null }> } | null> {
    // Find all users with this email (since email is now scoped by manager, not globally unique)
    const matchingUsers = await db.select().from(users).where(eq(users.email, email.toLowerCase()));

    if (matchingUsers.length === 0) {
      // Record failed attempt even if user doesn't exist (to prevent enumeration attacks)
      const { accountLockoutService } = await import('./account-lockout.service');
      await accountLockoutService.recordFailedAttempt(email, ipAddress || 'unknown');
      return null;
    }

    // If userId is provided, use that specific user (for disambiguation)
    let user = userId ? matchingUsers.find(u => u.id === userId) : undefined;
    
    // If no specific userId and only one match, use it
    if (!user && matchingUsers.length === 1) {
      user = matchingUsers[0];
    }
    
    // If multiple users and no specific userId, verify password against all and return options
    if (!user && matchingUsers.length > 1) {
      const validUsers: typeof matchingUsers = [];
      for (const u of matchingUsers) {
        // Only include users with password login enabled, active status, and valid password
        if (u.passwordHash && u.status === 'active' && u.passwordLoginEnabled) {
          const isValid = await this.verifyPassword(password, u.passwordHash);
          if (isValid) {
            validUsers.push(u);
          }
        }
      }
      
      if (validUsers.length === 0) {
        const { accountLockoutService } = await import('./account-lockout.service');
        await accountLockoutService.recordFailedAttempt(email, ipAddress || 'unknown');
        return null;
      }
      
      if (validUsers.length === 1) {
        user = validUsers[0];
      } else {
        // Multiple valid accounts - return options for user to choose
        return {
          multipleAccounts: true,
          accounts: validUsers.map(u => ({
            id: u.id,
            organizationId: u.organizationId,
            createdBy: u.createdBy,
          })),
        };
      }
    }
    
    // When userId is provided for disambiguation, re-verify password login is enabled
    if (userId && user && !user.passwordLoginEnabled) {
      return null; // Password login disabled for this specific account
    }

    if (!user || !user.passwordHash) {
      const { accountLockoutService } = await import('./account-lockout.service');
      await accountLockoutService.recordFailedAttempt(email, ipAddress || 'unknown');
      return null;
    }

    if (user.status !== 'active') {
      throw new Error('Account is not active');
    }

    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      await this.logAuditEvent(user.id, 'login_failed', { email, ipAddress, reason: 'Invalid password' });
      
      // Record failed attempt for account lockout tracking
      const { accountLockoutService } = await import('./account-lockout.service');
      await accountLockoutService.recordFailedAttempt(email, ipAddress || 'unknown', user.id);
      return null;
    }

    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

    const [session] = await db.insert(userSessions).values({
      userId: user.id,
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt,
      ipAddress,
      userAgent,
      lastActivity: new Date(),
    }).returning();

    // Normalize role: 'admin' -> 'manager' for consistency
    const normalizedRole = user.role === 'admin' ? 'manager' : user.role;
    console.log(`[AUTH_LOGIN] User ${email} logged in with role: ${user.role} (normalized: ${normalizedRole}), tenantId: ${user.organizationId || 'none'}`);
    
    const token = this.generateToken(user.id, session.id, normalizedRole, user.organizationId);

    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

    await this.logAuditEvent(user.id, 'login_success', { email, ipAddress });

    // Reset failed attempts on successful login
    const { accountLockoutService } = await import('./account-lockout.service');
    accountLockoutService.resetAttempts(email, ipAddress || 'unknown');

    return {
      userId: user.id,
      sessionId: session.id,
      token,
      expiresAt,
    };
  }

  async logout(sessionId: string, userId?: string): Promise<void> {
    await db.delete(userSessions).where(eq(userSessions.id, sessionId));
    
    if (userId) {
      await this.logAuditEvent(userId, 'logout', { sessionId });
    }
  }

  async createSessionForUser(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<SessionData | null> {
    // Fetch user to get role and tenantId for JWT
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return null;
    }

    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

    const [session] = await db.insert(userSessions).values({
      userId,
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt,
      ipAddress,
      userAgent,
      lastActivity: new Date(),
    }).returning();

    // Normalize role: 'admin' -> 'manager' for consistency
    const normalizedRole = user.role === 'admin' ? 'manager' : user.role;
    console.log(`[AUTH_CREATE_SESSION] Creating session for user ${user.email} with role: ${user.role} (normalized: ${normalizedRole}), tenantId: ${user.organizationId || 'none'}`);
    
    const token = this.generateToken(userId, session.id, normalizedRole, user.organizationId);

    return {
      userId,
      sessionId: session.id,
      token,
      expiresAt,
    };
  }

  async validateSession(token: string, checkIdleTimeout: boolean = true): Promise<AuthUser | null> {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return null;
    }

    const [session] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.id, decoded.sessionId),
          eq(userSessions.userId, decoded.userId),
          gt(userSessions.expiresAt, new Date()),
          isNull(userSessions.expiredAt)
        )
      )
      .limit(1);

    if (!session) {
      return null;
    }

    if (checkIdleTimeout) {
      const idleTime = Date.now() - new Date(session.lastActivity).getTime();
      if (idleTime > SESSION_IDLE_TIMEOUT) {
        // Mark as expired rather than deleting immediately to avoid killing concurrent requests
        await db.update(userSessions)
          .set({ expiredAt: new Date() })
          .where(eq(userSessions.id, session.id));
        return null;
      }
    }

    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);

    if (!user || user.status !== 'active') {
      return null;
    }

    if (checkIdleTimeout) {
      await db
        .update(userSessions)
        .set({ lastActivity: new Date() })
        .where(eq(userSessions.id, session.id));
    }

    // ROLE IS SOURCE OF TRUTH - No inference from managerAccounts table
    // Normalize role: DB stores 'admin' for legacy managers, but we return 'manager'
    const normalizedRole = user.role === 'admin' ? 'manager' : user.role;
    
    // isManager is now derived from role, not from separate table lookup
    // This ensures role is the single source of truth for routing decisions
    const isManager = normalizedRole === 'manager';
    
    console.log(`[AUTH_VALIDATE] User: ${user.email}, dbRole: ${user.role}, normalizedRole: ${normalizedRole}, isManager: ${isManager}`);

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified || false,
      firstName: user.firstName,
      lastName: user.lastName,
      role: normalizedRole as 'manager' | 'user' | 'super_admin',
      status: user.status as 'active' | 'inactive' | 'suspended',
      organizationId: user.organizationId,
      createdBy: user.createdBy,
      isManager: isManager,
    };
  }

  async refreshSession(token: string): Promise<SessionData | null> {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return null;
    }

    const [session] = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.id, decoded.sessionId),
          eq(userSessions.userId, decoded.userId),
          gt(userSessions.expiresAt, new Date()),
          isNull(userSessions.expiredAt)
        )
      )
      .limit(1);

    if (!session) {
      return null;
    }

    const idleTime = Date.now() - new Date(session.lastActivity).getTime();
    if (idleTime > SESSION_IDLE_TIMEOUT) {
      await db.update(userSessions)
        .set({ expiredAt: new Date() })
        .where(eq(userSessions.id, session.id));
      return null;
    }

    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (!user || user.status !== 'active') {
      return null;
    }

    const newExpiresAt = new Date(Date.now() + SESSION_MAX_AGE);
    await db
      .update(userSessions)
      .set({ 
        lastActivity: new Date(),
        expiresAt: newExpiresAt
      })
      .where(eq(userSessions.id, session.id));

    // Normalize role: 'admin' -> 'manager' for consistency
    const normalizedRole = user.role === 'admin' ? 'manager' : user.role;
    const newToken = this.generateToken(decoded.userId, session.id, normalizedRole, user.organizationId);

    return {
      userId: decoded.userId,
      sessionId: session.id,
      token: newToken,
      expiresAt: newExpiresAt,
    };
  }

  async createInvitation(
    email: string,
    role: 'admin' | 'user',
    invitedBy: string,
    organizationId?: string | null
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) {
      throw new Error('User with this email already exists');
    }

    const token = this.generateInvitationToken();
    const hashedToken = await this.hashPassword(token);
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

    const [invitation] = await db.insert(userInvitations).values({
      email,
      organizationId: organizationId || null,
      role,
      invitedBy,
      token: hashedToken,
      expiresAt,
      status: 'pending',
    }).returning();

    await this.logAuditEvent(invitedBy, 'invitation_created', { email, role, invitationId: invitation.id });

    return {
      id: invitation.id,
      token, // Return unhashed token for email
      expiresAt,
    };
  }

  async validateInvitation(token: string): Promise<{ id: string; email: string; role: string; organizationId: string | null; invitedBy: string } | null> {
    const invitations = await db
      .select()
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.status, 'pending'),
          gt(userInvitations.expiresAt, new Date())
        )
      );

    for (const invitation of invitations) {
      const isValid = await this.verifyPassword(token, invitation.token);
      if (isValid) {
        return {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          organizationId: invitation.organizationId,
          invitedBy: invitation.invitedBy,
        };
      }
    }

    return null;
  }

  async acceptInvitation(
    token: string,
    firstName: string,
    lastName: string,
    password: string
  ): Promise<AuthUser> {
    const invitation = await this.validateInvitation(token);
    if (!invitation) {
      throw new Error('Invalid or expired invitation');
    }

    const existingUsers = await db.select().from(users).where(eq(users.email, invitation.email)).limit(1);
    const passwordHash = await this.hashPassword(password);
    
    let user;
    
    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      
      // If user exists but is already active, reject
      if (existingUser.status === 'active') {
        throw new Error('User with this email already exists and is active');
      }
      
      // Activate the pending user (manager-created flow)
      [user] = await db.update(users)
        .set({
          firstName: firstName || existingUser.firstName,
          lastName: lastName || existingUser.lastName,
          passwordHash,
          status: 'active',
          forcePasswordReset: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();
      
      console.log(`✅ Activated pending user: ${user.email}`);
    } else {
      // Create new user (standard invitation flow)
      try {
        [user] = await db.insert(users).values({
          email: invitation.email,
          firstName,
          lastName,
          role: invitation.role as 'admin' | 'user',
          passwordHash,
          status: 'active',
          organizationId: invitation.organizationId,
        }).returning();
      } catch (insertErr: any) {
        if (insertErr?.code === '23505' || /duplicate key value violates unique constraint/i.test(insertErr?.message || '')) {
          const dupErr: any = new Error('A user with this email already exists');
          dupErr.code = '23505';
          throw dupErr;
        }
        throw insertErr;
      }
    }

    await db
      .update(userInvitations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(userInvitations.id, invitation.id));

    await this.logAuditEvent(user.id, 'invitation_accepted', { invitationId: invitation.id });

    // Auto-initialize SDR workflow for user role (prevents WORKFLOW_BLOCKED error)
    const orgId = invitation.organizationId || user.organizationId;
    if (user.role === 'user' && orgId) {
      try {
        const { sdrWorkflowService } = await import('./sdr-workflow.service');
        await sdrWorkflowService.getOrCreateProgress(user.id, orgId);
        console.log(`✅ Workflow initialized for SDR user: ${user.email}`);
      } catch (workflowError) {
        console.error(`⚠️ Failed to initialize workflow for user ${user.email}:`, workflowError);
      }
    }

    // Auto-initialize credits for all non-super-admin users
    if (orgId && user.role !== 'super_admin') {
      try {
        const { initializeUserCredits } = await import('./credit.service');
        await initializeUserCredits(user.id, orgId);
        console.log(`✅ Credits initialized for user: ${user.email}`);
      } catch (creditError) {
        console.error(`⚠️ Failed to initialize credits for user ${user.email}:`, creditError);
      }
    }

    // Normalize role: DB stores 'admin' for managers, but we return 'manager'
    const normalizedRole = user.role === 'admin' ? 'manager' : user.role;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: normalizedRole as 'manager' | 'user',
      status: user.status as 'active' | 'inactive' | 'suspended',
      emailVerified: user.emailVerified || false,
      organizationId: user.organizationId,
      createdBy: invitation.invitedBy,
      isManager: false, // Newly invited users are not managers
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user || !user.passwordHash) {
      throw new Error('User not found');
    }

    const isValidPassword = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      await this.logAuditEvent(userId, 'password_change_failed', { reason: 'Invalid current password' });
      throw new Error('Invalid current password');
    }

    const newPasswordHash = await this.hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, userId));

    await db.delete(userSessions).where(eq(userSessions.userId, userId));

    await this.logAuditEvent(userId, 'password_changed', {});
  }

  async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    if (exceptSessionId) {
      await db
        .delete(userSessions)
        .where(and(eq(userSessions.userId, userId), eq(userSessions.id, exceptSessionId)));
    } else {
      await db.delete(userSessions).where(eq(userSessions.userId, userId));
    }

    await this.logAuditEvent(userId, 'sessions_revoked', { exceptSessionId });
  }

  async logAuditEvent(userId: string, action: string, metadata: any): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        userId,
        action,
        module: 'auth',
        details: metadata,
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; token?: string }> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user) {
      // Don't reveal if email exists or not (security best practice)
      return { success: true };
    }

    // SECURITY: Invalidate all previous unused reset tokens for this user
    // This ensures only the latest reset link works
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt)
        )
      );

    // Generate secure reset token
    const resetToken = crypto.randomBytes(RESET_TOKEN_LENGTH).toString('hex');
    const hashedToken = await this.hashPassword(resetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    // Store hashed token in database
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: hashedToken,
      expiresAt,
    });

    await this.logAuditEvent(user.id, 'password_reset_requested', { email });

    // Return unhashed token to send in email
    return { success: true, token: resetToken };
  }

  async validateResetToken(token: string): Promise<{ valid: boolean; userId?: string; email?: string }> {
    // Get all non-expired, unused reset tokens
    const tokens = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        token: passwordResetTokens.token,
        usedAt: passwordResetTokens.usedAt,
        email: users.email,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(passwordResetTokens.userId, users.id))
      .where(
        and(
          gt(passwordResetTokens.expiresAt, new Date()),
          isNull(passwordResetTokens.usedAt)
        )
      );

    // Check if any token matches the provided token
    for (const resetToken of tokens) {
      const isValid = await this.verifyPassword(token, resetToken.token);
      if (isValid && !resetToken.usedAt) {
        return { 
          valid: true, 
          userId: resetToken.userId,
          email: resetToken.email 
        };
      }
    }

    return { valid: false };
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const validation = await this.validateResetToken(token);
    
    if (!validation.valid || !validation.userId) {
      await this.logAuditEvent(validation.userId || 'unknown', 'password_reset_failed', { 
        reason: 'Invalid or expired token'
      });
      return false;
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update user password and enable password login
    await db
      .update(users)
      .set({ 
        passwordHash: hashedPassword,
        passwordLoginEnabled: true,
        forcePasswordReset: false,
        updatedAt: new Date()
      })
      .where(eq(users.id, validation.userId));

    // Mark the specific token as used (find and mark only the matching one)
    const tokens = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, validation.userId),
          gt(passwordResetTokens.expiresAt, new Date()),
          isNull(passwordResetTokens.usedAt)
        )
      );

    for (const resetToken of tokens) {
      const isMatch = await this.verifyPassword(token, resetToken.token);
      if (isMatch) {
        await db
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(eq(passwordResetTokens.id, resetToken.id));
        break;
      }
    }

    // SECURITY CRITICAL: Mark ALL other unused tokens as used to enforce single-use semantics
    // This prevents reuse of any other reset links that were generated but not yet used
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, validation.userId),
          isNull(passwordResetTokens.usedAt)
        )
      );

    // SECURITY CRITICAL: Revoke ALL user sessions after password reset
    // This logs out the user from all devices to prevent session hijacking
    await db
      .delete(userSessions)
      .where(eq(userSessions.userId, validation.userId));

    await this.logAuditEvent(validation.userId, 'password_reset_completed', { 
      email: validation.email,
      sessionsRevoked: true
    });

    return true;
  }

  async sendEmailVerification(userId: string, email: string, userName?: string): Promise<string> {
    // SECURITY: Invalidate all previous unused verification tokens for this user
    // This ensures only the latest verification link works
    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          isNull(emailVerificationTokens.usedAt)
        )
      );

    // Generate secure verification token
    const verificationToken = crypto.randomBytes(EMAIL_VERIFICATION_TOKEN_LENGTH).toString('hex');
    const hashedToken = await this.hashPassword(verificationToken);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

    // Store hashed token in database
    await db.insert(emailVerificationTokens).values({
      userId,
      token: hashedToken,
      expiresAt,
    });

    await this.logAuditEvent(userId, 'email_verification_sent', { email });

    // Return unhashed token to send in email
    return verificationToken;
  }

  async validateEmailVerificationToken(token: string): Promise<{ valid: boolean; userId?: string; email?: string }> {
    // Get all non-expired, unused verification tokens
    const tokens = await db
      .select({
        id: emailVerificationTokens.id,
        userId: emailVerificationTokens.userId,
        token: emailVerificationTokens.token,
        expiresAt: emailVerificationTokens.expiresAt,
        usedAt: emailVerificationTokens.usedAt,
      })
      .from(emailVerificationTokens)
      .innerJoin(users, eq(emailVerificationTokens.userId, users.id))
      .where(
        and(
          gt(emailVerificationTokens.expiresAt, new Date()),
          isNull(emailVerificationTokens.usedAt)
        )
      );

    // Try to match the token
    for (const verificationToken of tokens) {
      const isMatch = await this.verifyPassword(token, verificationToken.token);
      if (isMatch) {
        const [user] = await db.select().from(users).where(eq(users.id, verificationToken.userId)).limit(1);
        return { 
          valid: true, 
          userId: verificationToken.userId,
          email: user.email 
        };
      }
    }

    return { valid: false };
  }

  async verifyEmailWithToken(token: string): Promise<boolean> {
    const validation = await this.validateEmailVerificationToken(token);
    
    if (!validation.valid || !validation.userId) {
      await this.logAuditEvent(validation.userId || 'unknown', 'email_verification_failed', { 
        reason: 'Invalid or expired token'
      });
      return false;
    }

    // Mark user email as verified
    await db
      .update(users)
      .set({ 
        emailVerified: true,
        updatedAt: new Date()
      })
      .where(eq(users.id, validation.userId));

    // Mark the specific token as used (find and mark only the matching one)
    const tokens = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.userId, validation.userId),
          gt(emailVerificationTokens.expiresAt, new Date()),
          isNull(emailVerificationTokens.usedAt)
        )
      );

    for (const verificationToken of tokens) {
      const isMatch = await this.verifyPassword(token, verificationToken.token);
      if (isMatch) {
        await db
          .update(emailVerificationTokens)
          .set({ usedAt: new Date() })
          .where(eq(emailVerificationTokens.id, verificationToken.id));
        break;
      }
    }

    // SECURITY CRITICAL: Mark ALL other unused tokens as used to enforce single-use semantics
    // This prevents reuse of any other verification links that were generated but not yet used
    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(emailVerificationTokens.userId, validation.userId),
          isNull(emailVerificationTokens.usedAt)
        )
      );

    await this.logAuditEvent(validation.userId, 'email_verified', { 
      email: validation.email
    });

    return true;
  }

  async resendEmailVerification(email: string, baseUrl: string): Promise<{ 
    success: boolean; 
    alreadyVerified?: boolean; 
    emailSent?: boolean 
  }> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user) {
      // Don't reveal if email exists or not (security best practice)
      return { success: true, emailSent: false };
    }

    // Check if already verified
    if (user.emailVerified) {
      // Don't reveal status but don't send email
      return { success: true, alreadyVerified: true, emailSent: false };
    }

    // Generate and send new verification email (this will invalidate old tokens automatically)
    const verificationToken = await this.sendEmailVerification(
      user.id, 
      user.email, 
      user.firstName || undefined
    );

    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
    
    const { emailService } = await import('./email.service');
    await emailService.sendEmailVerification({
      to: user.email,
      verificationUrl,
      userName: user.firstName || undefined,
    });

    console.log(`✅ Verification email sent to ${user.email}`);

    return { success: true, emailSent: true };
  }
}

export const authService = new AuthService();
