import "server-only";
import { env } from "@/server/env";

/**
 * Defence in depth for cookie-authenticated, state-changing route handlers (on top of SameSite=Lax):
 * when the browser sends an Origin header it must be this app's own origin.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser callers and same-origin GET-style requests omit it
  try {
    return new URL(origin).origin === new URL(env().APP_URL).origin;
  } catch {
    return false;
  }
}

export const forbidden = () => Response.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
