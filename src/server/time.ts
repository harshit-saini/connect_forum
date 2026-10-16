import "server-only";

/** First instant of the current calendar month, UTC. Used for monthly Guide capacity. */
export function startOfMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
