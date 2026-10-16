import { buildExport, recordExport } from "@/server/account";
import { forbidden, sameOrigin } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/ratelimit";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

// POST (not GET) because exporting is recorded in the audit log and must not be triggered by a prefetch or a link.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const limited = await rateLimit(`export:${viewer.id}`, 5, 86_400);
  if (!limited.allowed) return tooManyRequests(limited, "You can export your data up to 5 times a day.");

  const data = await buildExport(viewer.id);
  if (!data) return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  await recordExport(viewer.id);

  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="connect-export-${day}.json"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
