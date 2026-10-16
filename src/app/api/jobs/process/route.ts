import { authorizedBearer } from "@/server/jobs/auth";
import { processJobs } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!authorizedBearer(req)) return new Response("Unauthorized", { status: 401 });
  const processed = await processJobs({ maxMs: 50_000 });
  return Response.json({ processed }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = handle;
export const GET = handle;
