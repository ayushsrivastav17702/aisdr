import crypto from 'crypto';
import { db } from '../db';
import { magicLinks, users, userSessions } from '@shared/schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import { Resend } from 'resend';

const MAGIC_LINK_EXPIRY_MINUTES = 15;
const MAGIC_LINK_TOKEN_LENGTH = 32;

class MagicLinkService {
  private resend: Resend | null = null;

  private getResend(): Resend {
    if (!this.resend) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw new Error('RESEND_API_KEY is not configured');
      }
      this.resend = new Resend(apiKey);
    }
    return this.resend;
  }

  generateToken(): string {
    return crypto.randomBytes(MAGIC_LINK_TOKEN_LENGTH).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createMagicLink(
    email: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      return {
        success: false,
        message: 'This email is not linked to an AiSDR account. Please contact your admin or support@aisdr.com.',
      };
    }

    if (user.status !== 'active') {
      return {
        success: false,
        message: 'Your account is not active. Please contact support@aisdr.com.',
      };
    }

    await db
      .delete(magicLinks)
      .where(
        and(
          eq(magicLinks.email, normalizedEmail),
          eq(magicLinks.used, false)
        )
      );

    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

    await db.insert(magicLinks).values({
      email: normalizedEmail,
      tokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    });

    const baseUrl = process.env.APP_URL ?? 
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');
    
    const magicLinkUrl = `${baseUrl}/auth/magic?token=${token}`;

    try {
      await this.sendMagicLinkEmail(normalizedEmail, magicLinkUrl, user.firstName);
      return {
        success: true,
        message: 'Magic link sent. Please check your inbox.',
      };
    } catch (error) {
      console.error('Failed to send magic link email:', error);
      return {
        success: false,
        message: 'Failed to send magic link. Please try again.',
      };
    }
  }

  async validateMagicLink(
    token: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; userId?: string; sessionToken?: string; message?: string }> {
    const tokenHash = this.hashToken(token);

    const [magicLink] = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.tokenHash, tokenHash),
          eq(magicLinks.used, false),
          gt(magicLinks.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!magicLink) {
      return {
        success: false,
        message: 'Invalid or expired magic link. Please request a new one.',
      };
    }

    await db
      .update(magicLinks)
      .set({
        used: true,
        usedAt: new Date(),
      })
      .where(eq(magicLinks.id, magicLink.id));

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, magicLink.email))
      .limit(1);

    if (!user || user.status !== 'active') {
      return {
        success: false,
        message: 'User account not found or inactive.',
      };
    }

    const { authService } = await import('./auth.service');
    const sessionData = await authService.createSessionForUser(user.id, ipAddress, userAgent);

    if (!sessionData) {
      return {
        success: false,
        message: 'Failed to create session. Please try again.',
      };
    }

    await db
      .update(users)
      .set({
        lastLogin: new Date(),
        authProvider: 'magic',
        emailVerified: true,
      })
      .where(eq(users.id, user.id));

    await authService.logAuditEvent(user.id, 'magic_link_login', {
      email: magicLink.email,
      ipAddress,
    });

    return {
      success: true,
      userId: user.id,
      sessionToken: sessionData.token,
    };
  }

  private async sendMagicLinkEmail(
    email: string,
    magicLinkUrl: string,
    firstName?: string | null
  ): Promise<void> {
    const resend = this.getResend();
    const greeting = firstName ? `Hi ${firstName}` : 'Hi there';

    await resend.emails.send({
      from: 'AiSDR <noreply@aisdr.com>',
      to: email,
      subject: 'Sign in to AiSDR',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">AiSDR</h1>
          </div>
          
          <p>${greeting},</p>
          
          <p>Click the button below to sign in to your AiSDR account. This link will expire in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLinkUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Sign in to AiSDR
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">If you didn't request this link, you can safely ignore this email.</p>
          
          <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="color: #2563eb; font-size: 12px; word-break: break-all;">${magicLinkUrl}</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from AiSDR. Please do not reply to this email.
          </p>
        </body>
        </html>
      `,
    });
  }

  async cleanupExpiredLinks(): Promise<number> {
    const result = await db
      .delete(magicLinks)
      .where(lt(magicLinks.expiresAt, new Date()))
      .returning();

    return result.length;
  }
}

export const magicLinkService = new MagicLinkService();
