import { rateLimit, tooManyRequests } from "@/server/ratelimit";
import { kickWorker } from "@/server/jobs/kick";
import { startRun } from "@/server/matching/pipeline";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST() {
  const viewer = await getViewer();
  if (!viewer || viewer.suspended) return Response.json({ error: "Not signed in" }, { status: 401, headers: noStore });
  if (viewer.role !== "seeker" || !viewer.profileCompleted) {
    return Response.json({ error: "Only Seekers with a completed profile can search" }, { status: 403, headers: noStore });
  }

  // Abuse guard on top of the per-day product limits.
  const limited = await rateLimit(`matches_start:${viewer.id}`, 20, 3600);
  if (!limited.allowed) return tooManyRequests(limited);

  const result = await startRun(viewer.id, viewer.profileVersion);
  switch (result.kind) {
    case "started":
      kickWorker();
      return Response.json({ runId: result.runId, degraded: result.degraded }, { status: 202, headers: noStore });
    case "active":
      kickWorker();
      return Response.json({ runId: result.runId, alreadyRunning: true }, { headers: noStore });
    case "cached":
      return Response.json({ runId: result.runId, cached: true, message: result.message }, { headers: noStore });
    case "blocked":
      return Response.json({ error: result.message, reason: result.reason, retryAfterSeconds: result.retryAfterSeconds }, { status: 429, headers: { ...noStore, "Retry-After": String(result.retryAfterSeconds) } });
  }
}
