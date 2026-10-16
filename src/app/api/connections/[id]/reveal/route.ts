import { forbidden, sameOrigin } from "@/server/http";
import { z } from "zod";
import { revealNumber } from "@/server/connections/reveal";
import { rateLimit, tooManyRequests } from "@/server/ratelimit";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

// The response carries a phone number: it must never be stored by any cache, browser, proxy or service worker.
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate, private", Pragma: "no-cache", Expires: "0", "X-Robots-Tag": "noindex" };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbidden();
  const viewer = await getViewer();
  if (!viewer || viewer.suspended || viewer.role !== "seeker") return Response.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404, headers: NO_STORE });

  const perUser = await rateLimit(`reveal:${viewer.id}`, 10, 3600);
  const perConnection = await rateLimit(`reveal_conn:${id}`, 6, 3600);
  if (!perUser.allowed || !perConnection.allowed) return tooManyRequests(perUser.allowed ? perConnection : perUser, "You've viewed this number several times. Please try again later.");

  const result = await revealNumber({ seekerId: viewer.id, connectionId: id });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : 403;
    const error = result.code === "unavailable" ? "This Guide's number is no longer available." : result.code === "not_approved" ? "This request hasn't been approved." : "Not found";
    return Response.json({ error }, { status, headers: NO_STORE });
  }
  return Response.json({ phone: result.phone, contactPreference: result.contactPreference, bestTime: result.bestTime }, { headers: NO_STORE });
}
