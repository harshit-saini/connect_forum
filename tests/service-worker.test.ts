import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/** Loads public/sw.js into a sandbox with fake browser globals and returns its listeners. */
function loadWorker() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (r: Request | string) => store.get(typeof r === "string" ? new URL(r, "https://app.test").pathname : new URL(r.url).pathname),
        put: async (r: Request, res: Response) => void store.set(new URL(r.url).pathname, res),
        addAll: async (urls: string[]) => urls.forEach((u) => store.set(u, new Response(`precached ${u}`))),
      };
    },
    match: async (path: string) => {
      for (const s of stores.values()) if (s.has(path)) return s.get(path);
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (k: string) => stores.delete(k),
  };
  const fetchMock = vi.fn<(r: Request) => Promise<Response>>();
  const self = {
    __SW_TEST__: {} as { classify?: (m: string, p: string, mode: string) => string },
    location: { origin: "https://app.test" },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, fn: (e: unknown) => void) => void (listeners[type] = fn),
  };
  new Function("self", "caches", "fetch", "URL", readFileSync("public/sw.js", "utf8"))(self, caches, fetchMock, URL);
  const dispatchFetch = (request: Request) => {
    let responded: Promise<Response> | null = null;
    listeners.fetch!({ request, respondWith: (p: Promise<Response>) => (responded = p) });
    return responded as Promise<Response> | null;
  };
  return { self, listeners, stores, caches, fetchMock, dispatchFetch };
}

const req = (path: string, init: RequestInit & { mode?: RequestMode } = {}) => {
  const { mode, ...rest } = init;
  const r = new Request(`https://app.test${path}`, rest); // the constructor rejects mode "navigate"; browsers set it themselves
  Object.defineProperty(r, "mode", { value: mode ?? "cors" });
  return r;
};

describe("service worker routing", () => {
  const { self } = loadWorker();
  const classify = self.__SW_TEST__.classify!;

  it("caches only immutable static assets and the offline page", () => {
    expect(classify("GET", "/_next/static/chunks/app.js", "no-cors")).toBe("static");
    expect(classify("GET", "/icons/icon-192.png", "no-cors")).toBe("static");
    expect(classify("GET", "/offline.html", "same-origin")).toBe("static");
  });

  it("never treats API, auth or phone-number pages as cacheable", () => {
    for (const path of ["/api/connections/abc/reveal", "/api/matches/start", "/api/auth/get-session", "/sign-in", "/seeker/connections/abc", "/seeker/rate/abc", "/onboarding", "/profile", "/settings", "/admin/users", "/seeker", "/guide", "/"]) {
      for (const mode of ["cors", "same-origin", "no-cors", "navigate"]) expect(classify("GET", path, mode), `${path} ${mode}`).not.toBe("static");
      expect(classify("GET", path, "cors"), `${path} data fetch`).toBe("pass");
    }
  });

  it("never intercepts writes", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect(classify(method, "/_next/static/x.js", "cors")).toBe("pass");
  });

  it("falls back to offline only for page navigations", () => {
    expect(classify("GET", "/seeker", "navigate")).toBe("navigate");
    expect(classify("GET", "/seeker/connections/abc", "navigate")).toBe("navigate");
    expect(classify("GET", "/anything", "cors")).toBe("pass");
  });

  it("does not let a crafted path reach the static rules", () => {
    for (const path of ["/api/x/_next/static/a.js", "/seeker/connections/_next/static/a.js", "//evil.test/_next/static/a.js"]) {
      expect(classify("GET", path, "cors"), path).toBe("pass");
    }
  });
});

describe("service worker behaviour", () => {
  it("precaches the offline page on install", async () => {
    const w = loadWorker();
    let done: Promise<unknown> = Promise.resolve();
    w.listeners.install!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(w.stores.get("connect-static-v1")?.has("/offline.html")).toBe(true);
  });

  it("does not respond to API or auth requests at all (so nothing is stored)", () => {
    const w = loadWorker();
    expect(w.dispatchFetch(req("/api/connections/x/reveal", { method: "POST" }))).toBeNull();
    expect(w.dispatchFetch(req("/api/matches/runs/abc"))).toBeNull();
    expect(w.dispatchFetch(req("/api/auth/get-session"))).toBeNull();
    expect(w.fetchMock).not.toHaveBeenCalled();
    expect(w.stores.size).toBe(0);
  });

  it("ignores cross-origin requests", () => {
    const w = loadWorker();
    expect(w.dispatchFetch(new Request("https://elsewhere.test/_next/static/a.js"))).toBeNull();
  });

  it("serves the offline page when a navigation fails, and never stores the page", async () => {
    const w = loadWorker();
    w.stores.set("connect-static-v1", new Map([["/offline.html", new Response("OFFLINE PAGE")]]));
    w.fetchMock.mockRejectedValue(new TypeError("network down"));
    const res = await w.dispatchFetch(req("/seeker/connections/abc", { mode: "navigate" }));
    expect(await res!.text()).toBe("OFFLINE PAGE");

    w.fetchMock.mockResolvedValue(new Response("<html>private page</html>"));
    const online = await w.dispatchFetch(req("/seeker", { mode: "navigate" }));
    expect(await online!.text()).toContain("private page");
    expect([...w.stores.get("connect-static-v1")!.keys()]).toEqual(["/offline.html"]); // nothing new was cached
  });

  it("caches static assets on first use and serves them from cache afterwards", async () => {
    const w = loadWorker();
    const asset = new Response("console.log(1)", { status: 200, headers: { "content-type": "text/javascript" } });
    Object.defineProperty(asset, "type", { value: "basic" });
    w.fetchMock.mockResolvedValue(asset);
    await w.dispatchFetch(req("/_next/static/chunks/a.js", { mode: "no-cors" }));
    expect(w.stores.get("connect-static-v1")!.has("/_next/static/chunks/a.js")).toBe(true);
    w.fetchMock.mockClear();
    await w.dispatchFetch(req("/_next/static/chunks/a.js", { mode: "no-cors" }));
    expect(w.fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to cache a response marked no-store", async () => {
    const w = loadWorker();
    const res = new Response("x", { status: 200, headers: { "cache-control": "no-store" } });
    Object.defineProperty(res, "type", { value: "basic" });
    w.fetchMock.mockResolvedValue(res);
    await w.dispatchFetch(req("/icons/odd.png", { mode: "no-cors" }));
    expect(w.stores.get("connect-static-v1")?.has("/icons/odd.png") ?? false).toBe(false);
  });
});
