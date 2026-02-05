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
}

export async function getSystemState(params: {
  tenantId: string;
  userId: string;
  emailId?: string;
  sequenceId?: string;
  queueId?: string;
}): Promise<SystemState> {
  const { tenantId, userId, emailId, sequenceId, queueId } = params;
  
  let emailData: SystemState["email"] = null;
  let queueData: SystemState["queue"] = null;
  let sequenceData: SystemState["sequence"] = null;
  let prospectData: SystemState["prospect"] = null;
  let schedulerData: SystemState["scheduler"] = null;
  let recentAuditLogs: SystemState["recentAuditLogs"] = [];
  
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
    queue: queueData,
    sequence: sequenceData,
    prospect: prospectData,
    scheduler: schedulerData,
    recentAuditLogs,
  };
}
