import { Router } from 'express';
import { authService } from '../services/auth.service';
import { auditService } from '../services/audit.service';
import { invitationService } from '../services/invitation.service';
import { oauthService } from '../services/oauth.service';
import { magicLinkService } from '../services/magic-link.service';
import { superAdminService } from '../services/super-admin.service';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { loginRateLimit, invitationRateLimit, passwordResetRateLimit } from '../middleware/rate-limit.middleware';
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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
});

router.post('/api/auth/login', loginRateLimit, async (req, res) => {
  console.log('🔐 Login request received');
  try {
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      console.log('❌ Login validation failed:', validationResult.error.issues);
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }
    const { email, password } = validationResult.data;
    console.log('✅ Login validation passed for:', email);
    
    // Extract client IP properly (trust proxy is configured)
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                     req.ip || 
                     req.socket.remoteAddress || 
                     'unknown';
    const userAgent = req.headers['user-agent'];

    // First, check if this is a super admin login
    try {
      const superAdminResult = await superAdminService.login(email, password, ipAddress, userAgent);
      if (superAdminResult) {
        console.log('✅ Super Admin login successful for:', email);
        
        // Set super admin cookie
        res.cookie('super_admin_token', superAdminResult.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 8 * 60 * 60 * 1000, // 8 hours
          path: '/api/super-admin',
        });

        return res.json({
          userType: 'super_admin',
          superAdmin: superAdminResult.superAdmin,
          expiresAt: superAdminResult.expiresAt,
          redirectTo: '/super-admin',
        });
      }
    } catch (superAdminError) {
      // Not a super admin or invalid super admin credentials - continue to regular user login
      console.log('Not a super admin, checking regular user login');
    }

    // Check if password login is enabled for any user with this email
    const matchingUsers = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    const usersWithPasswordDisabled = matchingUsers.filter(u => !u.passwordLoginEnabled);
    if (matchingUsers.length > 0 && usersWithPasswordDisabled.length === matchingUsers.length) {
      auditService.logFromRequest(req, 'LOGIN_FAILED', 'auth', { 
        email,
        reason: 'Password login not enabled',
        ipAddress,
        userAgent
      });
      return res.status(401).json({ 
        error: 'Password login is not enabled for this account. Please use Google, Microsoft, or Magic Link to sign in.',
      });
    }

    // Check if account is locked
    const { accountLockoutService } = await import('../services/account-lockout.service');
    if (await accountLockoutService.isLocked(email, ipAddress)) {
      const remainingTime = await accountLockoutService.getRemainingLockoutTime(email, ipAddress);
      
      auditService.logFromRequest(req, 'LOGIN_BLOCKED', 'auth', { 
        email,
        reason: 'Account locked due to too many failed attempts',
        ipAddress,
        userAgent,
        remainingLockoutSeconds: remainingTime,
      });
      
      return res.status(423).json({ 
        error: 'Account temporarily locked due to too many failed login attempts', 
        retryAfter: remainingTime,
        message: `Please try again in ${Math.ceil(remainingTime / 60)} minutes`,
      });
    }

    // Try login - may return session, null, or multipleAccounts response
    const userId = req.body.userId; // Optional - for account disambiguation
    const loginResult = await authService.login(email, password, ipAddress, userAgent, userId);

    if (!loginResult) {
      auditService.logFromRequest(req, 'LOGIN_FAILED', 'auth', { 
        email,
        reason: 'Invalid credentials',
        ipAddress,
        userAgent
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Handle multiple accounts case - user needs to select which account to use
    if ('multipleAccounts' in loginResult && loginResult.multipleAccounts) {
      return res.status(300).json({
        multipleAccounts: true,
        message: 'Multiple accounts found with this email. Please select which account to use.',
        accounts: loginResult.accounts,
      });
    }

    // At this point loginResult must be SessionData
    const session = loginResult as { userId: string; sessionId: string; token: string; expiresAt: Date };

    auditService.logFromRequest(req, 'LOGIN_SUCCESS', 'auth', { 
      userId: session.userId, 
      email,
      ipAddress,
      userAgent
    });

    // Set HTTP-only cookie for enhanced security
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    res.cookie('auth_token', session.token, {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
      maxAge: cookieMaxAge,
      path: '/',
    });

    res.json({
      userType: 'user',
      token: session.token,
      expiresAt: session.expiresAt,
      userId: session.userId,
      redirectTo: '/',
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('❌ Login error stack:', error instanceof Error ? error.stack : 'No stack');
    if (error instanceof Error && error.message === 'Account is not active') {
      auditService.logFromRequest(req, 'LOGIN_FAILED', 'auth', { 
        email: req.body.email || 'unknown',
        reason: 'Account is not active',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });
      return res.status(403).json({ error: 'Account is not active' });
    }
    res.status(500).json({ error: 'Login failed', message: error instanceof Error ? error.message : 'Unknown error' });
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

    // Update HTTP-only cookie
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    res.cookie('auth_token', newSession.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: cookieMaxAge,
      path: '/',
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
    
    // Clear HTTP-only cookie
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
    });
    
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

router.get('/api/auth/config', async (_req, res) => {
  try {
    const [passwordUser] = await db
      .select({ count: users.id })
      .from(users)
      .where(eq(users.passwordLoginEnabled, true))
      .limit(1);
    
    res.json({
      googleEnabled: oauthService.isGoogleConfigured(),
      microsoftEnabled: oauthService.isMicrosoftConfigured(),
      magicLinkEnabled: !!process.env.RESEND_API_KEY,
      passwordLoginEnabled: !!passwordUser,
    });
  } catch (error) {
    console.error('Auth config error:', error);
    res.status(500).json({ error: 'Failed to get auth config' });
  }
});

router.post('/api/auth/magic-link', loginRateLimit, async (req, res) => {
  try {
    const validationResult = magicLinkSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const { email } = validationResult.data;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];

    const result = await magicLinkService.createMagicLink(email, ipAddress, userAgent);

    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }

    res.json({ message: result.message });
  } catch (error) {
    console.error('Magic link error:', error);
    res.status(500).json({ error: 'Failed to send magic link' });
  }
});

router.get('/api/auth/magic/verify', async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];

    const result = await magicLinkService.validateMagicLink(token, ipAddress, userAgent);

    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = 7 * 24 * 60 * 60 * 1000;

    res.cookie('auth_token', result.sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: cookieMaxAge,
      path: '/',
    });

    res.json({
      success: true,
      token: result.sessionToken,
      userId: result.userId,
    });
  } catch (error) {
    console.error('Magic link verify error:', error);
    res.status(500).json({ error: 'Failed to verify magic link' });
  }
});

router.get('/api/auth/google', (_req, res) => {
  try {
    if (!oauthService.isGoogleConfigured()) {
      return res.status(503).json({ error: 'Google login is not configured' });
    }
    const authUrl = oauthService.getGoogleAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Failed to initiate Google login' });
  }
});

router.get('/api/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error) {
      return res.redirect('/login?error=google_denied');
    }

    if (!code) {
      return res.redirect('/login?error=no_code');
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];

    const result = await oauthService.handleGoogleCallback(code, ipAddress, userAgent);

    if (!result.success) {
      const encodedError = encodeURIComponent(result.error || 'Authentication failed');
      return res.redirect(`/login?error=${encodedError}`);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = 7 * 24 * 60 * 60 * 1000;

    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: cookieMaxAge,
      path: '/',
    });

    res.redirect('/');
  } catch (error) {
    console.error('Google callback error:', error);
    res.redirect('/login?error=google_failed');
  }
});

router.get('/api/auth/microsoft', (_req, res) => {
  try {
    if (!oauthService.isMicrosoftConfigured()) {
      return res.status(503).json({ error: 'Microsoft login is not configured' });
    }
    const authUrl = oauthService.getMicrosoftAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Microsoft auth error:', error);
    res.status(500).json({ error: 'Failed to initiate Microsoft login' });
  }
});

router.get('/api/auth/microsoft/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error) {
      return res.redirect('/login?error=microsoft_denied');
    }

    if (!code) {
      return res.redirect('/login?error=no_code');
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];

    const result = await oauthService.handleMicrosoftCallback(code, ipAddress, userAgent);

    if (!result.success) {
      const encodedError = encodeURIComponent(result.error || 'Authentication failed');
      return res.redirect(`/login?error=${encodedError}`);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = 7 * 24 * 60 * 60 * 1000;

    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: cookieMaxAge,
      path: '/',
    });

    res.redirect('/');
  } catch (error) {
    console.error('Microsoft callback error:', error);
    res.redirect('/login?error=microsoft_failed');
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
    
    const loginResult = await authService.login(user.email, password, ipAddress, userAgent, user.id);

    if (!loginResult || ('multipleAccounts' in loginResult && loginResult.multipleAccounts)) {
      return res.status(500).json({ error: 'Account created but login failed' });
    }

    const session = loginResult as { userId: string; sessionId: string; token: string; expiresAt: Date };

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

router.post('/api/auth/forgot-password', passwordResetRateLimit, async (req, res) => {
  try {
    const validationResult = forgotPasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }

    const { email } = validationResult.data;
    
    const result = await authService.requestPasswordReset(email);
    
    if (result.success && result.token) {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000';
      
      const resetUrl = `${baseUrl}/reset-password?token=${result.token}`;
      
      const { emailService } = await import('../services/email.service');
      await emailService.sendPasswordResetEmail({
        to: email,
        resetUrl,
      });
      
      console.log(`✅ Password reset email sent to ${email}`);
    }
    
    // Always return success to prevent email enumeration
    res.json({ 
      success: true, 
      message: 'If an account with that email exists, we sent a password reset link.' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

router.post('/api/auth/reset-password', passwordResetRateLimit, async (req, res) => {
  try {
    const validationResult = resetPasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }

    const { token, newPassword } = validationResult.data;
    
    const success = await authService.resetPassword(token, newPassword);
    
    if (!success) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.get('/api/auth/validate-reset-token', async (req, res) => {
  try {
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const validation = await authService.validateResetToken(token);
    
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid or expired reset token', valid: false });
    }
    
    res.json({ valid: true, email: validation.email });
  } catch (error) {
    console.error('Validate reset token error:', error);
    res.status(500).json({ error: 'Failed to validate reset token' });
  }
});

// Email verification routes
router.post('/api/auth/resend-verification-email', loginRateLimit, async (req, res) => {
  try {
    const validationResult = resendVerificationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: 'Invalid request data', details: validationResult.error.issues });
    }

    const { email } = validationResult.data;
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000';
    
    // This method handles everything: token generation, email sending, and verification checks
    const result = await authService.resendEmailVerification(email, baseUrl);
    
    // Always return success to prevent email enumeration
    res.json({ 
      success: true, 
      message: 'If an unverified account with that email exists, we sent a verification link.' 
    });
  } catch (error) {
    console.error('Resend verification email error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

router.get('/api/auth/verify-email', async (req, res) => {
  try {
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const success = await authService.verifyEmailWithToken(token);
    
    if (!success) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

router.get('/api/auth/validate-verification-token', async (req, res) => {
  try {
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const validation = await authService.validateEmailVerificationToken(token);
    
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid or expired verification token', valid: false });
    }
    
    res.json({ valid: true, email: validation.email });
  } catch (error) {
    console.error('Validate verification token error:', error);
    res.status(500).json({ error: 'Failed to validate verification token' });
  }
});

// Onboarding routes
router.post('/api/user/onboarding/complete', authenticate, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await db
      .update(users)
      .set({ 
        onboardingCompleted: true,
        onboardingCompletedAt: new Date()
      })
      .where(eq(users.id, req.userContext.userId));

    auditService.logFromRequest(req, 'ONBOARDING_COMPLETED', 'user', {
      userId: req.userContext.userId
    });

    res.json({ success: true, message: 'Onboarding completed successfully' });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// Admin: Unlock user account
router.post('/api/auth/unlock-account', authenticate, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { accountLockoutService } = await import('../services/account-lockout.service');
    await accountLockoutService.resetAttempts(email);

    // Log admin unlock action
    await auditService.log({
      userId: req.user!.id,
      action: 'ADMIN_UNLOCK_ACCOUNT',
      module: 'auth',
      details: {
        targetEmail: email,
        adminEmail: req.user!.email,
        reason: 'Manual unlock by administrator',
      },
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Account unlocked successfully' });
  } catch (error) {
    console.error('Error unlocking account:', error);
    res.status(500).json({ error: 'Failed to unlock account' });
  }
});

router.post('/api/user/onboarding/skip', authenticate, async (req, res) => {
  try {
    if (!req.userContext?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await db
      .update(users)
      .set({ 
        onboardingCompleted: true,
        onboardingCompletedAt: new Date()
      })
      .where(eq(users.id, req.userContext.userId));

    auditService.logFromRequest(req, 'ONBOARDING_SKIPPED', 'user', {
      userId: req.userContext.userId
    });

    res.json({ success: true, message: 'Onboarding skipped successfully' });
  } catch (error) {
    console.error('Skip onboarding error:', error);
    res.status(500).json({ error: 'Failed to skip onboarding' });
  }
});

export default router;
