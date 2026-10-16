import "server-only";
import { headers } from "next/headers";

/** Best-effort client address for rate limiting (Vercel sets x-forwarded-for). Never stored or logged. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "unknown";
}
