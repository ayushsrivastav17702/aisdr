import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface InvitationEmailData {
  to: string;
  inviterName: string;
  inviteUrl: string;
  role: string;
}

export interface PasswordResetEmailData {
  to: string;
  resetUrl: string;
  userName?: string;
}

export interface EmailVerificationData {
  to: string;
  verificationUrl: string;
  userName?: string;
}

export interface AccountLockoutEmailData {
  to: string;
  userName?: string;
  lockoutDuration: string;
  lockoutTier: number;
  failedAttempts: number;
  lockedUntil: Date;
  ipAddress: string;
}

export class EmailService {
  private fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'; // Configurable sender email
  private productName = 'AI SDR Platform';

  async sendInvitationEmail(data: InvitationEmailData): Promise<void> {
    const { to, inviterName, inviteUrl, role } = data;

    try {
      await resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `You've been invited to join ${this.productName}`,
        html: this.generateInvitationEmailHTML(inviterName, inviteUrl, role),
      });
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      throw new Error('Failed to send invitation email');
    }
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const { to, resetUrl, userName } = data;

    try {
      await resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Reset your ${this.productName} password`,
        html: this.generatePasswordResetEmailHTML(resetUrl, userName),
      });
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendEmailVerification(data: EmailVerificationData): Promise<void> {
    const { to, verificationUrl, userName } = data;

    try {
      await resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Verify your ${this.productName} email address`,
        html: this.generateEmailVerificationHTML(verificationUrl, userName),
      });
    } catch (error) {
      console.error('Failed to send email verification:', error);
      throw new Error('Failed to send email verification');
    }
  }

  async sendAccountLockoutNotification(data: AccountLockoutEmailData): Promise<void> {
    const { to, userName, lockoutDuration, lockoutTier, failedAttempts, lockedUntil, ipAddress } = data;

    try {
      await resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `🔒 Security Alert: Account Temporarily Locked - ${this.productName}`,
        html: this.generateAccountLockoutEmailHTML(
          userName,
          lockoutDuration,
          lockoutTier,
          failedAttempts,
          lockedUntil,
          ipAddress
        ),
      });
      console.log(`📧 Account lockout notification sent to ${to}`);
    } catch (error) {
      console.error('Failed to send account lockout notification:', error);
      // Don't throw - lockout should proceed even if email fails
    }
  }

  private generateInvitationEmailHTML(inviterName: string, inviteUrl: string, role: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invitation to ${this.productName}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited!</h1>
          </div>
          
          <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              <strong>${inviterName}</strong> has invited you to join <strong>${this.productName}</strong> as a <strong>${role}</strong>.
            </p>
            
            <p style="font-size: 16px; margin-bottom: 30px;">
              ${this.productName} is an AI-powered Sales Development Representative platform that streamlines prospect discovery, enrichment, and outreach.
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Accept Invitation
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              This invitation will expire in 72 hours. If you didn't expect this invitation, you can safely ignore this email.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999; margin: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generatePasswordResetEmailHTML(resetUrl: string, userName?: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Reset Your Password</h1>
          </div>
          
          <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello${userName ? ` ${userName}` : ''},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              We received a request to reset your password for your <strong>${this.productName}</strong> account.
            </p>
            
            <p style="font-size: 16px; margin-bottom: 30px;">
              Click the button below to create a new password. This link will expire in <strong>30 minutes</strong> for security reasons.
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>
            
            <div style="background: #fef3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin: 30px 0;">
              <p style="margin: 0; font-size: 14px; color: #856404;">
                <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999; margin: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
            </p>
            
            <p style="font-size: 12px; color: #999; margin-top: 20px;">
              This password reset link will expire in 30 minutes.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generateEmailVerificationHTML(verificationUrl: string, userName?: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">✉️ Verify Your Email</h1>
          </div>
          
          <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello${userName ? ` ${userName}` : ''},</p>
            
            <p style="font-size: 16px; margin-bottom: 20px;">
              Welcome to <strong>${this.productName}</strong>! To get started, please verify your email address.
            </p>
            
            <p style="font-size: 16px; margin-bottom: 30px;">
              Click the button below to verify your email. This link will expire in <strong>24 hours</strong>.
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Verify Email Address
              </a>
            </div>
            
            <div style="background: #e8f4fd; border: 1px solid #0d6efd; border-radius: 5px; padding: 15px; margin: 30px 0;">
              <p style="margin: 0; font-size: 14px; color: #084298;">
                <strong>ℹ️ Note:</strong> You won't be able to access your account until you verify your email address.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999; margin: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
            </p>
            
            <p style="font-size: 12px; color: #999; margin-top: 20px;">
              This verification link will expire in 24 hours. If you didn't create an account with ${this.productName}, you can safely ignore this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generateAccountLockoutEmailHTML(
    userName: string | undefined,
    lockoutDuration: string,
    lockoutTier: number,
    failedAttempts: number,
    lockedUntil: Date,
    ipAddress: string
  ): string {
    const formattedLockedUntil = lockedUntil.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Security Alert: Account Locked</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🔒 Security Alert</h1>
          </div>
          
          <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello${userName ? ` ${userName}` : ''},</p>
            
            <div style="background: #f8d7da; border: 1px solid #dc3545; border-radius: 5px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 15px 0; font-size: 16px; color: #721c24; font-weight: bold;">
                ⚠️ Your account has been temporarily locked due to multiple failed login attempts.
              </p>
              <p style="margin: 0; font-size: 14px; color: #721c24;">
                <strong>Lockout Level:</strong> Tier ${lockoutTier} (${lockoutDuration})<br>
                <strong>Failed Attempts:</strong> ${failedAttempts}<br>
                <strong>IP Address:</strong> ${ipAddress}<br>
                <strong>Locked Until:</strong> ${formattedLockedUntil}
              </p>
            </div>
            
            <h2 style="color: #333; font-size: 20px; margin: 30px 0 15px 0;">What This Means</h2>
            <p style="font-size: 16px; margin-bottom: 20px;">
              To protect your account, we've temporarily restricted access after detecting ${failedAttempts} failed login attempts. 
              Your account will automatically unlock in <strong>${lockoutDuration}</strong>.
            </p>

            <h2 style="color: #333; font-size: 20px; margin: 30px 0 15px 0;">Progressive Security Lockout</h2>
            <div style="background: #f8f9fa; border-radius: 5px; padding: 15px; margin: 15px 0;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
                Our progressive lockout system increases security based on failed attempts:
              </p>
              <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #666;">
                <li><strong>Tier 1:</strong> 10 failures = 1 hour lockout</li>
                <li><strong>Tier 2:</strong> 20 failures = 24 hour lockout</li>
              </ul>
            </div>
            
            <h2 style="color: #333; font-size: 20px; margin: 30px 0 15px 0;">What to Do</h2>
            
            <div style="background: #e8f4fd; border: 1px solid #0d6efd; border-radius: 5px; padding: 15px; margin: 15px 0;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #084298;">
                <strong>If this was you:</strong>
              </p>
              <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #084298;">
                <li>Wait for the lockout period to expire (${lockoutDuration})</li>
                <li>Make sure you're using the correct password</li>
                <li>Consider using the "Forgot Password" option if needed</li>
              </ul>
            </div>

            <div style="background: #fef3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin: 15px 0;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #856404;">
                <strong>⚠️ If this wasn't you:</strong>
              </p>
              <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #856404;">
                <li>Someone may be trying to access your account</li>
                <li>Change your password immediately after the lockout expires</li>
                <li>Enable two-factor authentication (coming soon)</li>
                <li>Contact our support team if you suspect unauthorized access</li>
              </ul>
            </div>

            <h2 style="color: #333; font-size: 20px; margin: 30px 0 15px 0;">Need Help?</h2>
            <p style="font-size: 16px; margin-bottom: 20px;">
              If you're having trouble accessing your account or suspect unauthorized access, please contact our support team.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999; margin: 0;">
              This is an automated security notification from ${this.productName}. This email was sent because multiple failed login attempts were detected on your account.
            </p>
            
            <p style="font-size: 12px; color: #999; margin-top: 10px;">
              <strong>Security Details:</strong><br>
              Time: ${new Date().toLocaleString()}<br>
              IP Address: ${ipAddress}<br>
              Failed Attempts: ${failedAttempts}
            </p>
          </div>
        </body>
      </html>
    `;
  }
}

export const emailService = new EmailService();
