import { Router } from "express";
import { safeToSendService } from "../services/safe-to-send.service";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/audit/:auditId", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { auditId } = req.params;
    const audit = await safeToSendService.getAuditLog(auditId, req.userContext.userId);

    if (!audit) {
      return res.status(404).json({ error: "Audit log not found" });
    }

    const formatted = safeToSendService.formatDecisionForUI({
      canSend: audit.decision === 'send',
      finalScore: parseFloat(audit.finalScore),
      reasons: audit.reasons || [],
      blockedReasons: audit.blockedReasons || [],
      scoreBreakdown: audit.scoreBreakdown || { reasonConfidence: 0, dataQuality: 0, personalizationDepth: 0, total: 0 }
    });

    return res.json({ audit, formatted });
  } catch (error) {
    console.error("Error fetching audit log:", error);
    return res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

router.get("/prospect/:prospectId/audits", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { prospectId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    
    const audits = await safeToSendService.getAuditLogsForProspect(prospectId, req.userContext.userId, limit);

    const formattedAudits = audits.map(audit => ({
      ...audit,
      formatted: safeToSendService.formatDecisionForUI({
        canSend: audit.decision === 'send',
        finalScore: parseFloat(audit.finalScore),
        reasons: audit.reasons || [],
        blockedReasons: audit.blockedReasons || [],
        scoreBreakdown: audit.scoreBreakdown || { reasonConfidence: 0, dataQuality: 0, personalizationDepth: 0, total: 0 }
      })
    }));

    return res.json({ audits: formattedAudits });
  } catch (error) {
    console.error("Error fetching prospect audits:", error);
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/sequence/:sequenceId/audits", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { sequenceId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    const audits = await safeToSendService.getAuditLogsForSequence(sequenceId, req.userContext.userId, limit);

    const stats = {
      total: audits.length,
      sent: audits.filter(a => a.decision === 'send').length,
      blocked: audits.filter(a => a.decision === 'block').length,
      averageScore: audits.length > 0 
        ? audits.reduce((sum, a) => sum + parseFloat(a.finalScore), 0) / audits.length 
        : 0
    };

    const formattedAudits = audits.map(audit => ({
      ...audit,
      formatted: safeToSendService.formatDecisionForUI({
        canSend: audit.decision === 'send',
        finalScore: parseFloat(audit.finalScore),
        reasons: audit.reasons || [],
        blockedReasons: audit.blockedReasons || [],
        scoreBreakdown: audit.scoreBreakdown || { reasonConfidence: 0, dataQuality: 0, personalizationDepth: 0, total: 0 }
      })
    }));

    return res.json({ audits: formattedAudits, stats });
  } catch (error) {
    console.error("Error fetching sequence audits:", error);
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.post("/evaluate", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { 
      prospectId, 
      sequenceId, 
      mailboxId,
      aiConfidence, 
      hasHallucinationFlag,
      generatedSubject,
      generatedBody,
      personalizationFactors,
      claimViolations
    } = req.body;

    if (!prospectId) {
      return res.status(400).json({ error: "prospectId is required" });
    }

    const decision = await safeToSendService.evaluate({
      prospectId,
      sequenceId,
      mailboxId,
      aiConfidence,
      hasHallucinationFlag,
      generatedSubject,
      generatedBody,
      personalizationFactors,
      claimViolations,
      userId: req.userContext.userId
    });

    const formatted = safeToSendService.formatDecisionForUI(decision);

    return res.json({ decision, formatted });
  } catch (error) {
    console.error("Error evaluating safe-to-send:", error);
    return res.status(500).json({ error: "Failed to evaluate safe-to-send" });
  }
});

export default router;
