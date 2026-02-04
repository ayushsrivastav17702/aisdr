import { db } from "../db";
import { prospects, sequences, emailMailboxes, emailQueue, emailSendAudit, type EmailSendAudit } from "@shared/schema";
import { eq, and, sql, count, desc } from "drizzle-orm";

export interface SafeToSendDecision {
  canSend: boolean;
  finalScore: number;
  reasons: string[];
  blockedReasons: BlockedReason[];
  scoreBreakdown: ScoreBreakdown;
  auditId?: string;
}

export interface BlockedReason {
  rule: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

export interface ScoreBreakdown {
  reasonConfidence: number;
  dataQuality: number;
  personalizationDepth: number;
  total: number;
}

export interface SafeToSendInput {
  prospectId: string;
  sequenceId?: string;
  mailboxId?: string;
  aiConfidence?: number;
  hasHallucinationFlag?: boolean;
  generatedSubject?: string;
  generatedBody?: string;
  personalizationFactors?: string[];
  userId: string;
  claimViolations?: { claim: string; source: string }[];
}

const DOMAIN_REPUTATION_THRESHOLD = 70;
const MIN_FINAL_SCORE = 1.0;
const MIN_AI_CONFIDENCE = 0.6;

class SafeToSendService {
  async evaluate(input: SafeToSendInput): Promise<SafeToSendDecision> {
    const blockedReasons: BlockedReason[] = [];
    const reasons: string[] = [];
    
    const [prospect, sequence, mailbox] = await Promise.all([
      this.getProspect(input.prospectId, input.userId),
      input.sequenceId ? this.getSequence(input.sequenceId, input.userId) : null,
      input.mailboxId ? this.getMailbox(input.mailboxId, input.userId) : null
    ]);

    if (!prospect) {
      blockedReasons.push({
        rule: 'PROSPECT_NOT_FOUND',
        message: 'Prospect not found or access denied',
        severity: 'critical'
      });
    }

    if (prospect) {
      const ruleResults = await this.evaluateBlockingRules(input, prospect, sequence, mailbox);
      blockedReasons.push(...ruleResults.blockedReasons);
      reasons.push(...ruleResults.reasons);
    }

    const scoreBreakdown = this.calculateScore(input, prospect);
    const scorePassed = scoreBreakdown.total >= MIN_FINAL_SCORE;
    
    if (!scorePassed && blockedReasons.length === 0) {
      blockedReasons.push({
        rule: 'LOW_SCORE',
        message: `Final score ${scoreBreakdown.total.toFixed(2)} is below minimum threshold ${MIN_FINAL_SCORE}`,
        severity: 'high'
      });
    }

    const canSend = blockedReasons.length === 0 && scorePassed;

    if (canSend) {
      reasons.push(`Final score: ${scoreBreakdown.total.toFixed(2)} (threshold: ${MIN_FINAL_SCORE})`);
      reasons.push(`Reason confidence: ${scoreBreakdown.reasonConfidence.toFixed(2)}`);
      reasons.push(`Data quality: ${scoreBreakdown.dataQuality.toFixed(2)}`);
      reasons.push(`Personalization depth: ${scoreBreakdown.personalizationDepth.toFixed(2)}`);
    }

    const decision: SafeToSendDecision = {
      canSend,
      finalScore: scoreBreakdown.total,
      reasons,
      blockedReasons,
      scoreBreakdown
    };

    const auditId = await this.createAuditLog(input, decision);
    decision.auditId = auditId;

    return decision;
  }

  private async evaluateBlockingRules(
    input: SafeToSendInput,
    prospect: any,
    sequence: any | null,
    mailbox: any | null
  ): Promise<{ blockedReasons: BlockedReason[]; reasons: string[] }> {
    const blockedReasons: BlockedReason[] = [];
    const reasons: string[] = [];

    if (!input.generatedSubject || !input.generatedBody) {
      blockedReasons.push({
        rule: 'NO_VALID_REASON',
        message: 'Email content is missing - no valid reason to send',
        severity: 'critical'
      });
    } else {
      reasons.push('Email content is present');
    }

    if (input.aiConfidence !== undefined && input.aiConfidence < MIN_AI_CONFIDENCE) {
      blockedReasons.push({
        rule: 'LOW_AI_CONFIDENCE',
        message: `AI confidence ${(input.aiConfidence * 100).toFixed(0)}% is below minimum ${MIN_AI_CONFIDENCE * 100}%`,
        severity: 'high'
      });
    } else if (input.aiConfidence !== undefined) {
      reasons.push(`AI confidence: ${(input.aiConfidence * 100).toFixed(0)}%`);
    }

    if (input.hasHallucinationFlag === true || (input.claimViolations && input.claimViolations.length > 0)) {
      const violationDetails = input.claimViolations?.map(v => v.claim).join(', ') || 'Unknown violations';
      blockedReasons.push({
        rule: 'HALLUCINATION_DETECTED',
        message: `AI generated unverified claims: ${violationDetails}`,
        severity: 'critical'
      });
    } else {
      reasons.push('No hallucination flags detected');
    }

    if (prospect?.isVip === true) {
      blockedReasons.push({
        rule: 'VIP_PROSPECT',
        message: 'Prospect is tagged as VIP - requires manual review',
        severity: 'high'
      });
    } else {
      reasons.push('Prospect is not VIP-tagged');
    }

    if (sequence) {
      if (sequence.isApproved !== true) {
        blockedReasons.push({
          rule: 'SEQUENCE_NOT_APPROVED',
          message: `Sequence "${sequence.name}" is not explicitly approved (isApproved: ${sequence.isApproved})`,
          severity: 'high'
        });
      } else {
        reasons.push(`Sequence "${sequence.name}" is approved`);
      }
    }

    if (mailbox) {
      const domainScore = this.calculateDomainReputationScore(mailbox);
      if (domainScore < DOMAIN_REPUTATION_THRESHOLD) {
        blockedReasons.push({
          rule: 'LOW_DOMAIN_REPUTATION',
          message: `Domain reputation score ${domainScore} is below threshold ${DOMAIN_REPUTATION_THRESHOLD}`,
          severity: 'high'
        });
      } else {
        reasons.push(`Domain reputation: ${domainScore}/100`);
      }
    }

    return { blockedReasons, reasons };
  }

  private calculateScore(input: SafeToSendInput, prospect: any): ScoreBreakdown {
    const reasonConfidence = this.calculateReasonConfidence(input);
    const dataQuality = this.calculateDataQuality(prospect);
    const personalizationDepth = this.calculatePersonalizationDepth(input);

    return {
      reasonConfidence,
      dataQuality,
      personalizationDepth,
      total: reasonConfidence + dataQuality + personalizationDepth
    };
  }

  private calculateReasonConfidence(input: SafeToSendInput): number {
    let score = 0;
    
    if (input.generatedSubject && input.generatedBody) {
      score += 0.3;
    }
    
    if (input.aiConfidence !== undefined) {
      score += input.aiConfidence * 0.5;
    }
    
    if (!input.hasHallucinationFlag && (!input.claimViolations || input.claimViolations.length === 0)) {
      score += 0.2;
    }

    return Math.min(1.0, score);
  }

  private calculateDataQuality(prospect: any): number {
    if (!prospect) return 0;
    
    let score = 0;
    const fields = [
      'firstName', 'lastName', 'primaryEmail', 'companyName',
      'jobTitle', 'companyIndustry', 'linkedinUrl', 'companySize'
    ];
    
    const filledFields = fields.filter(field => prospect[field] && String(prospect[field]).trim()).length;
    score = filledFields / fields.length;

    return score;
  }

  private calculatePersonalizationDepth(input: SafeToSendInput): number {
    let score = 0;
    
    const factors = input.personalizationFactors || [];
    if (factors.length >= 3) {
      score += 0.5;
    } else if (factors.length >= 1) {
      score += factors.length * 0.15;
    }
    
    if (input.generatedBody) {
      const bodyLength = input.generatedBody.length;
      if (bodyLength >= 200 && bodyLength <= 500) {
        score += 0.3;
      } else if (bodyLength >= 100) {
        score += 0.15;
      }
    }
    
    if (input.aiConfidence && input.aiConfidence >= 0.8) {
      score += 0.2;
    }

    return Math.min(1.0, score);
  }

  private calculateDomainReputationScore(mailbox: any): number {
    let score = 100;
    
    const bounceRate = mailbox.bounceRate || 0;
    score -= bounceRate * 2;
    
    const spamScore = mailbox.spamScore || 0;
    score -= spamScore;
    
    if (mailbox.status === 'paused' || mailbox.status === 'error') {
      score -= 30;
    }
    
    if (mailbox.warmupStage !== undefined && mailbox.warmupStage < 3) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private async getProspect(prospectId: string, userId: string) {
    return await db.query.prospects.findFirst({
      where: and(
        eq(prospects.id, prospectId),
        eq(prospects.userId, userId)
      )
    });
  }

  private async getSequence(sequenceId: string, userId: string) {
    return await db.query.sequences.findFirst({
      where: and(
        eq(sequences.id, sequenceId),
        eq(sequences.userId, userId)
      )
    });
  }

  private async getMailbox(mailboxId: string, userId: string) {
    return await db.query.emailMailboxes.findFirst({
      where: and(
        eq(emailMailboxes.id, mailboxId),
        eq(emailMailboxes.userId, userId)
      )
    });
  }

  private async createAuditLog(input: SafeToSendInput, decision: SafeToSendDecision): Promise<string> {
    const [audit] = await db.insert(emailSendAudit).values({
      prospectId: input.prospectId,
      sequenceId: input.sequenceId || null,
      mailboxId: input.mailboxId || null,
      userId: input.userId,
      decision: decision.canSend ? 'send' : 'block',
      finalScore: decision.finalScore.toString(),
      scoreBreakdown: decision.scoreBreakdown,
      reasons: decision.canSend ? decision.reasons : [],
      blockedReasons: decision.blockedReasons,
      aiConfidence: input.aiConfidence?.toString() || null,
      hasHallucinationFlag: input.hasHallucinationFlag || false,
      claimViolations: input.claimViolations || [],
    }).returning();

    return audit.id;
  }

  async getAuditLog(auditId: string, userId: string): Promise<EmailSendAudit | undefined> {
    return await db.query.emailSendAudit.findFirst({
      where: and(
        eq(emailSendAudit.id, auditId),
        eq(emailSendAudit.userId, userId)
      )
    });
  }

  async getAuditLogsForProspect(prospectId: string, userId: string, limit = 10): Promise<EmailSendAudit[]> {
    return await db.query.emailSendAudit.findMany({
      where: and(
        eq(emailSendAudit.prospectId, prospectId),
        eq(emailSendAudit.userId, userId)
      ),
      orderBy: (audit, { desc }) => [desc(audit.createdAt)],
      limit
    });
  }

  async getAuditLogsForSequence(sequenceId: string, userId: string, limit = 50): Promise<EmailSendAudit[]> {
    return await db.query.emailSendAudit.findMany({
      where: and(
        eq(emailSendAudit.sequenceId, sequenceId),
        eq(emailSendAudit.userId, userId)
      ),
      orderBy: (audit, { desc }) => [desc(audit.createdAt)],
      limit
    });
  }

  formatDecisionForUI(decision: SafeToSendDecision): {
    title: string;
    summary: string;
    details: string[];
    type: 'success' | 'warning' | 'error';
  } {
    if (decision.canSend) {
      return {
        title: 'Why this email will send',
        summary: `Safe to send (score: ${decision.finalScore.toFixed(2)})`,
        details: decision.reasons,
        type: 'success'
      };
    } else {
      return {
        title: 'Why this email was blocked',
        summary: `Blocked (${decision.blockedReasons.length} issue${decision.blockedReasons.length > 1 ? 's' : ''})`,
        details: decision.blockedReasons.map(r => `[${r.severity.toUpperCase()}] ${r.rule}: ${r.message}`),
        type: 'error'
      };
    }
  }
}

export const safeToSendService = new SafeToSendService();
