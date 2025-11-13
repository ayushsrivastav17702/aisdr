import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface InvitationEmailData {
  to: string;
  inviterName: string;
  inviteUrl: string;
  role: string;
}

export class EmailService {
  private fromEmail = 'onboarding@resend.dev'; // Default Resend test email
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
}

export const emailService = new EmailService();
