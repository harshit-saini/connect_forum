import { forbidden, sameOrigin } from "@/server/http";
import { z } from "zod";
import { createRequest } from "@/server/connections/service";
import { kickWorker } from "@/server/jobs/kick";
import { rateLimit, tooManyRequests } from "@/server/ratelimit";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

const body = z.object({ matchId: z.uuid(), note: z.string().max(1000).optional() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const viewer = await getViewer();
  if (!viewer || viewer.suspended) return Response.json({ error: "Not signed in" }, { status: 401, headers: noStore });
  if (viewer.role !== "seeker" || !viewer.profileCompleted) return Response.json({ error: "Only Seekers can send requests" }, { status: 403, headers: noStore });

  const limited = await rateLimit(`connect:${viewer.id}`, 20, 3600);
  if (!limited.allowed) return tooManyRequests(limited);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400, headers: noStore });

  const result = await createRequest({ seekerId: viewer.id, ...parsed.data });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "note" ? 422 : 409;
    return Response.json({ error: result.message, code: result.code }, { status, headers: noStore });
  }
  kickWorker();
  return Response.json({ requestId: result.requestId }, { status: 201, headers: noStore });
}
