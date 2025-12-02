import { db } from "../db";
import { users, emailQueue, prospects, sequences } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { Resend } from "resend";
import { Sentry, isSentryEnabled } from "../sentry";

interface NotificationOptions {
  userId: string;
  type: "failed_send" | "bounce" | "high_bounce_rate" | "daily_summary" | "sequence_complete";
  data: Record<string, any>;
}

interface FailedSendAlert {
  prospectName: string;
  prospectEmail: string;
  subject: string;
  errorMessage: string;
  timestamp: Date;
}

interface BounceAlert {
  prospectName: string;
  prospectEmail: string;
  bounceReason: string;
  timestamp: Date;
}

interface HighBounceRateAlert {
  domain: string;
  bounceRate: number;
  totalSent: number;
  totalBounced: number;
  recommendation: string;
}

export class NotificationService {
  private resend: Resend | null = null;
  private fromEmail: string = "noreply@increff.com";

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  }

  async notify(options: NotificationOptions): Promise<boolean> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, options.userId)
      });

      if (!user) {
        console.error(`Notification failed: User ${options.userId} not found`);
        return false;
      }

      switch (options.type) {
        case "failed_send":
          return await this.notifyFailedSend(user.email, options.data as FailedSendAlert);
        case "bounce":
          return await this.notifyBounce(user.email, options.data as BounceAlert);
        case "high_bounce_rate":
          return await this.notifyHighBounceRate(user.email, options.data as HighBounceRateAlert);
        case "daily_summary":
          return await this.notifyDailySummary(user.email, options.data);
        case "sequence_complete":
          return await this.notifySequenceComplete(user.email, options.data);
        default:
          console.warn(`Unknown notification type: ${options.type}`);
          return false;
      }
    } catch (error) {
      console.error("Notification error:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'notification', operation: options.type }
        });
      }
      return false;
    }
  }

  private async notifyFailedSend(userEmail: string, alert: FailedSendAlert): Promise<boolean> {
    const subject = `⚠️ Email Failed to Send: ${alert.prospectName}`;
    const html = `
      <h2>Email Send Failed</h2>
      <p>An email failed to send to one of your prospects.</p>
      
      <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Prospect</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${alert.prospectName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Email</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${alert.prospectEmail}</td>
        </tr>
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Subject</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${alert.subject}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Error</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6; color: #dc3545;">${alert.errorMessage}</td>
        </tr>
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Time</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${alert.timestamp.toLocaleString()}</td>
        </tr>
      </table>
      
      <p style="margin-top: 20px; color: #6c757d;">
        <strong>Recommended Actions:</strong><br>
        1. Check your mailbox settings and credentials<br>
        2. Verify the prospect's email address is valid<br>
        3. Check if you've hit your daily sending limit
      </p>
    `;

    return await this.sendEmail(userEmail, subject, html);
  }

  private async notifyBounce(userEmail: string, alert: BounceAlert): Promise<boolean> {
    const subject = `📭 Email Bounced: ${alert.prospectEmail}`;
    const html = `
      <h2>Email Bounce Detected</h2>
      <p>An email to one of your prospects has bounced.</p>
      
      <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Prospect</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${alert.prospectName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Email</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${alert.prospectEmail}</td>
        </tr>
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>Reason</strong></td>
          <td style="padding: 10px; border: 1px solid #dee2e6; color: #dc3545;">${alert.bounceReason}</td>
        </tr>
      </table>
      
      <p style="margin-top: 20px; color: #6c757d;">
        <strong>This prospect has been automatically:</strong><br>
        ✓ Removed from active sequences<br>
        ✓ Marked as having an invalid email<br>
        ✓ Excluded from future email sends
      </p>
    `;

    return await this.sendEmail(userEmail, subject, html);
  }

  private async notifyHighBounceRate(userEmail: string, alert: HighBounceRateAlert): Promise<boolean> {
    const subject = `🚨 High Bounce Rate Alert: ${alert.domain}`;
    const html = `
      <h2>High Bounce Rate Detected</h2>
      <p>Your sending domain <strong>${alert.domain}</strong> has a high bounce rate.</p>
      
      <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <strong>Bounce Rate: ${alert.bounceRate.toFixed(1)}%</strong><br>
        ${alert.totalBounced} bounced out of ${alert.totalSent} emails sent
      </div>
      
      <p style="color: #dc3545;"><strong>⚠️ High bounce rates can damage your domain reputation and affect deliverability.</strong></p>
      
      <h3>Recommendations:</h3>
      <ul>
        <li>Verify your prospect email list quality</li>
        <li>Use email verification before sending</li>
        <li>Check your SPF, DKIM, and DMARC records</li>
        <li>Consider pausing campaigns until the issue is resolved</li>
        <li>Review recent prospect imports for data quality</li>
      </ul>
      
      <p style="margin-top: 20px; color: #6c757d;">
        ${alert.recommendation}
      </p>
    `;

    return await this.sendEmail(userEmail, subject, html);
  }

  private async notifyDailySummary(userEmail: string, data: Record<string, any>): Promise<boolean> {
    const subject = `📊 Daily Email Performance Summary - ${new Date().toLocaleDateString()}`;
    const html = `
      <h2>Your Daily Email Performance</h2>
      
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0;">
        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #1976d2;">${data.sent || 0}</div>
          <div style="color: #666;">Emails Sent</div>
        </div>
        <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #388e3c;">${data.opened || 0}</div>
          <div style="color: #666;">Opens</div>
        </div>
        <div style="background: #f3e5f5; padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #7b1fa2;">${data.replied || 0}</div>
          <div style="color: #666;">Replies</div>
        </div>
      </div>
      
      <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;">Open Rate</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>${data.openRate || 0}%</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;">Click Rate</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>${data.clickRate || 0}%</strong></td>
        </tr>
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;">Reply Rate</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>${data.replyRate || 0}%</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;">Bounce Rate</td>
          <td style="padding: 10px; border: 1px solid #dee2e6; ${(data.bounceRate || 0) > 5 ? 'color: #dc3545;' : ''}">${data.bounceRate || 0}%</td>
        </tr>
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;">Meeting Requests</td>
          <td style="padding: 10px; border: 1px solid #dee2e6; color: #28a745;"><strong>${data.meetingRequests || 0}</strong></td>
        </tr>
      </table>
    `;

    return await this.sendEmail(userEmail, subject, html);
  }

  private async notifySequenceComplete(userEmail: string, data: Record<string, any>): Promise<boolean> {
    const subject = `✅ Sequence Complete: ${data.sequenceName}`;
    const html = `
      <h2>Sequence Completed</h2>
      <p>Your sequence <strong>"${data.sequenceName}"</strong> has finished running.</p>
      
      <h3>Final Results:</h3>
      <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;">Total Prospects</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>${data.totalProspects || 0}</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;">Emails Sent</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>${data.emailsSent || 0}</strong></td>
        </tr>
        <tr style="background-color: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6;">Replies</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;"><strong>${data.replies || 0}</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6;">Reply Rate</td>
          <td style="padding: 10px; border: 1px solid #dee2e6; ${(data.replyRate || 0) > 10 ? 'color: #28a745;' : ''}">${data.replyRate || 0}%</td>
        </tr>
      </table>
    `;

    return await this.sendEmail(userEmail, subject, html);
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.resend) {
      console.log(`📧 Would send email to ${to}: ${subject}`);
      console.log(`(Resend not configured - logging instead)`);
      return true; // Return true in dev mode when Resend not configured
    }

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html
      });
      console.log(`📧 Notification sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      console.error(`Failed to send notification to ${to}:`, error);
      return false;
    }
  }

  /**
   * Check bounce rates and send alerts if they're too high
   */
  async checkBounceRatesAndAlert(userId: string): Promise<void> {
    try {
      const { emailTrackingService } = await import("./email-tracking.service");
      const domainHealth = await emailTrackingService.getDomainHealth(userId);

      for (const domain of domainHealth) {
        if (domain.bounceRate > 5 && domain.totalSent >= 10) {
          let recommendation = "";
          if (domain.bounceRate > 10) {
            recommendation = "CRITICAL: Consider pausing all email campaigns immediately and auditing your email list.";
          } else if (domain.bounceRate > 5) {
            recommendation = "WARNING: Review your prospect list quality and consider using email verification.";
          }

          await this.notify({
            userId,
            type: "high_bounce_rate",
            data: {
              domain: domain.domain,
              bounceRate: domain.bounceRate,
              totalSent: domain.totalSent,
              totalBounced: Math.round((domain.bounceRate / 100) * domain.totalSent),
              recommendation
            }
          });
        }
      }
    } catch (error) {
      console.error("Error checking bounce rates:", error);
    }
  }

  /**
   * Send a daily summary to a user
   */
  async sendDailySummaryToUser(userId: string): Promise<boolean> {
    try {
      const { emailTrackingService } = await import("./email-tracking.service");
      const summary = await emailTrackingService.getDailySummary(userId);

      return await this.notify({
        userId,
        type: "daily_summary",
        data: {
          ...summary,
          openRate: summary.sent > 0 ? Math.round((summary.opened / summary.sent) * 100) : 0,
          clickRate: summary.sent > 0 ? Math.round((summary.clicked / summary.sent) * 100) : 0,
          replyRate: summary.sent > 0 ? Math.round((summary.replied / summary.sent) * 100) : 0,
          bounceRate: summary.sent > 0 ? Math.round((summary.bounced / summary.sent) * 100) : 0
        }
      });
    } catch (error) {
      console.error("Error sending daily summary:", error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
