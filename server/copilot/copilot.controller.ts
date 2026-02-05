import { Request, Response } from "express";
import { getSystemState } from "./state_collector";
import { buildEvidence } from "./evidence_builder";
import { getRelevantKnowledge } from "./knowledge_retriever";
import { askCopilot } from "./openrouter_client";
import { 
  validateOutput, 
  parseJsonResponse, 
  getInsufficientEvidenceResponse, 
  getAccessDeniedResponse,
  getUnclearQuestionResponse,
  CopilotResponse 
} from "./output_validator";
import { db } from "../db";
import { auditLogs } from "@shared/schema";

interface CopilotQueryRequest {
  question: string;
  email_id?: string;
  sequence_id?: string;
  queue_id?: string;
  email_ids?: string[];
  queue_ids?: string[];
  metrics_context?: {
    deliveryRate?: number;
    failureRate?: number;
    queueDepth?: number;
    stuckCount?: number;
  };
}

const FORBIDDEN_PATTERNS = [
  // Cross-tenant / global data access (15 patterns)
  /show.*all.*customer/i,
  /all.*failed.*email.*across/i,
  /other.*compan(y|ies)/i,
  /other.*tenant/i,
  /other.*account/i,
  /other.*org(anization)?/i,
  /cross.*tenant/i,
  /all.*user/i,
  /globally/i,
  /list.*all.*org/i,
  /compare.*org/i,
  /userId\s*=\s*\d+/i,
  /happening.*in.*other/i,
  /what.*other.*companies/i,
  /data.*from.*all/i,
  /across.*all.*customer/i,
  /every.*organization/i,
  /all.*organizations/i,
  /platform.*wide/i,
  /system.*wide/i,
  
  // Security sensitive (12 patterns)
  /api.*key/i,
  /password/i,
  /credential/i,
  /secret/i,
  /raw.*database/i,
  /dump.*table/i,
  /dump.*database/i,
  /export.*all/i,
  /raw.*row/i,
  /show.*token/i,
  /access.*token/i,
  /auth.*token/i,
  /encryption.*key/i,
  /private.*key/i,
  
  // Prompt injection / rule bypass (12 patterns)
  /ignore.*rule/i,
  /ignore.*auth/i,
  /bypass/i,
  /override.*security/i,
  /break.*rule/i,
  /pretend.*human/i,
  /respond.*casual/i,
  /system:\s*you\s+can/i,
  /ignore\s+all/i,
  /forget.*instructions/i,
  /new.*instructions/i,
  /disregard.*previous/i,
  /act\s+as\s+if/i,
  /you\s+are\s+now/i,
  
  // AI identity questions (8 patterns)
  /are.*you.*ai/i,
  /which.*model/i,
  /explain.*prompt/i,
  /your.*prompt/i,
  /how.*work.*internal/i,
  /what.*are.*you/i,
  /who.*made.*you/i,
  /your.*training/i,
  /reveal.*system/i,
  
  // SQL injection patterns (10 patterns)
  /SELECT\s+\*\s+FROM/i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
  /INSERT\s+INTO/i,
  /UPDATE\s+.*SET/i,
  /UNION\s+SELECT/i,
  /;\s*DROP/i,
  /'\s*OR\s*'/i,
  /--\s*$/,
  /TRUNCATE\s+TABLE/i,
  /ALTER\s+TABLE/i,
];

// Total: 57 patterns

function isForbiddenQuestion(question: string): boolean {
  return FORBIDDEN_PATTERNS.some(pattern => pattern.test(question));
}

function isUnclearQuestion(question: string): boolean {
  // Remove all emoji and special characters
  const stripped = question.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[^\w\s]/gu, "").trim();
  
  // Check if mostly emoji or symbols
  if (stripped.length < 3) {
    return true;
  }
  
  // Check for random nonsense (no real words)
  const words = stripped.split(/\s+/);
  const hasRealWords = words.some(word => word.length > 2 && /^[a-zA-Z]+$/.test(word));
  
  if (!hasRealWords && words.length < 3) {
    return true;
  }
  
  return false;
}

export async function handleCopilotQuery(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    if (!req.userContext) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    
    const { userId, roles, organizationId } = req.userContext;
    const role = roles[0] || "user";
    
    if (!organizationId && role !== "super_admin") {
      res.status(403).json({ error: "Tenant context required" });
      return;
    }
    
    const body = req.body as CopilotQueryRequest;
    
    if (!body.question || typeof body.question !== "string") {
      res.status(400).json({ error: "Question is required" });
      return;
    }
    
    const question = body.question.trim();
    
    if (question.length > 500) {
      res.status(400).json({ error: "Question must be 500 characters or less" });
      return;
    }
    
    // Handle very short, emoji-only, or nonsense questions before other checks
    if (question.length < 5 || isUnclearQuestion(question)) {
      res.json(getUnclearQuestionResponse());
      return;
    }
    
    if (isForbiddenQuestion(question)) {
      await logCopilotQuery(userId, "ACCESS_DENIED", question, 1, "high");
      res.status(403).json(getAccessDeniedResponse());
      return;
    }
    
    const systemState = await getSystemState({
      tenantId: organizationId || userId,
      userId,
      emailId: body.email_id,
      sequenceId: body.sequence_id,
      queueId: body.queue_id,
      emailIds: body.email_ids,
      queueIds: body.queue_ids,
      metricsContext: body.metrics_context,
    });
    
    const hasRelevantState = 
      systemState.email || 
      systemState.queue || 
      systemState.sequence ||
      systemState.metricsContext ||
      systemState.scheduler;
    
    if (!hasRelevantState && (body.email_id || body.sequence_id || body.queue_id)) {
      res.json(getInsufficientEvidenceResponse());
      return;
    }
    
    const evidence = buildEvidence(systemState);
    
    const knowledge = getRelevantKnowledge(question);
    
    let response: CopilotResponse;
    
    try {
      console.log("[Copilot] Evidence:", evidence);
      console.log("[Copilot] SystemState keys:", Object.keys(systemState));
      
      const rawResponse = await askCopilot({
        question,
        systemState,
        evidence,
        knowledge,
        role,
      });
      
      console.log("[Copilot] Raw response:", rawResponse.substring(0, 500));
      
      const parsed = parseJsonResponse(rawResponse);
      console.log("[Copilot] Parsed:", parsed);
      
      const validated = validateOutput(parsed);
      
      if (!validated) {
        console.warn("[Copilot] Response validation failed, using fallback");
        response = getInsufficientEvidenceResponse();
      } else {
        response = validated;
      }
    } catch (llmError) {
      console.error("[Copilot] Provider error:", llmError);
      response = {
        answer: "Unable to process query at this time. Please try again.",
        root_cause: "service_error",
        evidence: [],
        confidence: 0,
        recommended_action: "Retry the query or contact support if the issue persists.",
        severity: "medium",
      };
    }
    
    const duration = Date.now() - startTime;
    
    await logCopilotQuery(
      userId, 
      "COPILOT_QUERY", 
      question, 
      response.confidence, 
      response.severity,
      { duration, hasState: hasRelevantState }
    );
    
    res.json(response);
  } catch (error) {
    console.error("[Copilot] Controller error:", error);
    res.status(500).json({ 
      error: "Internal server error processing copilot query" 
    });
  }
}

async function logCopilotQuery(
  userId: string,
  action: string,
  question: string,
  confidence: number,
  severity: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId,
      action,
      module: "copilot",
      details: {
        question: question.substring(0, 200),
        confidence,
        severity,
        ...extra,
      },
    });
  } catch (error) {
    console.error("[Copilot] Failed to log audit:", error);
  }
}
