import Groq from "groq-sdk";
import OpenAI from "openai";

const providers = {
  groq: !!process.env.GROQ_API_KEY,
  deepseek: !!process.env.DEEPSEEK_API_KEY,
};

console.log(
  '[AI Waterfall] Configured providers:',
  Object.entries(providers)
    .filter(([_, v]) => v)
    .map(([k]) => k)
    .join(' → ') || '(none)'
);

/**
 * AI provider waterfall: Groq → DeepSeek.
 *   1. Groq     (llama-3.3-70b-versatile) — GROQ_API_KEY
 *   2. DeepSeek (deepseek-chat)            — DEEPSEEK_API_KEY
 *
 * ANY error triggers the next provider.
 */
class OpenAIHelper {
  private groq: Groq | null = null;
  private deepseek: OpenAI | null = null;

  constructor() {
    if (process.env.GROQ_API_KEY) {
      this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }

    if (process.env.DEEPSEEK_API_KEY) {
      this.deepseek = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: "https://api.deepseek.com",
      });
    }

    const providerCount = [this.groq, this.deepseek].filter(Boolean).length;
    console.log(`[AIService] Initialized with ${providerCount} provider(s) (Groq → DeepSeek)`);
  }

  /**
   * Try providers in order: Groq → DeepSeek.
   *
   *   groqCall      — receives a Groq client
   *   deepseekCall  — receives an OpenAI-compat client pointed at DeepSeek
   */
  async callWithFallback<T = any>(
    groqCall: (client: Groq) => PromiseLike<T> | T,
    deepseekCall?: (client: OpenAI) => PromiseLike<T> | T
  ): Promise<T> {
    const errors: string[] = [];

    // ── 1. Groq ──────────────────────────────────────────────────────────────
    if (this.groq) {
      try {
        const result = await groqCall(this.groq);
        console.log("[AI] Provider: Groq");
        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(`[AI] Groq failed (${err?.status ?? "?"}): ${msg.substring(0, 120)}`);
        errors.push(`Groq: ${msg}`);
      }
    } else {
      errors.push("Groq: not configured");
    }

    // ── 2. DeepSeek ──────────────────────────────────────────────────────────
    if (this.deepseek && deepseekCall) {
      try {
        const result = await deepseekCall(this.deepseek);
        console.log("[AI] Provider: DeepSeek");
        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(`[AI] DeepSeek failed (${err?.status ?? "?"}): ${msg.substring(0, 120)}`);
        errors.push(`DeepSeek: ${msg}`);
      }
    } else if (!this.deepseek) {
      errors.push("DeepSeek: not configured");
    }

    throw new Error(
      `All AI providers failed.\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`
    );
  }
}

export const openaiHelper = new OpenAIHelper();
