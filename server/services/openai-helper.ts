import Groq from "groq-sdk";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const providers = {
  groq: !!process.env.GROQ_API_KEY,
  deepseek: !!process.env.DEEPSEEK_API_KEY,
  openrouter: !!(process.env.OPEN_ROUTER || process.env.OPENROUTER_API_KEY),
  anthropic: !!process.env.ANTHROPIC_API_KEY,
};

console.log(
  '[AI Waterfall] Configured providers:',
  Object.entries(providers)
    .filter(([_, v]) => v)
    .map(([k]) => k)
    .join(' → ') || '(none)'
);

/**
 * AI provider waterfall:
 *   1. Groq          (llama-3.3-70b-versatile) — GROQ_API_KEY
 *   2. DeepSeek      (deepseek-chat)            — DEEPSEEK_API_KEY
 *   3. OpenRouter    (OPENROUTER_MODEL env)     — OPEN_ROUTER
 *   4. Anthropic     (claude-sonnet-4-20250514) — ANTHROPIC_API_KEY
 *
 * KEY BEHAVIOUR: ALL errors trigger fallback (not just 429).
 * If Groq returns 500, DeepSeek is tried, then OpenRouter, then Anthropic.
 */
class OpenAIHelper {
  private groq: Groq | null = null;
  private deepseek: OpenAI | null = null;
  private openRouterClient: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

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

    if (process.env.OPEN_ROUTER) {
      this.openRouterClient = new OpenAI({
        apiKey: process.env.OPEN_ROUTER,
        baseURL: "https://openrouter.ai/api/v1",
      });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    const providerCount = [
      this.groq,
      this.deepseek,
      this.openRouterClient,
      this.anthropic,
    ].filter(Boolean).length;
    console.log(`[AIService] Initialized with ${providerCount} provider(s) (Groq → DeepSeek → OpenRouter → Anthropic)`);
  }

  /** Exposed so callers that used the old OpenAI client can use OpenRouter instead. */
  getOpenRouterClient(): OpenAI | null {
    return this.openRouterClient;
  }

  /**
   * Try providers in order: Groq → DeepSeek → OpenRouter → Anthropic.
   * ANY error (not just 429) triggers the next provider.
   *
   * Callers provide a factory per provider type:
   *   groqCall        — receives a Groq client
   *   anthropicCall   — receives an Anthropic client
   *   openRouterCall  — receives an OpenAI-compat client pointed at OpenRouter
   *
   * DeepSeek reuses the same OpenAI-compat shape as OpenRouter, so the
   * openRouterCall factory is also used for DeepSeek (the client object is
   * different but the API shape is identical).
   */
  async callWithFallback<T = any>(
    // Previously the first arg was the primary OpenAI call; now it carries the
    // Groq call.  Callers that used the old OpenAI client shape still work
    // because Groq's SDK exposes the same chat.completions.create interface.
    groqCall: (client: Groq) => PromiseLike<T> | T,
    anthropicCall?: (anthropic: Anthropic) => PromiseLike<T> | T,
    openRouterCall?: (client: OpenAI) => PromiseLike<T> | T
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
    if (this.deepseek && openRouterCall) {
      try {
        const result = await openRouterCall(this.deepseek);
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

    // ── 3. OpenRouter ────────────────────────────────────────────────────────
    if (this.openRouterClient && openRouterCall) {
      try {
        const result = await openRouterCall(this.openRouterClient);
        console.log("[AI] Provider: OpenRouter");
        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(`[AI] OpenRouter failed (${err?.status ?? "?"}): ${msg.substring(0, 120)}`);
        errors.push(`OpenRouter: ${msg}`);
      }
    } else if (!this.openRouterClient) {
      errors.push("OpenRouter: not configured");
    }

    // ── 4. Anthropic ─────────────────────────────────────────────────────────
    if (this.anthropic && anthropicCall) {
      try {
        const result = await anthropicCall(this.anthropic);
        console.log("[AI] Provider: Anthropic");
        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(`[AI] Anthropic failed (${err?.status ?? "?"}): ${msg.substring(0, 120)}`);
        errors.push(`Anthropic: ${msg}`);
      }
    } else if (!this.anthropic) {
      errors.push("Anthropic: not configured");
    }

    throw new Error(
      `All AI providers failed.\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`
    );
  }
}

export const openaiHelper = new OpenAIHelper();
