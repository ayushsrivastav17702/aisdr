import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, forbidManager } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { db } from "../db";
import { sequences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const router = Router();

const campaignSchema = z.object({
  name: z.string()
    .transform(val => val.trim())
    .refine(val => val.length >= 1, { message: "Campaign name is required" })
    .refine(val => val.length <= 120, { message: "Campaign name must be 120 characters or less" }),
  description: z.string().optional(),
  targetAudience: z.string().nullable().optional(),
  icpId: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "paused", "completed"]).optional().default("draft"),
});

function validationMiddleware(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.errors[0];
      return res.status(422).json({
        code: "VALIDATION_ERROR",
        error: firstError.message,
        field: firstError.path.join("."),
        message: firstError.message,
        action: "Please correct the field and try again",
      });
    }
    req.body = result.data;
    next();
  };
}

router.post("/", validationMiddleware(campaignSchema), authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { name, description, status } = req.body;

    const sequenceId = nanoid();
    await db.insert(sequences).values({
      id: sequenceId,
      name,
      userId: req.userContext.userId,
      status: status || "draft",
    });

    const sequence = await db.query.sequences.findFirst({
      where: eq(sequences.id, sequenceId),
    });

    res.status(201).json({
      id: sequenceId,
      name,
      status: status || "draft",
      ...sequence,
    });
  } catch (error) {
    console.error("Campaign creation error:", error);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const sequence = await storage.getSequence(req.userContext, req.params.id);
    if (!sequence) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json(sequence);
  } catch (error) {
    console.error("Campaign fetch error:", error);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

router.post("/:id/launch", authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const sequence = await storage.getSequence(req.userContext, req.params.id);
    if (!sequence) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const missingSteps: string[] = [];
    
    if (!sequence.icpId) {
      missingSteps.push("ICP selection required");
    }

    const steps = await storage.getSequenceSteps(req.userContext, req.params.id);
    if (steps.length === 0) {
      missingSteps.push("At least one sequence step required");
    }

    if (missingSteps.length > 0) {
      return res.status(400).json({
        error: "Cannot launch campaign: " + missingSteps.join(", "),
        missingSteps,
        launched: false,
        status: sequence.status,
      });
    }

    await storage.updateSequence(req.userContext, req.params.id, { status: "active" });

    res.json({
      success: true,
      launched: true,
      status: "active",
    });
  } catch (error) {
    console.error("Campaign launch error:", error);
    res.status(500).json({ error: "Failed to launch campaign", launched: false });
  }
});

export default router;
