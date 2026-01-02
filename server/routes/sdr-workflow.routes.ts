import { Router, Request, Response, NextFunction } from "express";
import { sdrWorkflowService, WorkflowBlockedError } from "../services/sdr-workflow.service";
import { authenticate } from "../middleware/auth.middleware";
import { hardeningService } from "../services/hardening.service";

const router = Router();

// Helper to validate SDR workflow access (role + tenant automation)
async function validateWorkflowAccess(req: Request, res: Response): Promise<{ 
  allowed: boolean; 
  userId?: string; 
  organizationId?: string;
}> {
  const userId = req.user?.id;
  const organizationId = req.user?.organizationId;
  const userRole = req.user?.role;

  if (!userId || !organizationId) {
    res.status(401).json({ error: "Unauthorized" });
    return { allowed: false };
  }

  // Only SDRs (users) can access workflow - block managers and super admins
  if (userRole === "manager" || userRole === "super_admin") {
    res.status(403).json({ 
      error: "SDR workflow is only accessible to SDR users",
      workflowStage: null,
      blockingReasons: [],
    });
    return { allowed: false };
  }

  // Check tenant automation status - FAIL CLOSED
  try {
    const isPaused = await hardeningService.isAutomationPaused(organizationId);
    if (isPaused) {
      res.status(403).json({
        error: "Tenant automation is paused",
        message: "Your organization's automation has been paused. Please contact your administrator.",
        workflowStage: null,
        blockingReasons: [{
          code: "TENANT_PAUSED",
          message: "Tenant automation is paused",
          module: "readiness",
          severity: "error",
        }],
      });
      return { allowed: false };
    }
  } catch (guardError) {
    console.error("Failed to check tenant automation status:", guardError);
    res.status(503).json({
      error: "Unable to verify tenant automation status",
      message: "Please try again later or contact your administrator.",
      workflowStage: null,
      blockingReasons: [{
        code: "TENANT_STATUS_CHECK_FAILED",
        message: "Unable to verify tenant automation status",
        module: "readiness",
        severity: "error",
      }],
    });
    return { allowed: false };
  }

  return { allowed: true, userId, organizationId };
}

router.get("/status", authenticate, async (req: Request, res: Response) => {
  try {
    const access = await validateWorkflowAccess(req, res);
    if (!access.allowed) return;

    const state = await sdrWorkflowService.getWorkflowState(access.userId!);
    if (!state) {
      return res.status(404).json({ 
        error: "Workflow not initialized",
        message: "Use POST /api/sdr-workflow/initialize to start your workflow",
        workflowStage: null,
        blockingReasons: [],
      });
    }

    return res.json({
      workflowStage: state.currentStage,
      blockingReasons: state.blockingReasons,
      stageTimestamps: state.stageTimestamps,
      canAdvance: state.canAdvance,
      nextStage: state.nextStage,
    });
  } catch (error) {
    console.error("Error fetching workflow status:", error);
    return res.status(500).json({ error: "Failed to fetch workflow status" });
  }
});

router.post("/initialize", authenticate, async (req: Request, res: Response) => {
  try {
    const access = await validateWorkflowAccess(req, res);
    if (!access.allowed) return;

    await sdrWorkflowService.getOrCreateProgress(access.userId!, access.organizationId!);
    const state = await sdrWorkflowService.getWorkflowState(access.userId!);

    return res.json({
      success: true,
      workflowStage: state?.currentStage,
      blockingReasons: state?.blockingReasons || [],
      stageTimestamps: state?.stageTimestamps,
      canAdvance: state?.canAdvance,
      nextStage: state?.nextStage,
    });
  } catch (error) {
    console.error("Error initializing workflow:", error);
    return res.status(500).json({ error: "Failed to initialize workflow" });
  }
});

router.post("/advance", authenticate, async (req: Request, res: Response) => {
  try {
    const access = await validateWorkflowAccess(req, res);
    if (!access.allowed) return;

    const state = await sdrWorkflowService.getWorkflowState(access.userId!);
    if (!state) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    if (!state.nextStage) {
      return res.status(400).json({ 
        error: "Already at final stage",
        workflowStage: state.currentStage,
        blockingReasons: [],
      });
    }

    if (state.blockingReasons.length > 0) {
      return res.status(400).json({
        error: "WORKFLOW_BLOCKED",
        message: "Cannot advance workflow - prerequisites not met",
        workflowStage: state.currentStage,
        blockingReasons: state.blockingReasons,
      });
    }

    const updated = await sdrWorkflowService.advanceStage(access.userId!, state.nextStage);
    const newState = await sdrWorkflowService.getWorkflowState(access.userId!);

    return res.json({
      success: true,
      workflowStage: updated.currentStage,
      blockingReasons: newState?.blockingReasons || [],
      stageTimestamps: newState?.stageTimestamps,
    });
  } catch (error) {
    if (error instanceof WorkflowBlockedError) {
      return res.status(400).json(error.toJSON());
    }
    console.error("Error advancing workflow:", error);
    return res.status(500).json({ error: "Failed to advance workflow" });
  }
});

router.post("/try-auto-advance", authenticate, async (req: Request, res: Response) => {
  try {
    const access = await validateWorkflowAccess(req, res);
    if (!access.allowed) return;

    const result = await sdrWorkflowService.tryAutoAdvance(access.userId!);
    const state = await sdrWorkflowService.getWorkflowState(access.userId!);

    return res.json({
      advanced: result !== null,
      workflowStage: state?.currentStage,
      blockingReasons: state?.blockingReasons || [],
    });
  } catch (error) {
    console.error("Error auto-advancing workflow:", error);
    return res.status(500).json({ error: "Failed to auto-advance workflow" });
  }
});

router.post("/assert/:stage", authenticate, async (req: Request, res: Response) => {
  try {
    const access = await validateWorkflowAccess(req, res);
    if (!access.allowed) return;

    const stage = req.params.stage as any;
    const validStages = ["readiness", "upload", "enrichment", "sequence", "enrollment", "activation", "sending", "replies", "analytics"];
    
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: "Invalid stage" });
    }

    await sdrWorkflowService.assertStage(access.userId!, stage);

    return res.json({ 
      allowed: true,
      workflowStage: stage,
      blockingReasons: [],
    });
  } catch (error) {
    if (error instanceof WorkflowBlockedError) {
      return res.status(403).json({
        allowed: false,
        ...error.toJSON(),
      });
    }
    console.error("Error asserting stage:", error);
    return res.status(500).json({ error: "Failed to assert stage" });
  }
});

router.get("/blocking-reasons", authenticate, async (req: Request, res: Response) => {
  try {
    const access = await validateWorkflowAccess(req, res);
    if (!access.allowed) return;

    const state = await sdrWorkflowService.getWorkflowState(access.userId!);
    if (!state) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    return res.json({
      workflowStage: state.currentStage,
      blockingReasons: state.blockingReasons,
      canAdvance: state.canAdvance,
    });
  } catch (error) {
    console.error("Error fetching blocking reasons:", error);
    return res.status(500).json({ error: "Failed to fetch blocking reasons" });
  }
});

// ADMIN ROUTES - Super admin only with tenant automation guard
// These routes look up the target user's organization from the workflow record (authoritative source)

router.post("/reset", authenticate, async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id;
    const adminRole = req.user?.role;
    
    if (!adminId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (adminRole !== "super_admin") {
      return res.status(403).json({ error: "Only super admins can reset workflows" });
    }

    const { userId: targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: "Target userId required" });
    }

    // Get workflow state to obtain authoritative organizationId
    const workflowState = await sdrWorkflowService.getWorkflowState(targetUserId);
    if (!workflowState) {
      return res.status(404).json({ error: "Workflow not found for target user" });
    }

    // Check tenant automation status using authoritative org ID - FAIL CLOSED
    try {
      const isPaused = await hardeningService.isAutomationPaused(workflowState.organizationId);
      if (isPaused) {
        return res.status(403).json({
          error: "Tenant automation is paused",
          message: "Cannot reset workflow for a paused tenant. Enable automation first.",
        });
      }
    } catch (guardError) {
      console.error("Failed to check tenant automation status for reset:", guardError);
      return res.status(503).json({
        error: "Unable to verify tenant automation status",
      });
    }

    const updated = await sdrWorkflowService.resetWorkflow(targetUserId);
    
    return res.json({
      success: true,
      workflowStage: updated.currentStage,
      blockingReasons: [],
    });
  } catch (error) {
    console.error("Error resetting workflow:", error);
    return res.status(500).json({ error: "Failed to reset workflow" });
  }
});

router.post("/force-advance", authenticate, async (req: Request, res: Response) => {
  try {
    const adminId = req.user?.id;
    const adminRole = req.user?.role;
    
    if (!adminId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (adminRole !== "super_admin") {
      return res.status(403).json({ error: "Only super admins can force-advance workflows" });
    }

    const { targetUserId, toStage } = req.body;
    if (!targetUserId || !toStage) {
      return res.status(400).json({ error: "targetUserId and toStage required" });
    }

    const validStages = ["readiness", "upload", "enrichment", "sequence", "enrollment", "activation", "sending", "replies", "analytics"];
    if (!validStages.includes(toStage)) {
      return res.status(400).json({ error: "Invalid stage" });
    }

    // Get workflow state to obtain authoritative organizationId
    const workflowState = await sdrWorkflowService.getWorkflowState(targetUserId);
    if (!workflowState) {
      return res.status(404).json({ error: "Workflow not found for target user" });
    }

    // Check tenant automation status using authoritative org ID - FAIL CLOSED
    try {
      const isPaused = await hardeningService.isAutomationPaused(workflowState.organizationId);
      if (isPaused) {
        return res.status(403).json({
          error: "Tenant automation is paused",
          message: "Cannot force-advance workflow for a paused tenant. Enable automation first.",
        });
      }
    } catch (guardError) {
      console.error("Failed to check tenant automation status for force-advance:", guardError);
      return res.status(503).json({
        error: "Unable to verify tenant automation status",
      });
    }

    const updated = await sdrWorkflowService.forceAdvance(targetUserId, toStage, adminId);
    
    return res.json({
      success: true,
      workflowStage: updated.currentStage,
      blockingReasons: [],
    });
  } catch (error) {
    console.error("Error force-advancing workflow:", error);
    return res.status(500).json({ error: "Failed to force-advance workflow" });
  }
});

export default router;
