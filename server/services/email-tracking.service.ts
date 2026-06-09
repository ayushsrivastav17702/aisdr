import { db } from "../db";
import { emails, emailQueue, prospects, sequences, emailReplies, leadEvents } from "@shared/schema";
import { eq, and, sql, gte, count, desc } from "drizzle-orm";
import { Sentry, isSentryEnabled } from "../sentry";
import { nanoid } from "nanoid";
import crypto from "crypto";

const TRACKING_SECRET = process.env.SESSION_SECRET || "email-tracking-secret-key";

interface TrackingPixelResult {
  trackingId: string;
  pixelUrl: string;
}

interface ClickTrackingResult {
  wrappedUrl: string;
  trackingId: string;
}

interface EmailPerformanceMetrics {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  totalBounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  meetingRate: number;
}

interface SequenceStepPerformance {
  stepOrder: number;
  subject: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

interface DomainHealth {
  domain: string;
  totalSent: number;
  bounceRate: number;
  spamRate: number;
  replyRate: number;
  score: number; // 0-100
  status: "healthy" | "warning" | "critical";
}

interface DailySummary {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  positiveReplies: number;
  meetingRequests: number;
  unsubscribes: number;
}

export class EmailTrackingService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.PUBLIC_URL || process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000';
  }

  /**
   * Generate HMAC signature for URL to prevent tampering
   */
  private generateSignature(trackingId: string, url: string): string {
    const hmac = crypto.createHmac('sha256', TRACKING_SECRET);
    hmac.update(`${trackingId}:${url}`);
    return hmac.digest('hex').substring(0, 16); // Use first 16 chars for shorter URLs
  }

  /**
   * Verify HMAC signature for click tracking URL
   */
  verifySignature(trackingId: string, url: string, signature: string): boolean {
    try {
      const expectedSignature = this.generateSignature(trackingId, url);
      
      // Length check to prevent timingSafeEqual from throwing
      if (!signature || signature.length !== expectedSignature.length) {
        return false;
      }
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      // Any crypto error means invalid signature
      return false;
    }
  }

  /**
   * Generate a tracking pixel for email opens
   */
  generateTrackingPixel(emailId: string): TrackingPixelResult {
    const trackingId = nanoid(16);
    const pixelUrl = `${this.baseUrl}/api/track/open/${trackingId}`;
    
    return {
      trackingId,
      pixelUrl,
    };
  }

  /**
   * Generate HTML for the tracking pixel
   */
  getTrackingPixelHtml(trackingId: string): string {
    const pixelUrl = `${this.baseUrl}/api/track/open/${trackingId}`;
    return `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
  }

  /**
   * Wrap a URL for click tracking
   * Uses the main email trackingId so all clicks can be linked back to the email
   * Includes HMAC signature to prevent URL tampering
   */
  wrapUrlForTracking(originalUrl: string, trackingId: string): ClickTrackingResult {
    const signature = this.generateSignature(trackingId, originalUrl);
    const wrappedUrl = `${this.baseUrl}/api/track/click/${trackingId}?url=${encodeURIComponent(originalUrl)}&sig=${signature}`;
    
    return {
      wrappedUrl,
      trackingId,
    };
  }

  /**
   * Wrap all URLs in HTML content for tracking
   * Uses the same trackingId for all links so they're all tied to the same email
   */
  wrapAllUrls(htmlContent: string, trackingId: string): string {
    const urlPattern = /href=["'](https?:\/\/[^"']+)["']/gi;
    
    return htmlContent.replace(urlPattern, (match, url) => {
      // Don't wrap tracking pixels or unsubscribe links
      if (url.includes('/api/track/') || url.includes('unsubscribe')) {
        return match;
      }
      
      const { wrappedUrl } = this.wrapUrlForTracking(url, trackingId);
      return `href="${wrappedUrl}"`;
    });
  }

  /**
   * Record an email open event
   */
  async recordOpen(trackingId: string): Promise<boolean> {
    try {
      // Find the email by tracking ID
      const [email] = await db
        .select()
        .from(emails)
        .where(eq(emails.trackingId, trackingId))
        .limit(1);

      if (!email) {
        console.log(`⚠️ Open tracking: Email not found for tracking ID ${trackingId}`);
        return false;
      }

      // Only record first open
      if (!email.openedAt) {
        await db
          .update(emails)
          .set({ openedAt: new Date() })
          .where(eq(emails.id, email.id));

        console.log(`📨 Email opened: ${email.id}`);

        // FIX-5: Emit 'opened' lead_event for funnel analytics
        if (email.sequenceId && email.userId) {
          try {
            await db.insert(leadEvents).values({
              userId: email.userId,
              leadId: email.prospectId,
              sequenceId: email.sequenceId,
              stepId: null, // trackingId → stepId lookup not needed for funnel
              eventType: 'opened',
              metadata: { emailId: email.id },
            }).onConflictDoNothing();
          } catch (leErr) {
            console.warn('[lead_events] Failed to insert opened event (non-fatal):', leErr);
          }
        }
      }

      return true;
    } catch (error) {
      console.error("❌ Error recording email open:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'email-tracking', operation: 'recordOpen' }
        });
      }
      return false;
    }
  }

  /**
   * Record an email click event
   */
  async recordClick(trackingId: string): Promise<string | null> {
    try {
      // Find the email by tracking ID (we store the main tracking ID)
      const [email] = await db
        .select()
        .from(emails)
        .where(eq(emails.trackingId, trackingId))
        .limit(1);

      if (email) {
        // Record click if not already clicked
        if (!email.clickedAt) {
          await db
            .update(emails)
            .set({ clickedAt: new Date() })
            .where(eq(emails.id, email.id));

          console.log(`🔗 Email link clicked: ${email.id}`);

          // FIX-5: Emit 'clicked' lead_event for funnel analytics
          if (email.sequenceId && email.userId) {
            try {
              await db.insert(leadEvents).values({
                userId: email.userId,
                leadId: email.prospectId,
                sequenceId: email.sequenceId,
                stepId: null,
                eventType: 'clicked',
                metadata: { emailId: email.id },
              }).onConflictDoNothing();
            } catch (leErr) {
              console.warn('[lead_events] Failed to insert clicked event (non-fatal):', leErr);
            }
          }
        }
      }

      return null; // URL will be extracted from query param
    } catch (error) {
      console.error("❌ Error recording email click:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'email-tracking', operation: 'recordClick' }
        });
      }
      return null;
    }
  }

  /**
   * Get performance metrics for a user
   */
  async getPerformanceMetrics(userId: string, days: number = 30): Promise<EmailPerformanceMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [metrics] = await db
      .select({
        totalSent: count(),
        totalOpened: sql<number>`count(*) filter (where ${emails.openedAt} is not null)`,
        totalClicked: sql<number>`count(*) filter (where ${emails.clickedAt} is not null)`,
        totalReplied: sql<number>`count(*) filter (where ${emails.repliedAt} is not null)`,
        totalBounced: sql<number>`count(*) filter (where ${emails.bouncedAt} is not null)`,
      })
      .from(emails)
      .innerJoin(prospects, eq(emails.prospectId, prospects.id))
      .where(
        and(
          eq(prospects.userId, userId),
          gte(emails.sentAt, startDate)
        )
      );

    const totalSent = Number(metrics.totalSent) || 0;
    const totalOpened = Number(metrics.totalOpened) || 0;
    const totalClicked = Number(metrics.totalClicked) || 0;
    const totalReplied = Number(metrics.totalReplied) || 0;
    const totalBounced = Number(metrics.totalBounced) || 0;

    // Calculate meeting rate from positive replies with meeting intent
    const [meetingMetrics] = await db
      .select({ count: count() })
      .from(emailReplies)
      .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(
        and(
          eq(prospects.userId, userId),
          eq(emailReplies.intent, "meeting_request"),
          gte(emailReplies.receivedAt, startDate)
        )
      );

    const meetingRequests = Number(meetingMetrics?.count) || 0;

    return {
      totalSent,
      totalOpened,
      totalClicked,
      totalReplied,
      totalBounced,
      openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0,
      clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 1000) / 10 : 0,
      replyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 1000) / 10 : 0,
      bounceRate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 1000) / 10 : 0,
      meetingRate: totalSent > 0 ? Math.round((meetingRequests / totalSent) * 1000) / 10 : 0,
    };
  }

  /**
   * Get per-step performance for a sequence
   */
  async getSequenceStepPerformance(sequenceId: string, userId: string): Promise<SequenceStepPerformance[]> {
    const stepPerformance = await db
      .select({
        stepOrder: emailQueue.stepOrder,
        subject: emails.subject,
        sent: count(),
        opened: sql<number>`count(*) filter (where ${emails.openedAt} is not null)`,
        clicked: sql<number>`count(*) filter (where ${emails.clickedAt} is not null)`,
        replied: sql<number>`count(*) filter (where ${emails.repliedAt} is not null)`,
      })
      .from(emails)
      .innerJoin(emailQueue, eq(emailQueue.emailId, emails.id))
      .innerJoin(prospects, eq(emails.prospectId, prospects.id))
      .where(
        and(
          eq(emails.sequenceId, sequenceId),
          eq(prospects.userId, userId)
        )
      )
      .groupBy(emailQueue.stepOrder, emails.subject)
      .orderBy(emailQueue.stepOrder);

    return stepPerformance.map(step => {
      const sent = Number(step.sent) || 0;
      const opened = Number(step.opened) || 0;
      const clicked = Number(step.clicked) || 0;
      const replied = Number(step.replied) || 0;

      return {
        stepOrder: step.stepOrder || 1,
        subject: step.subject || "",
        sent,
        opened,
        clicked,
        replied,
        openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
        clickRate: sent > 0 ? Math.round((clicked / sent) * 1000) / 10 : 0,
        replyRate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
      };
    });
  }

  /**
   * Calculate domain health score
   */
  async getDomainHealth(userId: string): Promise<DomainHealth[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get unique sending domains from user's mailboxes
    const { emailMailboxes } = await import("@shared/schema");
    const mailboxes = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.userId, userId));

    const domainHealth: DomainHealth[] = [];

    for (const mailbox of mailboxes) {
      const domain = mailbox.email.split('@')[1];
      
      const [metrics] = await db
        .select({
          totalSent: count(),
          bounced: sql<number>`count(*) filter (where ${emails.bouncedAt} is not null)`,
          replied: sql<number>`count(*) filter (where ${emails.repliedAt} is not null)`,
        })
        .from(emails)
        .innerJoin(emailQueue, eq(emails.id, emailQueue.emailId))
        .where(
          and(
            eq(emailQueue.mailboxId, mailbox.id),
            gte(emails.sentAt, thirtyDaysAgo)
          )
        );

      const totalSent = Number(metrics?.totalSent) || 0;
      const bounced = Number(metrics?.bounced) || 0;
      const replied = Number(metrics?.replied) || 0;

      const bounceRate = totalSent > 0 ? (bounced / totalSent) * 100 : 0;
      const replyRate = totalSent > 0 ? (replied / totalSent) * 100 : 0;

      // Calculate health score (0-100)
      // Good: high reply rate, low bounce rate
      let score = 100;
      score -= bounceRate * 10; // Penalize bounces heavily
      score += replyRate * 2; // Reward replies
      score = Math.max(0, Math.min(100, score));

      let status: DomainHealth["status"] = "healthy";
      if (score < 50) status = "critical";
      else if (score < 75) status = "warning";

      domainHealth.push({
        domain,
        totalSent,
        bounceRate: Math.round(bounceRate * 10) / 10,
        spamRate: 0, // Would need ISP feedback loops to track
        replyRate: Math.round(replyRate * 10) / 10,
        score: Math.round(score),
        status,
      });
    }

    return domainHealth;
  }

  /**
   * Get best and worst performing email lines
   */
  async getTopPerformingContent(userId: string, limit: number = 5): Promise<{
    bestSubjects: { subject: string; openRate: number; sent: number }[];
    worstSubjects: { subject: string; openRate: number; sent: number }[];
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const subjectPerformance = await db
      .select({
        subject: emails.subject,
        sent: count(),
        opened: sql<number>`count(*) filter (where ${emails.openedAt} is not null)`,
      })
      .from(emails)
      .innerJoin(prospects, eq(emails.prospectId, prospects.id))
      .where(
        and(
          eq(prospects.userId, userId),
          gte(emails.sentAt, thirtyDaysAgo)
        )
      )
      .groupBy(emails.subject)
      .having(sql`count(*) >= 5`); // Only include subjects with 5+ sends

    const performanceData = subjectPerformance.map(s => ({
      subject: s.subject || "",
      sent: Number(s.sent) || 0,
      openRate: Number(s.sent) > 0 ? Math.round((Number(s.opened) / Number(s.sent)) * 1000) / 10 : 0,
    }));

    // Sort by open rate
    performanceData.sort((a, b) => b.openRate - a.openRate);

    return {
      bestSubjects: performanceData.slice(0, limit),
      worstSubjects: performanceData.slice(-limit).reverse(),
    };
  }

  /**
   * Generate daily performance summary
   */
  async getDailySummary(userId: string, date: Date = new Date()): Promise<{
    date: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    positiveReplies: number;
    meetingRequests: number;
    unsubscribes: number;
  }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [emailMetrics] = await db
      .select({
        sent: count(),
        opened: sql<number>`count(*) filter (where ${emails.openedAt} between ${startOfDay} and ${endOfDay})`,
        clicked: sql<number>`count(*) filter (where ${emails.clickedAt} between ${startOfDay} and ${endOfDay})`,
        replied: sql<number>`count(*) filter (where ${emails.repliedAt} between ${startOfDay} and ${endOfDay})`,
        bounced: sql<number>`count(*) filter (where ${emails.bouncedAt} between ${startOfDay} and ${endOfDay})`,
      })
      .from(emails)
      .innerJoin(prospects, eq(emails.prospectId, prospects.id))
      .where(
        and(
          eq(prospects.userId, userId),
          gte(emails.sentAt, startOfDay),
          sql`${emails.sentAt} <= ${endOfDay}`
        )
      );

    const [replyMetrics] = await db
      .select({
        positiveReplies: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
        meetingRequests: sql<number>`count(*) filter (where ${emailReplies.intent} = 'meeting_request')`,
        unsubscribes: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'unsubscribe')`,
      })
      .from(emailReplies)
      .innerJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(
        and(
          eq(prospects.userId, userId),
          gte(emailReplies.receivedAt, startOfDay),
          sql`${emailReplies.receivedAt} <= ${endOfDay}`
        )
      );

    return {
      date: date.toISOString().split('T')[0],
      sent: Number(emailMetrics?.sent) || 0,
      opened: Number(emailMetrics?.opened) || 0,
      clicked: Number(emailMetrics?.clicked) || 0,
      replied: Number(emailMetrics?.replied) || 0,
      bounced: Number(emailMetrics?.bounced) || 0,
      positiveReplies: Number(replyMetrics?.positiveReplies) || 0,
      meetingRequests: Number(replyMetrics?.meetingRequests) || 0,
      unsubscribes: Number(replyMetrics?.unsubscribes) || 0,
    };
  }

  /**
   * Generate weekly performance summary
   */
  async getWeeklySummary(userId: string): Promise<{
    weekStart: string;
    weekEnd: string;
    dailySummaries: DailySummary[];
    totals: EmailPerformanceMetrics;
    trend: {
      sentChange: number;
      openRateChange: number;
      replyRateChange: number;
    };
  }> {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Get daily summaries for the week
    const dailySummaries = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const summary = await this.getDailySummary(userId, date);
      dailySummaries.push(summary);
    }

    // Get this week's totals
    const thisWeekMetrics = await this.getPerformanceMetrics(userId, 7);

    // Get last week's totals for trend comparison
    const lastWeekMetrics = await this.getPerformanceMetrics(userId, 14);
    // Calculate just last week by subtracting this week
    const lastWeekOnly = {
      totalSent: lastWeekMetrics.totalSent - thisWeekMetrics.totalSent,
      openRate: lastWeekMetrics.openRate,
      replyRate: lastWeekMetrics.replyRate,
    };

    const trend = {
      sentChange: lastWeekOnly.totalSent > 0 
        ? Math.round(((thisWeekMetrics.totalSent - lastWeekOnly.totalSent) / lastWeekOnly.totalSent) * 100)
        : 0,
      openRateChange: lastWeekOnly.openRate > 0
        ? Math.round((thisWeekMetrics.openRate - lastWeekOnly.openRate) * 10) / 10
        : 0,
      replyRateChange: lastWeekOnly.replyRate > 0
        ? Math.round((thisWeekMetrics.replyRate - lastWeekOnly.replyRate) * 10) / 10
        : 0,
    };

    return {
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      dailySummaries,
      totals: thisWeekMetrics,
      trend,
    };
  }
}

export const emailTrackingService = new EmailTrackingService();
