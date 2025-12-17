import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { authService } from './auth.service';

interface OAuthUserInfo {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  emailVerified?: boolean;
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

class OAuthService {
  private getGoogleConfig(): OAuthConfig {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const baseUrl = process.env.APP_URL || 
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }

    return {
      clientId,
      clientSecret,
      redirectUri: `${baseUrl}/api/auth/google/callback`,
    };
  }

  private getMicrosoftConfig(): OAuthConfig {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const baseUrl = process.env.APP_URL || 
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');

    if (!clientId || !clientSecret) {
      throw new Error('Microsoft OAuth credentials not configured');
    }

    return {
      clientId,
      clientSecret,
      redirectUri: `${baseUrl}/api/auth/microsoft/callback`,
    };
  }

  getGoogleAuthUrl(): string {
    const config = this.getGoogleConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  getMicrosoftAuthUrl(): string {
    const config = this.getMicrosoftConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile User.Read',
      response_mode: 'query',
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async handleGoogleCallback(
    code: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const config = this.getGoogleConfig();

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        console.error('Google token exchange failed:', await tokenResponse.text());
        return { success: false, error: 'Failed to authenticate with Google' };
      }

      const tokens = await tokenResponse.json() as { access_token: string };

      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        console.error('Failed to fetch Google user info');
        return { success: false, error: 'Failed to get user information from Google' };
      }

      const userInfo = await userInfoResponse.json() as {
        email: string;
        name?: string;
        given_name?: string;
        family_name?: string;
        verified_email?: boolean;
      };

      return this.loginOrCreateSession(
        {
          email: userInfo.email.toLowerCase(),
          name: userInfo.name,
          firstName: userInfo.given_name,
          lastName: userInfo.family_name,
          emailVerified: userInfo.verified_email,
        },
        'google',
        ipAddress,
        userAgent
      );
    } catch (error) {
      console.error('Google OAuth error:', error);
      return { success: false, error: 'Google authentication failed' };
    }
  }

  async handleMicrosoftCallback(
    code: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const config = this.getMicrosoftConfig();

      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        console.error('Microsoft token exchange failed:', await tokenResponse.text());
        return { success: false, error: 'Failed to authenticate with Microsoft' };
      }

      const tokens = await tokenResponse.json() as { access_token: string };

      const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        console.error('Failed to fetch Microsoft user info');
        return { success: false, error: 'Failed to get user information from Microsoft' };
      }

      const userInfo = await userInfoResponse.json() as {
        mail?: string;
        userPrincipalName?: string;
        displayName?: string;
        givenName?: string;
        surname?: string;
      };

      const email = (userInfo.mail || userInfo.userPrincipalName)?.toLowerCase();
      if (!email) {
        return { success: false, error: 'No email found in Microsoft account' };
      }

      return this.loginOrCreateSession(
        {
          email,
          name: userInfo.displayName,
          firstName: userInfo.givenName,
          lastName: userInfo.surname,
          emailVerified: true,
        },
        'microsoft',
        ipAddress,
        userAgent
      );
    } catch (error) {
      console.error('Microsoft OAuth error:', error);
      return { success: false, error: 'Microsoft authentication failed' };
    }
  }

  private async loginOrCreateSession(
    userInfo: OAuthUserInfo,
    provider: 'google' | 'microsoft',
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, userInfo.email))
      .limit(1);

    if (!existingUser) {
      return {
        success: false,
        error: 'This email is not linked to an AiSDR account. Please contact your admin or support@aisdr.com.',
      };
    }

    if (existingUser.status !== 'active') {
      return {
        success: false,
        error: 'Your account is not active. Please contact support@aisdr.com.',
      };
    }

    const sessionData = await authService.createSessionForUser(existingUser.id, ipAddress, userAgent);

    if (!sessionData) {
      return { success: false, error: 'Failed to create session' };
    }

    await db
      .update(users)
      .set({
        lastLogin: new Date(),
        authProvider: provider,
        emailVerified: true,
        firstName: existingUser.firstName || userInfo.firstName,
        lastName: existingUser.lastName || userInfo.lastName,
      })
      .where(eq(users.id, existingUser.id));

    await authService.logAuditEvent(existingUser.id, `${provider}_oauth_login`, {
      email: userInfo.email,
      ipAddress,
    });

    return {
      success: true,
      token: sessionData.token,
    };
  }

  isGoogleConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  isMicrosoftConfigured(): boolean {
    return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  }
}

export const oauthService = new OAuthService();
