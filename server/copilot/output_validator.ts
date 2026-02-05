export interface CopilotResponse {
  answer: string;
  root_cause: string;
  evidence: string[];
  confidence: number;
  recommended_action: string;
  severity: "low" | "medium" | "high" | "critical";
}

const SPECULATION_WORDS = [
  "probably",
  "maybe",
  "might",
  "possibly",
  "perhaps",
  "i think",
  "i believe",
  "could be",
  "seems like",
  "appears to",
  "likely",
  "unlikely",
  "assume",
  "guess",
];

const FORBIDDEN_PATTERNS = [
  /\bllm\b/i,
  /\bopenrouter\b/i,
  /\bgpt-?[34]\b/i,
  /\bclaude\s+sonnet\b/i,
  /\banthropic\s+api\b/i,
  /\bopenai\s+api\b/i,
  /cross[\s-]?tenant/i,
  /other\s+(user|organization|tenant)/i,
];

export function validateOutput(response: unknown): CopilotResponse | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  
  const obj = response as Record<string, unknown>;
  
  if (typeof obj.answer !== "string" || !obj.answer.trim()) {
    return null;
  }
  if (typeof obj.root_cause !== "string") {
    return null;
  }
  if (!Array.isArray(obj.evidence)) {
    return null;
  }
  if (typeof obj.confidence !== "number" || obj.confidence < 0 || obj.confidence > 1) {
    return null;
  }
  if (typeof obj.recommended_action !== "string") {
    return null;
  }
  if (!["low", "medium", "high", "critical"].includes(obj.severity as string)) {
    return null;
  }
  
  const fullText = `${obj.answer} ${obj.root_cause} ${obj.recommended_action}`.toLowerCase();
  
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(fullText)) {
      console.warn(`[CopilotValidator] Response matches forbidden pattern: ${pattern}`);
      return null;
    }
  }
  
  let speculationCount = 0;
  for (const word of SPECULATION_WORDS) {
    if (fullText.includes(word.toLowerCase())) {
      speculationCount++;
    }
  }
  
  if (speculationCount > 2) {
    console.warn(`[CopilotValidator] Response contains too much speculation (${speculationCount} words)`);
    return null;
  }
  
  return {
    answer: obj.answer as string,
    root_cause: obj.root_cause as string,
    evidence: obj.evidence as string[],
    confidence: obj.confidence as number,
    recommended_action: obj.recommended_action as string,
    severity: obj.severity as CopilotResponse["severity"],
  };
}

export function parseJsonResponse(text: string): unknown | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

export function getInsufficientEvidenceResponse(): CopilotResponse {
  return {
    answer: "Insufficient evidence to answer this question.",
    root_cause: "unknown",
    evidence: [],
    confidence: 0,
    recommended_action: "Provide more context (email_id, sequence_id, or queue_id) to investigate.",
    severity: "low",
  };
}

export function getAccessDeniedResponse(): CopilotResponse {
  return {
    answer: "Access denied.",
    root_cause: "forbidden_request",
    evidence: [],
    confidence: 1,
    recommended_action: "This query is not permitted.",
    severity: "high",
  };
}
