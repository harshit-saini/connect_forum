import "server-only";
import { env } from "@/server/env";
import { log } from "@/server/logging/logger";
import { mockEmbed } from "./embeddings";

export type LlmRequest = {
  /** Fixed instructions. Sent with prompt caching where the provider supports it. */
  system: string;
  /** Variable content: untrusted profile data in delimited blocks. */
  user: string;
  maxTokens: number;
};

export type LlmResponse = { text: string; usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number } };

export interface LlmProvider {
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/**
 * Anthropic Messages API on Azure AI Foundry:
 *   POST {FOUNDRY_ENDPOINT}/anthropic/v1/messages  (header `x-api-key`, `anthropic-version`)
 * `model` is the deployment name (LLM_DEPLOYMENT). 429s, 5xx and timeouts are retried with backoff.
 */
export class FoundryLlmProvider implements LlmProvider {
  constructor(
    private endpoint: string,
    private apiKey: string,
    readonly model: string,
    private opts: { maxRetries: number; timeoutMs: number },
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const base = this.endpoint.replace(/\/+$/, "").replace(/\/anthropic(\/v1)?$/, "");
    const url = `${base}/anthropic/v1/messages`;
    const body = JSON.stringify({
      model: this.model,
      max_tokens: req.maxTokens,
      temperature: 0,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
    });
    const started = Date.now();
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body,
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      }).catch((err: unknown) => err as Error);

      if (res instanceof Response && res.ok) {
        const json = (await res.json()) as {
          content: { type: string; text?: string }[];
          usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
        };
        const text = json.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
        const usage = { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0, cacheReadTokens: json.usage?.cache_read_input_tokens };
        // Token counts and latency only: never prompt or completion content.
        log.info("llm.call", { model: this.model, ...usage, ms: Date.now() - started, attempt });
        return { text, usage };
      }

      const status = res instanceof Response ? res.status : 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt > this.opts.maxRetries) throw new Error(`LLM request failed (${status || "network"})`);
      const retryAfter = res instanceof Response ? Number(res.headers.get("retry-after")) : NaN;
      await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 750 * 2 ** (attempt - 1)));
    }
  }
}

/**
 * OpenAI models on Azure AI Foundry (chat completions, OpenAI-compatible v1 route):
 *   POST {FOUNDRY_ENDPOINT}/openai/v1/chat/completions  (header `api-key`, body `model` = deployment name)
 * JSON mode is requested so the reply is a single JSON object; the rerank module still validates it.
 * Reasoning-style models spend completion tokens on thinking, so the output budget is generous and
 * `temperature` is left at the model default (some models reject any other value).
 */
export class FoundryOpenAILlmProvider implements LlmProvider {
  constructor(
    private endpoint: string,
    private apiKey: string,
    readonly model: string,
    private opts: { maxRetries: number; timeoutMs: number },
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const base = this.endpoint.replace(/\/+$/, "").replace(/\/openai(\/v1)?$/, "");
    const url = `${base}/openai/v1/chat/completions`;
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: Math.max(req.maxTokens, 4000),
    });
    const started = Date.now();
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": this.apiKey },
        body,
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      }).catch((err: unknown) => err as Error);

      if (res instanceof Response && res.ok) {
        const json = (await res.json()) as {
          choices?: { message?: { content?: string | null } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
        };
        const text = json.choices?.[0]?.message?.content ?? "";
        const usage = {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
          cacheReadTokens: json.usage?.prompt_tokens_details?.cached_tokens,
        };
        // Token counts and latency only: never prompt or completion content.
        log.info("llm.call", { model: this.model, ...usage, ms: Date.now() - started, attempt });
        return { text, usage };
      }

      const status = res instanceof Response ? res.status : 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt > this.opts.maxRetries) throw new Error(`LLM request failed (${status || "network"})`);
      const retryAfter = res instanceof Response ? Number(res.headers.get("retry-after")) : NaN;
      await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 750 * 2 ** (attempt - 1)));
    }
  }
}

/**
 * Offline stand-in for the rerank model. Like a real model it only sees the prompt: it reads the
 * seeker and candidate blocks and ranks by text similarity, returning the same JSON contract.
 */
export class MockLlmProvider implements LlmProvider {
  readonly model = "mock-llm";
  async complete(req: LlmRequest): Promise<LlmResponse> {
    const seeker = /<seeker_profile>\n([\s\S]*?)\n<\/seeker_profile>/.exec(req.user)?.[1] ?? "{}";
    const candidates = JSON.parse(/<candidates>\n([\s\S]*?)\n<\/candidates>/.exec(req.user)?.[1] ?? "[]") as Array<{ id: string; [k: string]: unknown }>;
    const q = mockEmbed(seeker);
    const scored = candidates
      .map((c) => {
        const v = mockEmbed(JSON.stringify(c));
        return { c, sim: v.reduce((s, x, i) => s + x * q[i]!, 0) };
      })
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
    const ranked = scored.map(({ c, sim }, i) => ({
      id: c.id,
      score: Math.round(Math.max(40, Math.min(98, 60 + sim * 120 - i * 2))),
      why: `Their background in ${(c.functions as string[] | undefined)?.[0] ?? "this area"} lines up with what you are asking for.`,
    }));
    return { text: JSON.stringify({ ranked }), usage: { inputTokens: Math.ceil(req.user.length / 4), outputTokens: 200 } };
  }
}

export function llmProvider(): LlmProvider {
  const e = env();
  if (!e.AI_ENABLED) throw new Error("AI is disabled (AI_ENABLED=false)");
  if (e.MOCK_AI) return new MockLlmProvider();
  const opts = { maxRetries: 3, timeoutMs: 45_000 };
  return e.LLM_PROVIDER === "openai"
    ? new FoundryOpenAILlmProvider(e.FOUNDRY_ENDPOINT!, e.FOUNDRY_API_KEY!, e.LLM_DEPLOYMENT!, opts)
    : new FoundryLlmProvider(e.FOUNDRY_ENDPOINT!, e.FOUNDRY_API_KEY!, e.LLM_DEPLOYMENT!, opts);
}
