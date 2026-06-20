import { openaiHelper } from "../services/openai-helper";

interface AskCopilotParams {
  question: string;
  systemState: any;
  evidence: any;
  knowledge: any;
  role: string;
}

export async function askCopilot(params: AskCopilotParams): Promise<string> {
  const { question, systemState, evidence, knowledge, role } = params;

  const systemPrompt = `You are an AI SDR copilot assistant. You help analyze system state and provide actionable insights. Role: ${role}. Always respond with valid JSON.`;

  const userPrompt = `Question: ${question}

System State: ${JSON.stringify(systemState, null, 2)}
Evidence: ${JSON.stringify(evidence, null, 2)}
Knowledge: ${JSON.stringify(knowledge, null, 2)}

Provide a concise, actionable JSON response.`;

  const response: any = await openaiHelper.callWithFallback(
    (groqClient) =>
      groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      } as any),
    (client) =>
      client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }) as any
  );

  return response.choices[0].message.content || "{}";
}
