import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db';
import { users, userSessions, userInvitations, auditLogs } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';

const SALT_ROUNDS = 12;
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set for JWT signing. This is a critical security requirement.');
}
const JWT_SECRET: string = process.env.SESSION_SECRET;
const JWT_EXPIRES_IN = '7d';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const INVITATION_TOKEN_LENGTH = 32;
const INVITATION_EXPIRY_HOURS = 72; // 3 days

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'inactive' | 'suspended';
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

  generateToken(userId: string, sessionId: string): string {
    return jwt.sign({ userId, sessionId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  verifyToken(token: string): { userId: string; sessionId: string } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; sessionId: string };
      return decoded;
    } catch (error) {
      return null;
    }
  }

  generateInvitationToken(): string {
    return crypto.randomBytes(INVITATION_TOKEN_LENGTH).toString('hex');
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string): Promise<SessionData | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user || !user.passwordHash) {
      return null;
    }

    if (user.status !== 'active') {
      throw new Error('Account is not active');
    }

    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      await this.logAuditEvent(user.id, 'login_failed', { email, ipAddress, reason: 'Invalid password' });
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

    const token = this.generateToken(user.id, session.id);

    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

    await this.logAuditEvent(user.id, 'login_success', { email, ipAddress });

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

  async validateSession(token: string): Promise<AuthUser | null> {
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
          gt(userSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) {
      return null;
    }

    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);

    if (!user || user.status !== 'active') {
      return null;
    }

    await db
      .update(userSessions)
      .set({ lastActivity: new Date() })
      .where(eq(userSessions.id, session.id));

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as 'admin' | 'user',
      status: user.status as 'active' | 'inactive' | 'suspended',
    };
  }

  async createInvitation(
    email: string,
    role: 'admin' | 'user',
    invitedBy: string
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

  async validateInvitation(token: string): Promise<{ id: string; email: string; role: string } | null> {
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

    const existingUser = await db.select().from(users).where(eq(users.email, invitation.email)).limit(1);
    if (existingUser.length > 0) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await this.hashPassword(password);

    const [user] = await db.insert(users).values({
      email: invitation.email,
      firstName,
      lastName,
      role: invitation.role as 'admin' | 'user',
      passwordHash,
      status: 'active',
    }).returning();

    await db
      .update(userInvitations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(userInvitations.id, invitation.id));

    await this.logAuditEvent(user.id, 'invitation_accepted', { invitationId: invitation.id });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as 'admin' | 'user',
      status: user.status as 'active' | 'inactive' | 'suspended',
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

  private async logAuditEvent(userId: string, action: string, metadata: any): Promise<void> {
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
}

export const authService = new AuthService();
