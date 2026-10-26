import "server-only";
import { createHash } from "node:crypto";
import { EMBEDDING_DIMENSIONS } from "@/server/db/schema";
import { env } from "@/server/env";
import { log } from "@/server/logging/logger";

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have i if in into is it its my of on or so that the their there this to was we were will with you your me am been being do does did not no".split(" "),
);

function l2(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/**
 * Offline embedding: signed feature hashing of words and word pairs into a fixed-size vector. Texts
 * that share vocabulary get a higher cosine similarity, so local matching behaves sensibly without keys.
 */
export function mockEmbed(text: string, dimension = EMBEDDING_DIMENSIONS): number[] {
  const v = new Array<number>(dimension).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9+#]+/g)?.filter((w) => w.length > 1 && !STOPWORDS.has(w)) ?? [];
  const add = (feature: string, weight: number) => {
    const h = createHash("sha256").update(feature).digest();
    v[h.readUInt32BE(0) % dimension]! += (h[4]! & 1 ? 1 : -1) * weight;
  };
  words.forEach((w, i) => {
    add(w, 1);
    if (i > 0) add(`${words[i - 1]} ${w}`, 0.5);
  });
  return l2(v);
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly model = "mock-hash-embedding";
  readonly dimension = EMBEDDING_DIMENSIONS;
  async embed(texts: string[]) {
    return texts.map((t) => mockEmbed(t));
  }
}

/**
 * Azure AI Foundry / Azure OpenAI embeddings via the OpenAI-compatible v1 route:
 *   POST {EMBEDDING_ENDPOINT}/openai/v1/embeddings   (header `api-key`, body { model: <deployment>, input })
 * `EMBEDDING_DEPLOYMENT` is the deployment name. See the README for how to verify against your resource.
 */
export class FoundryEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = EMBEDDING_DIMENSIONS;
  constructor(
    private endpoint: string,
    private apiKey: string,
    readonly model: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.endpoint.replace(/\/+$/, "")}/openai/v1/embeddings`;
    const started = Date.now();
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": this.apiKey },
        body: JSON.stringify({ model: this.model, input: texts, dimensions: this.dimension }),
        signal: AbortSignal.timeout(20_000),
      }).catch((err: unknown) => err as Error);

      if (res instanceof Response && res.ok) {
        const json = (await res.json()) as { data: { index: number; embedding: number[] }[]; usage?: { total_tokens?: number } };
        const out = [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
        if (out.length !== texts.length || out.some((e) => e.length !== this.dimension)) {
          throw new Error(`Embedding response has unexpected shape (expected ${this.dimension} dimensions)`);
        }
        log.info("embedding.call", { model: this.model, inputs: texts.length, tokens: json.usage?.total_tokens, ms: Date.now() - started });
        return out;
      }
      const retryable = !(res instanceof Response) || res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 3) {
        const status = res instanceof Response ? res.status : "network";
        throw new Error(`Embedding request failed (${status})`);
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

export function embeddingProvider(): EmbeddingProvider {
  if (!env().AI_ENABLED) throw new Error("AI is disabled (AI_ENABLED=false)");
  const e = env();
  if (e.MOCK_AI) return new MockEmbeddingProvider();
  return new FoundryEmbeddingProvider(e.EMBEDDING_ENDPOINT!, e.EMBEDDING_API_KEY!, e.EMBEDDING_DEPLOYMENT);
}
