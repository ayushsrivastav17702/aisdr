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
  CopilotResponse 
} from "./output_validator";
import { db } from "../db";
import { auditLogs } from "@shared/schema";

interface CopilotQueryRequest {
  question: string;
  email_id?: string;
  sequence_id?: string;
  queue_id?: string;
}

const FORBIDDEN_PATTERNS = [
  /show.*other.*compan/i,
  /other.*tenant/i,
  /api.*key/i,
  /password/i,
  /credential/i,
  /secret/i,
  /ignore.*rule/i,
  /bypass/i,
  /override.*security/i,
  /cross.*tenant/i,
  /all.*user/i,
  /dump.*database/i,
  /export.*all/i,
];

function isForbiddenQuestion(question: string): boolean {
  return FORBIDDEN_PATTERNS.some(pattern => pattern.test(question));
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
    
    if (question.length < 5 || question.length > 500) {
      res.status(400).json({ error: "Question must be between 5 and 500 characters" });
      return;
    }
    
    if (isForbiddenQuestion(question)) {
      await logCopilotQuery(userId, "ACCESS_DENIED", question, 1, "high");
      res.json(getAccessDeniedResponse());
      return;
    }
    
    const systemState = await getSystemState({
      tenantId: organizationId || userId,
      userId,
      emailId: body.email_id,
      sequenceId: body.sequence_id,
      queueId: body.queue_id,
    });
    
    const hasRelevantState = 
      systemState.email || 
      systemState.queue || 
      systemState.sequence;
    
    if (!hasRelevantState && (body.email_id || body.sequence_id || body.queue_id)) {
      res.json(getInsufficientEvidenceResponse());
      return;
    }
    
    const evidence = buildEvidence(systemState);
    
    const knowledge = getRelevantKnowledge(question);
    
    let response: CopilotResponse;
    
    try {
      const rawResponse = await askCopilot({
        question,
        systemState,
        evidence,
        knowledge,
        role,
      });
      
      const parsed = parseJsonResponse(rawResponse);
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
