import { Router } from 'express';
import { authService } from '../services/auth.service';
import { auditService } from '../services/audit.service';
import { invitationService } from '../services/invitation.service';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { loginRateLimit, invitationRateLimit } from '../middleware/rate-limit.middleware';
import { db } from '../db';
import { users, userSessions, userInvitations } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.boolean().optional(),
});

const acceptInvitationSchema = z.object({
  token: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
});

router.post('/api/auth/login', loginRateLimit, async (req, res) => {
  try {
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }
    const { email, password } = validationResult.data;
    
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const session = await authService.login(email, password, ipAddress, userAgent);

    if (!session) {
      auditService.logFromRequest(req, 'LOGIN_FAILED', 'auth', { 
        email,
        reason: 'Invalid credentials',
        ipAddress,
        userAgent
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    auditService.logFromRequest(req, 'LOGIN_SUCCESS', 'auth', { 
      userId: session.userId, 
      email,
      ipAddress,
      userAgent
    });

    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      userId: session.userId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Account is not active') {
      auditService.logFromRequest(req, 'LOGIN_FAILED', 'auth', { 
        email: req.body.email || 'unknown',
        reason: 'Account is not active',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });
      return res.status(403).json({ error: 'Account is not active' });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/api/auth/refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const newSession = await authService.refreshSession(token);

    if (!newSession) {
      auditService.logFromRequest(req, 'SESSION_REFRESH_FAILED', 'auth', { 
        reason: 'Session expired or invalid'
      });
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    auditService.logFromRequest(req, 'SESSION_REFRESHED', 'auth', { 
      userId: newSession.userId,
      sessionId: newSession.sessionId
    });

    res.json({
      token: newSession.token,
      expiresAt: newSession.expiresAt,
      userId: newSession.userId,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

router.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    if (!req.sessionId) {
      return res.status(400).json({ error: 'No active session' });
    }

    await authService.logout(req.sessionId, req.user?.id);
    auditService.logAuth(req, 'LOGOUT');
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

router.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json(req.user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

router.post('/api/auth/invitations', authenticate, requireAdmin, invitationRateLimit, async (req, res) => {
  try {
    const validationResult = createInvitationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }
    const { email, role } = validationResult.data;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const inviterName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
    
    const result = await invitationService.createAndSendInvitation(
      email,
      role,
      req.user.id,
      inviterName
    );

    res.json({
      message: 'Invitation sent successfully',
      inviteUrl: result.inviteUrl,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Create invitation error:', error);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

router.get('/api/auth/invitations/validate', async (req, res) => {
  try {
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const invitation = await authService.validateInvitation(token);

    if (!invitation) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    res.json({
      email: invitation.email,
      role: invitation.role,
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({ error: 'Failed to validate invitation' });
  }
});

router.post('/api/auth/invitations/accept', async (req, res) => {
  try {
    const validationResult = acceptInvitationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }
    const { token, firstName, lastName, password } = validationResult.data;

    const user = await authService.acceptInvitation(token, firstName, lastName, password);

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    const session = await authService.login(user.email, password, ipAddress, userAgent);

    if (!session) {
      return res.status(500).json({ error: 'Account created but login failed' });
    }

    auditService.logFromRequest(req, 'INVITATION_ACCEPTED', 'auth', { 
      userId: user.id, 
      email: user.email,
      role: user.role 
    });

    res.json({
      message: 'Invitation accepted successfully',
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid or expired')) {
        return res.status(400).json({ error: 'Invalid or expired invitation' });
      }
      if (error.message.includes('already exists')) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
    }
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

router.post('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const validationResult = changePasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }
    const { currentPassword, newPassword } = validationResult.data;

    await authService.changePassword(req.user.id, currentPassword, newPassword);

    auditService.logAuth(req, 'PASSWORD_RESET', { 
      userId: req.user.id,
      email: req.user.email,
      requireReauth: true
    });

    if (req.sessionId) {
      await authService.logout(req.sessionId, req.user.id);
    }

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid current password')) {
      return res.status(400).json({ error: 'Invalid current password' });
    }
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.get('/api/auth/sessions', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const sessions = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, req.user.id))
      .orderBy(desc(userSessions.lastActivity));

    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

router.delete('/api/auth/sessions/:sessionId', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { sessionId } = req.params;
    
    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, sessionId));

    if (!session || session.userId !== req.user.id) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await authService.logout(sessionId, req.user.id);

    res.json({ message: 'Session terminated successfully' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

router.delete('/api/auth/sessions', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    await authService.revokeAllUserSessions(req.user.id, req.sessionId);

    res.json({ message: 'All sessions revoked successfully' });
  } catch (error) {
    console.error('Revoke sessions error:', error);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

router.get('/api/auth/invitations', authenticate, requireAdmin, async (req, res) => {
  try {
    const invitations = await db
      .select()
      .from(userInvitations)
      .orderBy(desc(userInvitations.createdAt));

    res.json(invitations);
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ error: 'Failed to get invitations' });
  }
});

export default router;
