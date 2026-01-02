import { db } from "../db";
import { 
  sdrWorkflowProgress,
  SDRWorkflowProgress,
  SDRWorkflowBlockingReason,
  emailMailboxes,
  prospects,
  sequences,
  sequenceProspects,
  emails,
  emailReplies,
  users
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { auditService } from "./audit.service";

// Stage order for validation
const STAGE_ORDER = [
  "readiness",
  "upload", 
  "enrichment",
  "sequence",
  "enrollment",
  "activation",
  "sending",
  "replies",
  "analytics"
] as const;

type SDRWorkflowStage = typeof STAGE_ORDER[number];

// Error codes for workflow blocking
export const WORKFLOW_ERROR_CODES = {
  STAGE_NOT_REACHED: "STAGE_NOT_REACHED",
  MAILBOX_NOT_CONNECTED: "MAILBOX_NOT_CONNECTED",
  SPF_INVALID: "SPF_INVALID",
  DKIM_INVALID: "DKIM_INVALID",
  WARMUP_INCOMPLETE: "WARMUP_INCOMPLETE",
  NO_RAW_PROSPECTS: "NO_RAW_PROSPECTS",
  NO_ENRICHED_PROSPECTS: "NO_ENRICHED_PROSPECTS",
  NO_DRAFT_SEQUENCE: "NO_DRAFT_SEQUENCE",
  NO_ENROLLED_PROSPECTS: "NO_ENROLLED_PROSPECTS",
  NO_ACTIVE_SEQUENCE: "NO_ACTIVE_SEQUENCE",
  NO_EMAILS_SENT: "NO_EMAILS_SENT",
  NO_REPLIES_DETECTED: "NO_REPLIES_DETECTED",
  USER_PAUSED: "USER_PAUSED",
  MANAGER_PAUSED: "MANAGER_PAUSED",
  TENANT_PAUSED: "TENANT_PAUSED",
  DAILY_LIMIT_EXCEEDED: "DAILY_LIMIT_EXCEEDED",
  AI_QUOTA_EXCEEDED: "AI_QUOTA_EXCEEDED",
  ENROLLMENT_LIMIT_EXCEEDED: "ENROLLMENT_LIMIT_EXCEEDED",
} as const;

export interface WorkflowState {
  currentStage: SDRWorkflowStage;
  organizationId: string;
  blockingReasons: SDRWorkflowBlockingReason[];
  stageTimestamps: {
    readinessCompletedAt: Date | null;
    uploadCompletedAt: Date | null;
    enrichmentCompletedAt: Date | null;
    sequenceCompletedAt: Date | null;
    enrollmentCompletedAt: Date | null;
    activationCompletedAt: Date | null;
    sendingStartedAt: Date | null;
    repliesDetectedAt: Date | null;
    analyticsUnlockedAt: Date | null;
  };
  canAdvance: boolean;
  nextStage: SDRWorkflowStage | null;
}

export class SDRWorkflowService {
  private getStageIndex(stage: SDRWorkflowStage): number {
    return STAGE_ORDER.indexOf(stage);
  }

  private getNextStage(stage: SDRWorkflowStage): SDRWorkflowStage | null {
    const index = this.getStageIndex(stage);
    return index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null;
  }

  async getOrCreateProgress(userId: string, organizationId: string): Promise<SDRWorkflowProgress> {
    const existing = await db
      .select()
      .from(sdrWorkflowProgress)
      .where(eq(sdrWorkflowProgress.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const [created] = await db
      .insert(sdrWorkflowProgress)
      .values({
        userId,
        organizationId,
        currentStage: "readiness",
        blockingReasons: [],
      })
      .returning();

    await auditService.log({
      action: "SDR_WORKFLOW_INITIALIZED",
      userId,
      module: "sdr_workflow",
      details: { 
        resourceId: created.id, 
        organizationId,
        initialStage: "readiness",
        timestamp: new Date().toISOString(),
      },
    });

    return created;
  }

  async getWorkflowState(userId: string): Promise<WorkflowState | null> {
    const progress = await db
      .select()
      .from(sdrWorkflowProgress)
      .where(eq(sdrWorkflowProgress.userId, userId))
      .limit(1);

    if (progress.length === 0) {
      return null;
    }

    const p = progress[0];
    const currentStage = p.currentStage as SDRWorkflowStage;
    const blockingReasons = await this.computeBlockingReasons(userId, p.organizationId, currentStage);
    const nextStage = this.getNextStage(currentStage);

    return {
      currentStage,
      organizationId: p.organizationId,
      blockingReasons,
      stageTimestamps: {
        readinessCompletedAt: p.readinessCompletedAt,
        uploadCompletedAt: p.uploadCompletedAt,
        enrichmentCompletedAt: p.enrichmentCompletedAt,
        sequenceCompletedAt: p.sequenceCompletedAt,
        enrollmentCompletedAt: p.enrollmentCompletedAt,
        activationCompletedAt: p.activationCompletedAt,
        sendingStartedAt: p.sendingStartedAt,
        repliesDetectedAt: p.repliesDetectedAt,
        analyticsUnlockedAt: p.analyticsUnlockedAt,
      },
      canAdvance: blockingReasons.length === 0,
      nextStage,
    };
  }

  async assertStage(userId: string, requiredStage: SDRWorkflowStage): Promise<void> {
    const state = await this.getWorkflowState(userId);
    
    if (!state) {
      throw new WorkflowBlockedError(
        WORKFLOW_ERROR_CODES.STAGE_NOT_REACHED,
        "Workflow not initialized",
        requiredStage,
        []
      );
    }

    const currentIndex = this.getStageIndex(state.currentStage);
    const requiredIndex = this.getStageIndex(requiredStage);

    if (currentIndex < requiredIndex) {
      const blockingReasons: SDRWorkflowBlockingReason[] = [{
        code: WORKFLOW_ERROR_CODES.STAGE_NOT_REACHED,
        message: `You must complete the ${state.currentStage} stage before accessing ${requiredStage}`,
        module: state.currentStage,
        severity: "error",
        metadata: { 
          currentStage: state.currentStage, 
          requiredStage,
          currentIndex,
          requiredIndex
        },
      }];

      await auditService.log({
        action: "SDR_WORKFLOW_BLOCKED",
        userId,
        module: "sdr_workflow",
        details: { 
          attemptedStage: requiredStage,
          currentStage: state.currentStage,
          blockingReasons,
        },
      });

      throw new WorkflowBlockedError(
        WORKFLOW_ERROR_CODES.STAGE_NOT_REACHED,
        `Stage ${requiredStage} is locked. Complete ${state.currentStage} first.`,
        requiredStage,
        blockingReasons
      );
    }
  }

  async advanceStage(userId: string, toStage: SDRWorkflowStage): Promise<SDRWorkflowProgress> {
    const state = await this.getWorkflowState(userId);
    
    if (!state) {
      throw new Error("Workflow not initialized");
    }

    const currentIndex = this.getStageIndex(state.currentStage);
    const targetIndex = this.getStageIndex(toStage);

    if (targetIndex !== currentIndex + 1) {
      throw new Error(`Cannot advance from ${state.currentStage} to ${toStage}. Must advance sequentially.`);
    }

    if (state.blockingReasons.length > 0) {
      throw new WorkflowBlockedError(
        WORKFLOW_ERROR_CODES.STAGE_NOT_REACHED,
        `Cannot advance: ${state.blockingReasons.map(r => r.message).join(", ")}`,
        toStage,
        state.blockingReasons
      );
    }

    const timestampField = this.getTimestampFieldForStage(state.currentStage);
    const updateData: Record<string, unknown> = {
      currentStage: toStage,
      updatedAt: new Date(),
      blockingReasons: [],
    };

    if (timestampField) {
      updateData[timestampField] = new Date();
    }

    const [updated] = await db
      .update(sdrWorkflowProgress)
      .set(updateData)
      .where(eq(sdrWorkflowProgress.userId, userId))
      .returning();

    await auditService.log({
      action: "SDR_WORKFLOW_STAGE_ADVANCED",
      userId,
      module: "sdr_workflow",
      details: {
        resourceId: updated.id,
        fromStage: state.currentStage,
        toStage,
        timestamp: new Date().toISOString(),
      },
    });

    return updated;
  }

  async block(userId: string, reasonCode: string, message: string, module: string, metadata?: Record<string, unknown>): Promise<void> {
    const reason: SDRWorkflowBlockingReason = {
      code: reasonCode,
      message,
      module,
      severity: "error",
      metadata,
    };

    await db
      .update(sdrWorkflowProgress)
      .set({
        blockingReasons: sql`COALESCE(blocking_reasons, '[]'::jsonb) || ${JSON.stringify([reason])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(sdrWorkflowProgress.userId, userId));

    await auditService.log({
      action: "SDR_WORKFLOW_BLOCKED",
      userId,
      module: "sdr_workflow",
      details: { reason },
    });
  }

  async clearBlocks(userId: string): Promise<void> {
    await db
      .update(sdrWorkflowProgress)
      .set({
        blockingReasons: [],
        updatedAt: new Date(),
      })
      .where(eq(sdrWorkflowProgress.userId, userId));

    await auditService.log({
      action: "SDR_WORKFLOW_BLOCKS_CLEARED",
      userId,
      module: "sdr_workflow",
      details: { timestamp: new Date().toISOString() },
    });
  }

  async forceAdvance(userId: string, toStage: SDRWorkflowStage, superAdminId: string): Promise<SDRWorkflowProgress> {
    const progress = await db
      .select()
      .from(sdrWorkflowProgress)
      .where(eq(sdrWorkflowProgress.userId, userId))
      .limit(1);
    
    if (progress.length === 0) {
      throw new Error("Workflow not initialized");
    }

    const fromStage = progress[0].currentStage;
    const organizationId = progress[0].organizationId;
    const now = new Date();

    // Force advance preserves existing timestamps for audit trail
    // Only updates currentStage and clears blocking reasons
    // Super admin takes responsibility for overriding normal flow
    const [updated] = await db
      .update(sdrWorkflowProgress)
      .set({
        currentStage: toStage,
        updatedAt: now,
        blockingReasons: [],
      })
      .where(eq(sdrWorkflowProgress.userId, userId))
      .returning();

    await auditService.log({
      action: "SDR_WORKFLOW_FORCE_ADVANCE",
      userId,
      module: "sdr_workflow",
      details: {
        resourceId: updated.id,
        organizationId,
        fromStage,
        toStage,
        forcedBy: superAdminId,
        timestamp: now.toISOString(),
        note: "Super admin override - timestamps preserved for audit",
      },
    });

    return updated;
  }

  async resetWorkflow(userId: string): Promise<SDRWorkflowProgress> {
    const [updated] = await db
      .update(sdrWorkflowProgress)
      .set({
        currentStage: "readiness",
        readinessCompletedAt: null,
        uploadCompletedAt: null,
        enrichmentCompletedAt: null,
        sequenceCompletedAt: null,
        enrollmentCompletedAt: null,
        activationCompletedAt: null,
        sendingStartedAt: null,
        repliesDetectedAt: null,
        analyticsUnlockedAt: null,
        blockingReasons: [],
        updatedAt: new Date(),
      })
      .where(eq(sdrWorkflowProgress.userId, userId))
      .returning();

    await auditService.log({
      action: "SDR_WORKFLOW_RESET",
      userId,
      module: "sdr_workflow",
      details: { resourceId: updated.id, timestamp: new Date().toISOString() },
    });

    return updated;
  }

  private getTimestampFieldForStage(stage: SDRWorkflowStage): string | null {
    const fieldMap: Record<SDRWorkflowStage, string | null> = {
      readiness: "readinessCompletedAt",
      upload: "uploadCompletedAt",
      enrichment: "enrichmentCompletedAt",
      sequence: "sequenceCompletedAt",
      enrollment: "enrollmentCompletedAt",
      activation: "activationCompletedAt",
      sending: "sendingStartedAt",
      replies: "repliesDetectedAt",
      analytics: "analyticsUnlockedAt",
    };
    return fieldMap[stage];
  }

  private async computeBlockingReasons(
    userId: string, 
    organizationId: string, 
    currentStage: SDRWorkflowStage
  ): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    switch (currentStage) {
      case "readiness":
        reasons.push(...await this.checkReadinessBlocks(userId));
        break;
      case "upload":
        reasons.push(...await this.checkUploadBlocks(userId));
        break;
      case "enrichment":
        reasons.push(...await this.checkEnrichmentBlocks(userId));
        break;
      case "sequence":
        reasons.push(...await this.checkSequenceBlocks(userId));
        break;
      case "enrollment":
        reasons.push(...await this.checkEnrollmentBlocks(userId));
        break;
      case "activation":
        reasons.push(...await this.checkActivationBlocks(userId));
        break;
      case "sending":
        reasons.push(...await this.checkSendingBlocks(userId));
        break;
      case "replies":
        reasons.push(...await this.checkRepliesBlocks(userId));
        break;
      case "analytics":
        break;
    }

    return reasons;
  }

  private async checkReadinessBlocks(userId: string): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    const mailboxes = await db
      .select()
      .from(emailMailboxes)
      .where(and(
        eq(emailMailboxes.userId, userId),
        eq(emailMailboxes.status, "active")
      ));

    // CRITICAL: No mailbox = blocked. Must add blocker, not return empty.
    if (mailboxes.length === 0) {
      reasons.push({
        code: WORKFLOW_ERROR_CODES.MAILBOX_NOT_CONNECTED,
        message: "No active mailbox connected. Please connect and verify your email mailbox.",
        module: "readiness",
        severity: "error",
      });
      // Return with the blocker, not empty
      return reasons;
    }

    // Check if ANY mailbox has all readiness flags set
    const readyMailbox = mailboxes.find(m => {
      const flags = m.readinessFlags as { spfValid?: boolean; dkimValid?: boolean; warmupComplete?: boolean } | null;
      return flags?.spfValid && flags?.dkimValid && flags?.warmupComplete;
    });

    // If no fully ready mailbox, add specific blockers
    if (!readyMailbox) {
      const flags = mailboxes[0].readinessFlags as { spfValid?: boolean; dkimValid?: boolean; warmupComplete?: boolean } | null;

      if (!flags?.spfValid) {
        reasons.push({
          code: WORKFLOW_ERROR_CODES.SPF_INVALID,
          message: "SPF record is not valid. Please configure your domain's SPF settings.",
          module: "readiness",
          severity: "error",
        });
      }
      if (!flags?.dkimValid) {
        reasons.push({
          code: WORKFLOW_ERROR_CODES.DKIM_INVALID,
          message: "DKIM record is not valid. Please configure your domain's DKIM settings.",
          module: "readiness",
          severity: "error",
        });
      }
      if (!flags?.warmupComplete) {
        reasons.push({
          code: WORKFLOW_ERROR_CODES.WARMUP_INCOMPLETE,
          message: "Mailbox warmup is not complete. Continue warming up your mailbox.",
          module: "readiness",
          severity: "error",
        });
      }
    }

    return reasons;
  }

  private async checkUploadBlocks(userId: string): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    const rawProspects = await db
      .select({ count: sql<number>`count(*)` })
      .from(prospects)
      .where(and(
        eq(prospects.userId, userId),
        eq(prospects.enrichmentStatus, "new")
      ));

    if (rawProspects[0].count === 0) {
      reasons.push({
        code: WORKFLOW_ERROR_CODES.NO_RAW_PROSPECTS,
        message: "No prospects uploaded. Upload a CSV file with prospects to continue.",
        module: "upload",
        severity: "error",
      });
    }

    return reasons;
  }

  private async checkEnrichmentBlocks(userId: string): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    const enrichedProspects = await db
      .select({ count: sql<number>`count(*)` })
      .from(prospects)
      .where(and(
        eq(prospects.userId, userId),
        eq(prospects.enrichmentStatus, "enriched")
      ));

    if (enrichedProspects[0].count === 0) {
      reasons.push({
        code: WORKFLOW_ERROR_CODES.NO_ENRICHED_PROSPECTS,
        message: "No enriched prospects. Click 'Enrich' on your raw prospects to continue.",
        module: "enrichment",
        severity: "error",
      });
    }

    return reasons;
  }

  private async checkSequenceBlocks(userId: string): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    const draftSequences = await db
      .select({ count: sql<number>`count(*)` })
      .from(sequences)
      .where(and(
        eq(sequences.userId, userId),
        eq(sequences.status, "draft")
      ));

    const activeSequences = await db
      .select({ count: sql<number>`count(*)` })
      .from(sequences)
      .where(and(
        eq(sequences.userId, userId),
        eq(sequences.status, "active")
      ));

    if (draftSequences[0].count === 0 && activeSequences[0].count === 0) {
      reasons.push({
        code: WORKFLOW_ERROR_CODES.NO_DRAFT_SEQUENCE,
        message: "No sequences created. Create a sequence with email steps to continue.",
        module: "sequence",
        severity: "error",
      });
    }

    return reasons;
  }

  private async checkEnrollmentBlocks(userId: string): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    // Join through sequences to get user's enrolled prospects
    const enrolledProspects = await db
      .select({ count: sql<number>`count(*)` })
      .from(sequenceProspects)
      .innerJoin(sequences, eq(sequenceProspects.sequenceId, sequences.id))
      .where(eq(sequences.userId, userId));

    if (enrolledProspects[0].count === 0) {
      reasons.push({
        code: WORKFLOW_ERROR_CODES.NO_ENROLLED_PROSPECTS,
        message: "No prospects enrolled. Select enriched prospects and enroll them in a sequence.",
        module: "enrollment",
        severity: "error",
      });
    }

    return reasons;
  }

  private async checkActivationBlocks(userId: string): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    const activeSequences = await db
      .select({ count: sql<number>`count(*)` })
      .from(sequences)
      .where(and(
        eq(sequences.userId, userId),
        eq(sequences.status, "active")
      ));

    if (activeSequences[0].count === 0) {
      reasons.push({
        code: WORKFLOW_ERROR_CODES.NO_ACTIVE_SEQUENCE,
        message: "No active sequences. Activate a sequence to start sending emails.",
        module: "activation",
        severity: "error",
      });
    }

    return reasons;
  }

  private async checkSendingBlocks(userId: string): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    const sentEmails = await db
      .select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(
        eq(emails.userId, userId),
        eq(emails.status, "sent")
      ));

    if (sentEmails[0].count === 0) {
      reasons.push({
        code: WORKFLOW_ERROR_CODES.NO_EMAILS_SENT,
        message: "No emails sent yet. The system will automatically send emails based on your sequence.",
        module: "sending",
        severity: "error",
      });
    }

    return reasons;
  }

  private async checkRepliesBlocks(userId: string): Promise<SDRWorkflowBlockingReason[]> {
    const reasons: SDRWorkflowBlockingReason[] = [];

    // Join through emails to get user's replies
    const repliesCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailReplies)
      .innerJoin(emails, eq(emailReplies.emailId, emails.id))
      .where(eq(emails.userId, userId));

    if (repliesCount[0].count === 0) {
      reasons.push({
        code: WORKFLOW_ERROR_CODES.NO_REPLIES_DETECTED,
        message: "No replies detected yet. Continue monitoring for prospect responses.",
        module: "replies",
        severity: "error",
      });
    }

    return reasons;
  }

  async tryAutoAdvance(userId: string): Promise<SDRWorkflowProgress | null> {
    const state = await this.getWorkflowState(userId);
    if (!state || state.blockingReasons.length > 0 || !state.nextStage) {
      return null;
    }

    try {
      const result = await this.advanceStage(userId, state.nextStage);
      
      await auditService.log({
        action: "SDR_WORKFLOW_AUTO_ADVANCED",
        userId,
        module: "sdr_workflow",
        details: {
          fromStage: state.currentStage,
          toStage: state.nextStage,
          timestamp: new Date().toISOString(),
        },
      });

      return result;
    } catch {
      return null;
    }
  }

  // MODULE 1: Readiness Status Methods
  async getReadinessStatus(userId: string): Promise<{
    isReady: boolean;
    mailboxes: Array<{
      id: string;
      email: string;
      name: string;
      status: string;
      readinessFlags: {
        spfValid: boolean;
        dkimValid: boolean;
        warmupComplete: boolean;
      };
      isFullyReady: boolean;
    }>;
    blockingReasons: SDRWorkflowBlockingReason[];
  }> {
    const mailboxes = await db
      .select()
      .from(emailMailboxes)
      .where(eq(emailMailboxes.userId, userId));

    const blockingReasons = await this.checkReadinessBlocks(userId);

    const mailboxDetails = mailboxes.map(m => {
      const flags = m.readinessFlags as { spfValid?: boolean; dkimValid?: boolean; warmupComplete?: boolean } | null;
      const readinessFlags = {
        spfValid: flags?.spfValid ?? false,
        dkimValid: flags?.dkimValid ?? false,
        warmupComplete: flags?.warmupComplete ?? false,
      };
      
      return {
        id: m.id,
        email: m.email,
        name: m.name,
        status: m.status || 'inactive',
        readinessFlags,
        isFullyReady: readinessFlags.spfValid && readinessFlags.dkimValid && readinessFlags.warmupComplete,
      };
    });

    const hasReadyMailbox = mailboxDetails.some(m => m.isFullyReady && m.status === 'active');

    return {
      isReady: hasReadyMailbox,
      mailboxes: mailboxDetails,
      blockingReasons,
    };
  }

  async updateMailboxReadiness(
    userId: string,
    mailboxId: string,
    flags: { spfValid?: boolean; dkimValid?: boolean; warmupComplete?: boolean }
  ): Promise<{
    success: boolean;
    error?: string;
    readinessFlags?: { spfValid: boolean; dkimValid: boolean; warmupComplete: boolean };
  }> {
    // Verify mailbox belongs to user
    const [mailbox] = await db
      .select()
      .from(emailMailboxes)
      .where(and(
        eq(emailMailboxes.id, mailboxId),
        eq(emailMailboxes.userId, userId)
      ));

    if (!mailbox) {
      return { success: false, error: "Mailbox not found or not owned by user" };
    }

    // Merge with existing flags
    const existingFlags = mailbox.readinessFlags as { spfValid?: boolean; dkimValid?: boolean; warmupComplete?: boolean } | null;
    const newFlags = {
      spfValid: flags.spfValid ?? existingFlags?.spfValid ?? false,
      dkimValid: flags.dkimValid ?? existingFlags?.dkimValid ?? false,
      warmupComplete: flags.warmupComplete ?? existingFlags?.warmupComplete ?? false,
    };

    // Update the mailbox
    await db
      .update(emailMailboxes)
      .set({ 
        readinessFlags: newFlags,
        updatedAt: new Date(),
      })
      .where(eq(emailMailboxes.id, mailboxId));

    await auditService.log({
      action: "SDR_MAILBOX_READINESS_UPDATED",
      userId,
      module: "sdr_workflow",
      details: {
        mailboxId,
        previousFlags: existingFlags,
        newFlags,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: true,
      readinessFlags: newFlags,
    };
  }
}

export class WorkflowBlockedError extends Error {
  public readonly code: string;
  public readonly stage: string;
  public readonly blockingReasons: SDRWorkflowBlockingReason[];

  constructor(code: string, message: string, stage: string, blockingReasons: SDRWorkflowBlockingReason[]) {
    super(message);
    this.name = "WorkflowBlockedError";
    this.code = code;
    this.stage = stage;
    this.blockingReasons = blockingReasons;
  }

  toJSON() {
    return {
      error: "WORKFLOW_BLOCKED",
      code: this.code,
      message: this.message,
      stage: this.stage,
      blockingReasons: this.blockingReasons,
    };
  }
}

export const sdrWorkflowService = new SDRWorkflowService();
