import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, forbidManager } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { db } from "../db";
import { sequences, emailMailboxes } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { initializeSequence } from "../services/sequence-init.service";

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

// GET /api/campaigns — list all campaigns (sequences) for the authenticated user
router.get("/", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const { userId } = req.userContext;
    const campaigns = await db
      .select()
      .from(sequences)
      .where(eq(sequences.userId, userId));
    return res.json(campaigns);
  } catch (error) {
    console.error("List campaigns error:", error);
    return res.status(500).json({ error: "Failed to list campaigns" });
  }
});

router.post("/", validationMiddleware(campaignSchema), authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { name, description, status } = req.body;

    const existing = await db
      .select({ id: sequences.id })
      .from(sequences)
      .where(and(eq(sequences.userId, req.userContext.userId), eq(sequences.name, name)))
      .limit(1);
    if (existing.length) {
      return res.status(409).json({
        error: `A campaign named "${name}" already exists. Please choose a different name.`,
      });
    }

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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid input", details: error.errors.map(e => e.message) });
    }
    if ((error as any)?.code === '23505') {
      return res.status(409).json({ error: "Resource already exists" });
    }
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

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "paused"],
  active: ["paused", "completed"],
  paused: ["active", "draft"],
  completed: [],
};

router.patch("/:id", validationMiddleware(campaignSchema.partial()), authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const sequence = await storage.getSequence(req.userContext, req.params.id);
    if (!sequence) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const { status, ...otherUpdates } = req.body;

    if (status && status !== sequence.status) {
      const validTransitions = VALID_TRANSITIONS[sequence.status] || [];
      if (!validTransitions.includes(status)) {
        return res.status(422).json({
          code: "INVALID_TRANSITION",
          error: `Cannot transition from ${sequence.status} to ${status}`,
          message: `Invalid status transition. Valid transitions from ${sequence.status}: ${validTransitions.join(", ") || "none"}`,
          currentStatus: sequence.status,
          requestedStatus: status,
          validTransitions,
        });
      }
    }

    const updated = await storage.updateSequence(req.userContext, req.params.id, { status, ...otherUpdates });
    res.json(updated);
  } catch (error) {
    console.error("Campaign update error:", error);
    res.status(500).json({ error: "Failed to update campaign" });
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

    const steps = await storage.getSequenceSteps(req.userContext, req.params.id);
    if (steps.length === 0) {
      missingSteps.push("At least one sequence step required");
    }

    const mailboxes = await db
      .select({ id: emailMailboxes.id })
      .from(emailMailboxes)
      .where(
        and(
          eq(emailMailboxes.userId, req.userContext.userId),
          eq(emailMailboxes.status, 'active')
        )
      )
      .limit(1);
    if (mailboxes.length === 0) {
      missingSteps.push("No active mailbox connected");
    }

    if (missingSteps.length > 0) {
      const hasMailboxIssue = missingSteps.some(s => s.toLowerCase().includes("mailbox"));
      const onlyMailbox = missingSteps.every(s => s.toLowerCase().includes("mailbox"));
      return res.status(400).json({
        error: onlyMailbox
          ? "No active mailbox connected. Please connect a mailbox before launching."
          : "Cannot launch campaign: " + missingSteps.join(", "),
        missingSteps,
        launched: false,
        status: sequence.status,
      });
    }

    await storage.updateSequence(req.userContext, req.params.id, { status: "active", isApproved: true });

    // P0 FIX 1: Campaigns are rows in the `sequences` table — launching a campaign
    // must queue the first email for every enrolled prospect, exactly like
    // activating a sequence does via PUT/PATCH /api/sequences/:id.
    try {
      await initializeSequence(req.userContext, req.params.id);
    } catch (initError) {
      console.error("Campaign launch: initializeSequence failed, rolling back to draft:", initError);
      await storage.updateSequence(req.userContext, req.params.id, { status: "draft", isApproved: false });
      return res.status(500).json({
        error: "Failed to queue emails for campaign launch. Campaign reverted to draft.",
        launched: false,
        status: "draft",
      });
    }

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
