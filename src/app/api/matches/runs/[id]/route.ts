import { z } from "zod";
import { getRunView } from "@/server/matching/view";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer || viewer.suspended || viewer.role !== "seeker") {
    return Response.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const view = await getRunView(id, viewer.id);
  if (!view) return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
