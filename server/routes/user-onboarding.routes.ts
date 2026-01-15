import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

const onboardingSteps = [
  { step: 1, name: "welcome", label: "Welcome" },
  { step: 2, name: "profile", label: "Complete Profile" },
  { step: 3, name: "icp", label: "Define ICP" },
  { step: 4, name: "mailbox", label: "Connect Mailbox" },
  { step: 5, name: "sequence", label: "Create Sequence" },
  { step: 6, name: "prospects", label: "Import Prospects" },
  { step: 7, name: "complete", label: "Complete" },
];

const userOnboardingState = new Map<string, { currentStep: number; completedSteps: string[] }>();

router.get("/onboarding-state", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const state = userOnboardingState.get(req.userContext.userId) || { currentStep: 1, completedSteps: [] };
    const currentStepInfo = onboardingSteps.find(s => s.step === state.currentStep) || onboardingSteps[0];

    res.json({
      currentStep: state.currentStep,
      currentStepName: currentStepInfo.name,
      currentStepLabel: currentStepInfo.label,
      completedSteps: state.completedSteps,
      totalSteps: onboardingSteps.length,
      isComplete: state.currentStep >= onboardingSteps.length,
      steps: onboardingSteps,
    });
  } catch (error) {
    console.error("Onboarding state error:", error);
    res.status(500).json({ error: "Failed to get onboarding state" });
  }
});

router.post("/onboarding-state", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { step, completedStep } = req.body;

    const state = userOnboardingState.get(req.userContext.userId) || { currentStep: 1, completedSteps: [] };

    if (completedStep && !state.completedSteps.includes(completedStep)) {
      state.completedSteps.push(completedStep);
    }

    if (step) {
      state.currentStep = step;
    }

    userOnboardingState.set(req.userContext.userId, state);

    res.json({
      success: true,
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
    });
  } catch (error) {
    console.error("Update onboarding state error:", error);
    res.status(500).json({ error: "Failed to update onboarding state" });
  }
});

export default router;
