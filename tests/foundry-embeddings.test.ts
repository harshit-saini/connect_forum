import { afterEach, describe, expect, it, vi } from "vitest";
import { FoundryEmbeddingProvider } from "@/server/ai/embeddings";

const vec = (n = 1536) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
const ok = (vectors: number[][]) =>
  new Response(JSON.stringify({ data: vectors.map((embedding, index) => ({ index, embedding })), usage: { total_tokens: 7 } }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("FoundryEmbeddingProvider", () => {
  const provider = () => new FoundryEmbeddingProvider("https://res.openai.azure.com/", "secret-key", "my-embedding-deployment");

  it("posts to the v1 embeddings route with api-key auth and the deployment as model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([vec(), vec()]));
    vi.stubGlobal("fetch", fetchMock);
    const out = await provider().embed(["a", "b"]);
    expect(out).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://res.openai.azure.com/openai/v1/embeddings");
    expect(init.headers["api-key"]).toBe("secret-key");
    expect(JSON.parse(init.body)).toEqual({ model: "my-embedding-deployment", input: ["a", "b"], dimensions: 1536 });
  });

  it("retries a 429 and then succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("slow down", { status: 429 })).mockResolvedValueOnce(ok([vec()]));
    vi.stubGlobal("fetch", fetchMock);
    const p = provider().embed(["a"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry a 401 and never leaks the key in the error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().embed(["a"])).rejects.toThrow("Embedding request failed (401)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects vectors of the wrong dimension", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([vec(768)])));
    await expect(provider().embed(["a"])).rejects.toThrow(/1536/);
  });
});
