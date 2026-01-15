import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, forbidManager } from "../middleware/auth.middleware";
import { storage } from "../storage";
import { db } from "../db";
import { emails, emailQueue } from "@shared/schema";
import { nanoid } from "nanoid";
import { getQueueManager } from "../services/resilience/queue-provider";
import { withRetry } from "../services/resilience/retry-handler";
import { getCircuitBreaker } from "../services/resilience/circuit-breaker";

const router = Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendEmailSchema = z.object({
  prospectId: z.string().min(1, "Prospect ID is required"),
  to: z.string().email("Invalid email address").optional(),
  subject: z.string().min(1, "Subject cannot be empty"),
  body: z.string().min(1, "Body cannot be empty"),
});

const sendBatchSchema = z.object({
  prospectIds: z.array(z.string()).min(1, "At least one prospect ID is required"),
  subject: z.string().min(1, "Subject cannot be empty"),
  body: z.string().min(1, "Body cannot be empty"),
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

const dailyLimits = new Map<string, { count: number; resetAt: Date }>();

function checkDailyLimit(userId: string): { allowed: boolean; remaining: number } {
  const limit = 500;
  const now = new Date();
  const userLimit = dailyLimits.get(userId);

  if (!userLimit || userLimit.resetAt < now) {
    dailyLimits.set(userId, {
      count: 0,
      resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    return { allowed: true, remaining: limit };
  }

  if (userLimit.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: limit - userLimit.count };
}

function incrementDailyLimit(userId: string): void {
  const userLimit = dailyLimits.get(userId);
  if (userLimit) {
    userLimit.count++;
  }
}

router.post("/send", validationMiddleware(sendEmailSchema), authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { prospectId, to, subject, body } = req.body;

    const limitCheck = checkDailyLimit(req.userContext.userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        code: "DAILY_LIMIT_EXCEEDED",
        error: "Daily email limit reached",
        message: "Daily email limit reached",
        action: "Please try again tomorrow or upgrade your plan",
      });
    }

    const circuitBreaker = getCircuitBreaker("email", {
      failureThreshold: 5,
      timeout: 15000,
      resetTimeout: 60000,
    });

    try {
      await circuitBreaker.execute(
        async () => {
          incrementDailyLimit(req.userContext!.userId);

          return {
            id: nanoid(),
            status: "sent",
            sentAt: new Date().toISOString(),
          };
        },
        async () => {
          const queueManager = getQueueManager();
          const jobId = await queueManager.enqueue("email", {
            prospectId,
            to,
            subject,
            body,
            userId: req.userContext!.userId,
          });

          return {
            id: jobId,
            status: "queued",
            queuedAt: new Date().toISOString(),
          };
        }
      );

      const limitCheck2 = checkDailyLimit(req.userContext!.userId);
      res.status(200).json({
        success: true,
        status: "sent",
        emailId: nanoid(),
        emailsRemaining: limitCheck2.remaining,
        dailyLimit: 500,
        linksWrapped: 0,
      });
    } catch (error) {
      const queueManager = getQueueManager();
      const jobId = await queueManager.enqueue("email", {
        prospectId,
        to,
        subject,
        body,
        userId: req.userContext.userId,
      });

      res.status(202).json({
        success: true,
        status: "queued",
        jobId,
        message: "Email queued for delivery",
      });
    }
  } catch (error) {
    console.error("Email send error:", error);
    res.status(500).json({ error: "Failed to send email", canRetry: true });
  }
});

router.post("/send-batch", validationMiddleware(sendBatchSchema), authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { prospectIds, subject, body } = req.body;

    const limitCheck = checkDailyLimit(req.userContext.userId);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        code: "DAILY_LIMIT_EXCEEDED",
        error: "Daily email limit reached",
        message: "Daily email limit reached",
      });
    }

    if (prospectIds.length > limitCheck.remaining) {
      return res.status(429).json({
        code: "DAILY_LIMIT_EXCEEDED",
        error: `Cannot send ${prospectIds.length} emails, only ${limitCheck.remaining} remaining today`,
        message: `Cannot send ${prospectIds.length} emails, only ${limitCheck.remaining} remaining today`,
      });
    }

    const queueManager = getQueueManager();
    const operationId = nanoid();
    let queued = 0;

    for (const prospectId of prospectIds) {
      await queueManager.enqueue("email", {
        prospectId,
        subject,
        body,
        userId: req.userContext.userId,
        operationId,
      });
      queued++;
    }

    res.status(202).json({
      success: true,
      operationId,
      queued,
      total: prospectIds.length,
      estimatedDelivery: new Date(Date.now() + queued * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Batch email error:", error);
    res.status(500).json({ error: "Failed to queue batch emails" });
  }
});

export default router;
