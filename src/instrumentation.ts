export async function register() {
  // Fail fast on bad config at server start, but not during `next build`, which has no secrets.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { env } = await import("@/server/env");
    env();
  }
}
