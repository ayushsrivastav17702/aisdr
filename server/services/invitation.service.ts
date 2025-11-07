import { authService } from './auth.service';

export interface InvitationEmailData {
  email: string;
  token: string;
  inviterName: string;
  expiresAt: Date;
}

export class InvitationService {
  async sendInvitationEmail(data: InvitationEmailData): Promise<void> {
    const inviteUrl = `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/accept-invitation?token=${data.token}`;
    
    const expiryHours = Math.round((data.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
    
    console.log('📧 Invitation email (Resend not configured):');
    console.log('To:', data.email);
    console.log('Subject: You\'re invited to join the SDR Platform');
    console.log('Invite URL:', inviteUrl);
    console.log('Expires in:', expiryHours, 'hours');
    console.log('---');
    console.log('Note: To enable actual email sending, set up Resend integration with RESEND_API_KEY');
  }

  async createAndSendInvitation(
    email: string,
    role: 'admin' | 'user',
    invitedBy: string,
    inviterName: string
  ): Promise<{ id: string; inviteUrl: string }> {
    const invitation = await authService.createInvitation(email, role, invitedBy);
    
    await this.sendInvitationEmail({
      email,
      token: invitation.token,
      inviterName,
      expiresAt: invitation.expiresAt,
    });

    const inviteUrl = `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/accept-invitation?token=${invitation.token}`;

    return {
      id: invitation.id,
      inviteUrl,
    };
  }
}

export const invitationService = new InvitationService();
