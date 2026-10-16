import { runHousekeeping } from "@/server/housekeeping";
import { authorizedBearer } from "@/server/jobs/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron calls this with GET and `Authorization: Bearer $CRON_SECRET`. It is a safety net only:
// nothing a user is waiting on depends on it.
export async function GET(req: Request) {
  if (!authorizedBearer(req)) return new Response("Unauthorized", { status: 401 });
  const report = await runHousekeeping();
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
