import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { RevealNumber } from "@/components/matches/reveal-number";
import { SeekerSafety } from "@/components/safety/seeker-safety";
import { Card } from "@/components/ui/card";
import type { GuideProfileData } from "@/schemas";
import { db } from "@/server/db/client";
import { connectionRequests, guideProfiles, userAliases } from "@/server/db/schema";
import { publicGuide } from "@/server/matching/public";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "Connection" };
export const dynamic = "force-dynamic";

export default async function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireCompletedProfile();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [row] = await db()
    .select({ req: connectionRequests, alias: userAliases.alias, data: guideProfiles.data })
    .from(connectionRequests)
    .innerJoin(userAliases, eq(userAliases.userId, connectionRequests.guideId))
    .innerJoin(guideProfiles, eq(guideProfiles.userId, connectionRequests.guideId))
    .where(and(eq(connectionRequests.id, id), eq(connectionRequests.seekerId, viewer.id)));
  if (!row) notFound();

  const guide = publicGuide(row.data as unknown as GuideProfileData);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">{row.alias}</h1>
        <Link href="/seeker/connections" className="text-sm underline">All requests</Link>
      </div>
      <p className="text-muted">{guide.title} · {guide.years} yrs</p>

      {row.req.status === "approved" ? (
        <RevealNumber connectionId={row.req.id} />
      ) : (
        <Card>
          <p className="text-sm text-muted">This request is {row.req.status}. A number is only shown for approved requests.</p>
        </Card>
      )}

      {row.req.status === "approved" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Spoke with {row.alias}?</h2>
            <p className="text-sm text-muted">Rate your experience. It helps other Seekers.</p>
          </div>
          <Link href={`/seeker/rate/${row.req.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent">Rate this Guide</Link>
        </Card>
      )}

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">About this Guide</h2>
        <p className="whitespace-pre-line">{guide.about}</p>
        <p className="text-muted">Can help with: {guide.categories.join(", ")}</p>
      </Card>
      <SeekerSafety target={{ kind: "connection", id: row.req.id }} who={row.alias} />
    </div>
  );
}
