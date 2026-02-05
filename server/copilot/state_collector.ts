import { db } from "../db";
import { 
  emailQueue, 
  emails, 
  sequences, 
  prospects, 
  schedulerHeartbeat,
  auditLogs,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export interface SystemState {
  email: {
    id: string;
    status: string;
    subject: string | null;
    sentAt: Date | null;
    failedAt: Date | null;
    lastError: string | null;
    failureReason: string | null;
    messageId: string | null;
  } | null;
  emailSummary?: {
    totalCount: number;
    failedCount: number;
    topErrors: string[];
  };
  queue: {
    id: string;
    status: string | null;
    attempts: number | null;
    scheduledFor: Date;
    lastAttemptAt: Date | null;
    nextRetryAt: Date | null;
    lastError: string | null;
    failureReason: string | null;
  } | null;
  sequence: {
    id: string;
    name: string;
    status: string | null;
    isActive: boolean | null;
  } | null;
  prospect: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    company: string | null;
  } | null;
  scheduler: {
    status: string;
    lastHeartbeat: Date;
    failedCount: number | null;
  } | null;
  recentAuditLogs: Array<{
    action: string;
    module: string | null;
    createdAt: Date;
  }>;
  metricsContext?: {
    deliveryRate?: number;
    failureRate?: number;
    queueDepth?: number;
    stuckCount?: number;
  };
}

export async function getSystemState(params: {
  tenantId: string;
  userId: string;
  emailId?: string;
  sequenceId?: string;
  queueId?: string;
  emailIds?: string[];
  queueIds?: string[];
  metricsContext?: {
    deliveryRate?: number;
    failureRate?: number;
    queueDepth?: number;
    stuckCount?: number;
  };
}): Promise<SystemState> {
  const { tenantId, userId, emailId, sequenceId, queueId, emailIds, queueIds, metricsContext } = params;
  
  let emailData: SystemState["email"] = null;
  let queueData: SystemState["queue"] = null;
  let sequenceData: SystemState["sequence"] = null;
  let prospectData: SystemState["prospect"] = null;
  let schedulerData: SystemState["scheduler"] = null;
  let recentAuditLogs: SystemState["recentAuditLogs"] = [];
  let emailSummary: SystemState["emailSummary"] = undefined;
  
  if (queueId) {
    const queueResult = await db
      .select({
        id: emailQueue.id,
        status: emailQueue.status,
        attempts: emailQueue.attempts,
        scheduledFor: emailQueue.scheduledFor,
        lastAttemptAt: emailQueue.lastAttemptAt,
        nextRetryAt: emailQueue.nextRetryAt,
        lastError: emailQueue.lastError,
        failureReason: emailQueue.failureReason,
        prospectId: emailQueue.prospectId,
        sequenceId: emailQueue.sequenceId,
        emailId: emailQueue.emailId,
      })
      .from(emailQueue)
      .where(
        and(
          eq(emailQueue.id, queueId),
          eq(emailQueue.userId, userId)
        )
      )
      .limit(1);
    
    if (queueResult[0]) {
      const q = queueResult[0];
      queueData = {
        id: q.id,
        status: q.status,
        attempts: q.attempts,
        scheduledFor: q.scheduledFor,
        lastAttemptAt: q.lastAttemptAt,
        nextRetryAt: q.nextRetryAt,
        lastError: q.lastError,
        failureReason: q.failureReason,
      };
      
      if (q.prospectId) {
        const prospectResult = await db
          .select({
            id: prospects.id,
            firstName: prospects.firstName,
            lastName: prospects.lastName,
            email: prospects.primaryEmail,
            company: prospects.companyName,
          })
          .from(prospects)
          .where(
            and(
              eq(prospects.id, q.prospectId),
              eq(prospects.userId, userId)
            )
          )
          .limit(1);
        
        if (prospectResult[0]) {
          prospectData = prospectResult[0];
        }
      }
      
      if (q.sequenceId) {
        const seqResult = await db
          .select({
            id: sequences.id,
            name: sequences.name,
            status: sequences.status,
            isApproved: sequences.isApproved,
          })
          .from(sequences)
          .where(
            and(
              eq(sequences.id, q.sequenceId),
              eq(sequences.userId, userId)
            )
          )
          .limit(1);
        
        if (seqResult[0]) {
          sequenceData = {
            id: seqResult[0].id,
            name: seqResult[0].name,
            status: seqResult[0].status,
            isActive: seqResult[0].isApproved,
          };
        }
      }
    }
  }
  
  if (emailId) {
    const emailResult = await db
      .select({
        id: emails.id,
        status: emails.status,
        subject: emails.subject,
        sentAt: emails.sentAt,
        messageId: emails.messageId,
        prospectId: emails.prospectId,
        sequenceId: emails.sequenceId,
      })
      .from(emails)
      .where(
        and(
          eq(emails.id, emailId),
          eq(emails.userId, userId)
        )
      )
      .limit(1);
    
    if (emailResult[0]) {
      const e = emailResult[0];
      emailData = {
        id: e.id,
        status: e.status || "unknown",
        subject: e.subject,
        sentAt: e.sentAt,
        failedAt: null,
        lastError: null,
        failureReason: null,
        messageId: e.messageId,
      };
    }
  }
  
  if (sequenceId && !sequenceData) {
    const seqResult = await db
      .select({
        id: sequences.id,
        name: sequences.name,
        status: sequences.status,
        isApproved: sequences.isApproved,
      })
      .from(sequences)
      .where(
        and(
          eq(sequences.id, sequenceId),
          eq(sequences.userId, userId)
        )
      )
      .limit(1);
    
    if (seqResult[0]) {
      sequenceData = {
        id: seqResult[0].id,
        name: seqResult[0].name,
        status: seqResult[0].status,
        isActive: seqResult[0].isApproved,
      };
    }
  }
  
  // Process emailIds array for summary
  if (emailIds && emailIds.length > 0) {
    try {
      const emailResults = await db
        .select({
          status: emailQueue.status,
          lastError: emailQueue.lastError,
          failureReason: emailQueue.failureReason,
        })
        .from(emailQueue)
        .where(
          and(
            sql`${emailQueue.id} = ANY(${emailIds})`,
            eq(emailQueue.userId, userId)
          )
        )
        .limit(20);
      
      const failedCount = emailResults.filter(e => e.status === "failed").length;
      const errorCounts = new Map<string, number>();
      
      emailResults.forEach(e => {
        if (e.failureReason) {
          const normalized = e.failureReason.substring(0, 50);
          errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1);
        } else if (e.lastError) {
          const normalized = e.lastError.substring(0, 50);
          errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1);
        }
      });
      
      const topErrors = Array.from(errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([error]) => error);
      
      emailSummary = {
        totalCount: emailResults.length,
        failedCount,
        topErrors,
      };
    } catch (error) {
      console.error("[Copilot] Error processing emailIds:", error);
    }
  }
  
  const heartbeatResult = await db
    .select({
      status: schedulerHeartbeat.status,
      lastHeartbeat: schedulerHeartbeat.lastHeartbeat,
      failedCount: schedulerHeartbeat.failedCount,
    })
    .from(schedulerHeartbeat)
    .where(eq(schedulerHeartbeat.schedulerType, "email_queue"))
    .limit(1);
  
  if (heartbeatResult[0]) {
    schedulerData = heartbeatResult[0];
  }
  
  const auditResult = await db
    .select({
      action: auditLogs.action,
      module: auditLogs.module,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);
  
  recentAuditLogs = auditResult;
  
  return {
    email: emailData,
    emailSummary,
    queue: queueData,
    sequence: sequenceData,
    prospect: prospectData,
    scheduler: schedulerData,
    recentAuditLogs,
    metricsContext,
  };
}
