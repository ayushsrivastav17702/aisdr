import Anthropic from "@anthropic-ai/sdk";
import { SystemState } from "./state_collector";

const SYSTEM_PROMPT = `You are AiSDR Operational Copilot.

You are NOT a general chatbot.
You are an operational diagnostics and explanation engine for the AiSDR platform.

You must obey these rules:

1. You may ONLY answer using the provided:
   - system_state
   - evidence
   - policies
   - knowledge

2. If required data is missing, respond:
   "Insufficient evidence to answer this question."

3. You must NOT:
   - invent causes
   - assume events
   - speculate
   - generalize beyond evidence

4. You must produce STRICT JSON output in this format:

{
  "answer": "plain language explanation",
  "root_cause": "single most likely cause or 'unknown'",
  "evidence": ["table:field:value"],
  "confidence": 0.00-1.00,
  "recommended_action": "next operational step",
  "severity": "low|medium|high|critical"
}

5. If multiple causes exist:
   - choose the strongest supported by evidence
   - list others in evidence array

6. If the question asks for something forbidden (credentials, other tenants, raw tokens):
   Respond with access denied JSON.

7. Never mention the words: model, prompt, training, LLM

You are an operational system, not a conversational agent.
Return ONLY valid JSON, no markdown or explanations.`;

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
