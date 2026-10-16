import { describe, expect, it, vi } from "vitest";
import { retryingPool, withDbRetry } from "@/server/db/client";

const fast = () => vi.useFakeTimers({ shouldAdvanceTime: true });

describe("database cold-start retries", () => {
  it("withDbRetry retries transient errors with backoff and then succeeds", async () => {
    fast();
    const fn = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET")).mockRejectedValueOnce(new Error("Connection terminated unexpectedly")).mockResolvedValue("ok");
    const p = withDbRetry(fn);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("gives up after the attempt limit and does not retry unrelated errors", async () => {
    fast();
    const down = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const p = withDbRetry(down, 3);
    const assertion = expect(p).rejects.toThrow("ECONNREFUSED");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(down).toHaveBeenCalledTimes(3);
    const syntax = vi.fn().mockRejectedValue(new Error('syntax error at or near "selec"'));
    await expect(withDbRetry(syntax)).rejects.toThrow("syntax error");
    expect(syntax).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("the pool retries establishing a connection", async () => {
    fast();
    const connect = vi.fn().mockRejectedValueOnce(new Error("Connection terminated unexpectedly")).mockResolvedValue({ release() {} });
    const pool = retryingPool({ connect, query: vi.fn() } as never);
    const p = (pool as unknown as { connect: () => Promise<unknown> }).connect();
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(connect).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("queries are retried only when nothing could have reached the server, never after a mid-statement drop", async () => {
    fast();
    const q = vi.fn().mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.1:5432")).mockResolvedValue({ rows: [] });
    const pool = retryingPool({ connect: vi.fn(), query: q } as never) as unknown as { query: (t: string) => Promise<unknown> };
    const p = pool.query("insert into t values (1)");
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(q).toHaveBeenCalledTimes(2);

    const dropped = vi.fn().mockRejectedValue(new Error("Connection terminated unexpectedly"));
    const pool2 = retryingPool({ connect: vi.fn(), query: dropped } as never) as unknown as { query: (t: string) => Promise<unknown> };
    await expect(pool2.query("insert into t values (1)")).rejects.toThrow("Connection terminated unexpectedly");
    expect(dropped).toHaveBeenCalledTimes(1); // a write that may have been applied is never re-sent
    vi.useRealTimers();
  });
});
