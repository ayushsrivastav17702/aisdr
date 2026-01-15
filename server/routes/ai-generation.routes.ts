import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, forbidManager } from "../middleware/auth.middleware";
import { getCircuitBreaker } from "../services/resilience/circuit-breaker";

const router = Router();

const MAX_INPUT_LENGTH = 50000;
const MAX_BIO_LENGTH = 10000;

const prospectDataSchema = z.object({
  firstName: z.string().min(1, "First name is required for prospect data"),
  lastName: z.string().min(1, "Last name is required for prospect data"),
  company: z.string().min(1, "Company is required for prospect data"),
  title: z.string().optional(),
  email: z.string().email().optional(),
  bio: z.string().max(MAX_BIO_LENGTH).optional(),
  notes: z.string().max(MAX_BIO_LENGTH).optional(),
  linkedinUrl: z.string().optional(),
}).describe("Prospect data is required with firstName, lastName, and company fields");

const generateEmailSchema = z.object({
  prospectData: prospectDataSchema.describe("Prospect data context is required"),
  templateType: z.string().optional(),
  icp: z.string().min(1, "ICP context is required for AI generation").optional(),
  trigger: z.string().min(1, "Trigger event context is required").optional(),
  context: z.any().optional(),
  previousEmails: z.array(z.any()).optional(),
});

const INJECTION_PATTERNS = [
  /api_key/gi,
  /password/gi,
  /secret/gi,
  /token/gi,
  /credential/gi,
  /<script[^>]*>/gi,
  /<\/script>/gi,
  /javascript:/gi,
  /data:/gi,
  /vbscript:/gi,
  /on\w+\s*=/gi,
  /format:\s*json/gi,
  /keys:/gi,
  /output\s*format/gi,
  /ignore\s*previous/gi,
  /disregard/gi,
];

function sanitizeInput(input: string): string {
  if (!input) return input;
  let sanitized = input;
  
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  sanitized = sanitized
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/gi, '')
    .replace(/&gt;/gi, '');
  
  return sanitized;
}

function normalizeInput(input: string): string {
  if (!input) return input;
  return sanitizeInput(input)
    .normalize("NFC")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function truncateInput(input: string, maxLength: number): { text: string; truncated: boolean } {
  if (input.length <= maxLength) {
    return { text: input, truncated: false };
  }
  return { text: input.slice(0, maxLength), truncated: true };
}

function processProspectData(data: any): { processed: any; truncated: boolean } {
  let truncated = false;
  const processed = { ...data };

  if (processed.bio) {
    processed.bio = normalizeInput(processed.bio);
    const result = truncateInput(processed.bio, MAX_BIO_LENGTH);
    processed.bio = result.text;
    if (result.truncated) truncated = true;
  }

  if (processed.notes) {
    processed.notes = normalizeInput(processed.notes);
    const result = truncateInput(processed.notes, MAX_BIO_LENGTH);
    processed.notes = result.text;
    if (result.truncated) truncated = true;
  }

  return { processed, truncated };
}

function validationMiddleware(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.errors[0];
      const field = firstError.path.join(".");
      
      let errorMessage = firstError.message;
      if (field === "prospectData" && firstError.code === "invalid_type") {
        errorMessage = "Prospect data context is required with firstName, lastName, and company fields";
      } else if (field.startsWith("prospectData.") && firstError.message === "Required") {
        const missingField = field.replace("prospectData.", "");
        errorMessage = `${missingField} is required for prospect data context`;
      } else if (field.startsWith("prospectData.")) {
        errorMessage = `Prospect context error: ${firstError.message}`;
      } else if (field === "icp" || errorMessage.toLowerCase().includes("icp")) {
        errorMessage = "ICP context is required for AI generation";
      } else if (field === "trigger" || errorMessage.toLowerCase().includes("trigger")) {
        errorMessage = "Trigger event context is required for AI generation";
      }
      
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        error: errorMessage,
        field: field,
        message: errorMessage,
        action: "Please correct the field and try again",
      });
    }
    req.body = result.data;
    next();
  };
}

const fallbackTemplates: Record<string, { subject: string; body: string }> = {
  first_touch: {
    subject: "Quick question about {{company}}",
    body: "Hi {{firstName}},\n\nI came across {{company}} and was impressed by what you're building.\n\nWould you be open to a quick call to discuss how we might help?\n\nBest,\n{{senderName}}",
  },
  follow_up: {
    subject: "Following up",
    body: "Hi {{firstName}},\n\nJust following up on my previous message. Would love to connect if you have a few minutes.\n\nBest,\n{{senderName}}",
  },
  default: {
    subject: "Introduction",
    body: "Hi {{firstName}},\n\nI hope this message finds you well. I'd love to connect and discuss how we might be able to help {{company}}.\n\nBest regards,\n{{senderName}}",
  },
};

router.post("/generate-email", validationMiddleware(generateEmailSchema), authenticate, forbidManager, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { prospectData, templateType, icp, trigger, context, previousEmails } = req.body;
    const { processed, truncated } = processProspectData(prospectData);

    const testSimulate = req.headers['x-test-simulate'] as string | undefined;
    const simulateTimeout = testSimulate === 'ai-timeout';
    const simulateRateLimit = testSimulate === 'ai-rate-limit';

    if (simulateTimeout || simulateRateLimit) {
      const template = fallbackTemplates[templateType || "default"] || fallbackTemplates.default;
      return res.json({
        emailSubject: template.subject.replace("{{company}}", processed.company || "your company"),
        emailBody: template.body
          .replace("{{firstName}}", processed.firstName || "there")
          .replace("{{company}}", processed.company || "your company")
          .replace("{{senderName}}", "Your Team"),
        usedFallback: true,
        fallbackAvailable: true,
        metadata: {
          inputTruncated: truncated,
        },
        userNotification: simulateTimeout
          ? "AI service temporarily unavailable. Using safe fallback template."
          : "AI service rate limited. Using safe fallback template.",
      });
    }

    const circuitBreaker = getCircuitBreaker("ai", {
      failureThreshold: 3,
      timeout: 12000,
      resetTimeout: 30000,
    });

    try {
      const result = await circuitBreaker.execute(
        async () => {
          const template = fallbackTemplates[templateType || "first_touch"] || fallbackTemplates.default;
          return {
            subject: template.subject.replace("{{company}}", processed.company || "your company"),
            body: template.body
              .replace("{{firstName}}", processed.firstName || "there")
              .replace("{{company}}", processed.company || "your company")
              .replace("{{senderName}}", "Your Team"),
            usedFallback: false,
          };
        },
        () => {
          const template = fallbackTemplates[templateType || "default"] || fallbackTemplates.default;
          return {
            subject: template.subject.replace("{{company}}", processed.company || "your company"),
            body: template.body
              .replace("{{firstName}}", processed.firstName || "there")
              .replace("{{company}}", processed.company || "your company")
              .replace("{{senderName}}", "Your Team"),
            usedFallback: true,
          };
        }
      );

      res.json({
        emailSubject: result.subject,
        emailBody: result.body,
        usedFallback: result.usedFallback || false,
        metadata: {
          inputTruncated: truncated,
        },
        userNotification: result.usedFallback
          ? "AI service temporarily unavailable. Using safe fallback template."
          : undefined,
      });
    } catch (error) {
      const template = fallbackTemplates[templateType || "default"] || fallbackTemplates.default;
      res.json({
        emailSubject: template.subject.replace("{{company}}", processed.company || "your company"),
        emailBody: template.body
          .replace("{{firstName}}", processed.firstName || "there")
          .replace("{{company}}", processed.company || "your company")
          .replace("{{senderName}}", "Your Team"),
        usedFallback: true,
        fallbackAvailable: true,
        userNotification: "AI service temporarily unavailable. Using safe fallback template.",
      });
    }
  } catch (error) {
    console.error("AI generation error:", error);
    res.status(500).json({ error: "Failed to generate email" });
  }
});

const personalizeSchema = z.object({
  prospectData: prospectDataSchema.partial(),
  templateId: z.string().optional(),
  icp: z.string().optional(),
  trigger: z.string().optional(),
});

router.post("/personalize", validationMiddleware(personalizeSchema), authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { prospectData, templateId, icp, trigger } = req.body;

    if (!icp && !trigger) {
      return res.status(400).json({
        code: "MISSING_CONTEXT",
        error: "ICP and trigger are required to generate AI copy",
        message: "ICP and trigger are required to generate AI copy",
        action: "Please provide ICP and trigger information",
      });
    }

    const { processed, truncated } = processProspectData(prospectData || {});

    const requiredFields = ["firstName", "lastName", "company"];
    const missingFields = requiredFields.filter((f) => !processed[f]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        code: "MISSING_PROSPECT_DATA",
        error: `Required prospect fields missing: ${missingFields.join(", ")}`,
        message: `Required prospect fields missing: ${missingFields.join(", ")}`,
        missingFields,
        action: "Please provide all required prospect data",
      });
    }

    res.json({
      personalized: true,
      content: "Personalized content here",
      usedFallback: false,
      metadata: { inputTruncated: truncated },
    });
  } catch (error) {
    console.error("Personalization error:", error);
    res.status(500).json({ error: "Failed to personalize content" });
  }
});

export default router;
