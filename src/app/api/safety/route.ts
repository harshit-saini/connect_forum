import { z } from "zod";
import { rateLimit, tooManyRequests } from "@/server/ratelimit";
import { applySafetyAction, resolveSeekerTarget, safetyInput } from "@/server/safety/service";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

const body = safetyInput.extend({ target: z.object({ kind: z.enum(["match", "connection"]), id: z.uuid() }) });

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.suspended || viewer.role !== "seeker") return Response.json({ error: "Not signed in" }, { status: 401, headers: noStore });

  const limited = await rateLimit(`safety:${viewer.id}`, 10, 3600);
  if (!limited.allowed) return tooManyRequests(limited);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400, headers: noStore });

  const otherId = await resolveSeekerTarget(viewer.id, parsed.data.target);
  if (!otherId) return Response.json({ error: "Not found" }, { status: 404, headers: noStore });

  const result = await applySafetyAction({ actorId: viewer.id, otherId, input: parsed.data });
  if (!result.ok) return Response.json({ error: result.message }, { status: 422, headers: noStore });
  return Response.json({ ok: true }, { headers: noStore });
}
