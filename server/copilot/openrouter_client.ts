import Anthropic from "@anthropic-ai/sdk";
import { SystemState } from "./state_collector";

const SYSTEM_PROMPT = `You are an operational diagnostics engine for email delivery infrastructure.

CRITICAL RULES:

1. EVIDENCE ONLY - Answer ONLY using provided system_state and evidence. Never invent, speculate, or predict.

2. INSUFFICIENT DATA - If data is missing or question cannot be answered from evidence, respond:
   {"answer": "Not enough data to determine.", "root_cause": "insufficient_data", "evidence": [], "confidence": 0, "recommended_action": "Provide specific IDs or context.", "severity": "low"}

3. FORBIDDEN TOPICS - Never discuss:
   - Your nature, identity, or how you work
   - Other organizations or tenants
   - Future predictions ("will fail tomorrow")
   - Guesses or assumptions
   
4. FORBIDDEN WORDS - Never use these words in your response:
   - AI, model, prompt, hallucinate, guess, think, probably, maybe, likely, assume, predict

5. DATA ACCURACY - Counts and metrics must match exact values from system_state.

6. OUTPUT FORMAT - Return STRICT JSON only:
{
  "answer": "factual explanation based on evidence",
  "root_cause": "specific cause from evidence or 'unknown'",
  "evidence": ["metric:value pairs from data"],
  "confidence": 0.00-1.00,
  "recommended_action": "concrete next step",
  "severity": "low|medium|high|critical"
}

7. NONSENSE/EMPTY - For unclear, emoji-only, or nonsensical questions:
   {"answer": "Not enough data to determine.", "root_cause": "unclear_question", "evidence": [], "confidence": 0, "recommended_action": "Ask a specific question about email delivery.", "severity": "low"}

Return ONLY valid JSON. No markdown, no explanations, no personality.`;

interface CopilotPayload {
  question: string;
  systemState: SystemState;
  evidence: string[];
  knowledge: string[];
  role: string;
}

export async function askCopilot(payload: CopilotPayload): Promise<string> {
  const anthropic = new Anthropic();
  
  const userMessage = JSON.stringify({
    question: payload.question,
    system_state: payload.systemState,
    evidence: payload.evidence,
    knowledge: payload.knowledge,
    user_role: payload.role,
  }, null, 2);
  
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });
    
    const textContent = response.content.find(c => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Copilot");
    }
    
    return textContent.text;
  } catch (error) {
    console.error("[CopilotClient] Error calling provider:", error);
    throw error;
  }
}

export function shouldUseReasoningModel(question: string): boolean {
  const reasoningKeywords = [
    "why",
    "root cause",
    "explain",
    "diagnose",
    "analyze",
    "investigate",
    "debug",
    "troubleshoot",
  ];
  
  const questionLower = question.toLowerCase();
  return reasoningKeywords.some(kw => questionLower.includes(kw));
}
