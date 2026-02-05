export interface CopilotResponse {
  answer: string;
  root_cause: string;
  evidence: string[];
  confidence: number;
  recommended_action: string;
  severity: "low" | "medium" | "high" | "critical";
}

const SPECULATION_WORDS = [
  "i think",
  "i believe",
  "assume",
  "guess",
  "guessing",
];

// Use regex patterns with word boundaries to avoid false positives
// e.g., "ai" shouldn't match "email" or "fail"
const FORBIDDEN_WORD_PATTERNS = [
  /\bai\b(?!l)/i,  // "ai" but not "ail" in "email", "fail"
  /\bmodel\b/i,
  /\bprompt\b/i,
  /\bhallucinate\b/i,
  /\bhallucination\b/i,
  /\bllm\b/i,
  /\bopenrouter\b/i,
  /\bgpt[-\s]?[34]/i,
  /\bclaude\b/i,
  /\banthropic\b/i,
  /\bopenai\b/i,
  /\bneural\b/i,
  /\btraining data\b/i,
  /\blanguage model\b/i,
  /\bas an ai\b/i,
  /\bi am an? (artificial|language)/i,
];

const FORBIDDEN_PATTERNS = [
  /cross[\s-]?tenant/i,
  /other\s+(user|organization|tenant)/i,
  /i am (an|a) (artificial|language|machine)/i,
  /as an ai/i,
  /my (training|programming)/i,
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
  
  // Check forbidden word patterns (with word boundaries)
  for (const pattern of FORBIDDEN_WORD_PATTERNS) {
    if (pattern.test(fullText)) {
      console.warn(`[CopilotValidator] Response matches forbidden word pattern: ${pattern}`);
      return null;
    }
  }
  
  // Check forbidden patterns
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
  
  if (speculationCount > 3) {
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
    answer: "Not enough data to determine. Insufficient data available.",
    root_cause: "insufficient_data",
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

export function getUnclearQuestionResponse(): CopilotResponse {
  return {
    answer: "Not enough data to determine.",
    root_cause: "unclear_question",
    evidence: [],
    confidence: 0,
    recommended_action: "Ask a specific question about email delivery, failures, or queue status.",
    severity: "low",
  };
}
