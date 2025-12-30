import { authService } from './auth.service';
import { emailService } from './email.service';

export interface InvitationEmailData {
  email: string;
  token: string;
  inviterName: string;
  expiresAt: Date;
  role?: 'admin' | 'user';
}

export class InvitationService {
  async sendInvitationEmail(data: InvitationEmailData): Promise<void> {
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000';
    
    const inviteUrl = `${baseUrl}/accept-invitation?token=${data.token}`;
    
    try {
      await emailService.sendInvitationEmail({
        to: data.email,
        inviterName: data.inviterName,
        inviteUrl,
        role: data.role || 'user',
      });
      console.log(`✅ Invitation email sent to ${data.email}`);
    } catch (error) {
      console.error(`❌ Failed to send invitation email to ${data.email}:`, error);
      throw error;
    }
  }

  async createAndSendInvitation(
    email: string,
    role: 'admin' | 'user',
    invitedBy: string,
    inviterName: string
  ): Promise<{ id: string; inviteUrl: string }> {
    const invitation = await authService.createInvitation(email, role, invitedBy);
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000';
    
    const inviteUrl = `${baseUrl}/accept-invitation?token=${invitation.token}`;
    
    try {
      await emailService.sendInvitationEmail({
        to: email,
        inviterName,
        inviteUrl,
        role,
      });
      console.log(`✅ Invitation email sent to ${email}`);
    } catch (error) {
      console.error(`❌ Failed to send invitation email to ${email}:`, error);
    }

    return {
      id: invitation.id,
      inviteUrl,
    };
  }
}

export const invitationService = new InvitationService();
