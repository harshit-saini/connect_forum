import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { RevealNumber } from "@/components/matches/reveal-number";
import { SeekerSafety } from "@/components/safety/seeker-safety";
import { Card } from "@/components/ui/card";
import type { GuideProfileData } from "@/schemas";
import { db } from "@/server/db/client";
import { connectionRequests, guideProfiles } from "@/server/db/schema";
import { guideDisplayName } from "@/lib/display";
import { publicGuide } from "@/server/matching/public";
import { phoneStatus } from "@/server/profile/phone";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "Connection" };
export const dynamic = "force-dynamic";

export default async function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireCompletedProfile();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [row] = await db()
    .select({ req: connectionRequests, data: guideProfiles.data })
    .from(connectionRequests)
    .innerJoin(guideProfiles, eq(guideProfiles.userId, connectionRequests.guideId))
    .where(and(eq(connectionRequests.id, id), eq(connectionRequests.seekerId, viewer.id)));
  if (!row) notFound();

  const hasPhone = row.req.status === "approved" && (await phoneStatus(db(), row.req.guideId)).has;
  const guide = publicGuide(row.data as unknown as GuideProfileData);
  const name = guideDisplayName(row.data as unknown as GuideProfileData);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">{name}</h1>
        <Link href="/seeker/connections" className="text-sm underline">All connections</Link>
      </div>
      <p className="text-muted">{guide.years} years of experience</p>

      {row.req.status !== "approved" ? (
        <Card>
          <p className="text-sm text-muted">This connection isn&apos;t available.</p>
        </Card>
      ) : hasPhone ? (
        <RevealNumber connectionId={row.req.id} />
      ) : (
        <Card className="space-y-1">
          <h2 className="text-xl font-semibold">Contact this Guide</h2>
          <p className="text-sm text-muted">This Guide didn&apos;t give a phone number, so you can&apos;t contact them directly. Their profile details are below and in the email we sent you.</p>
        </Card>
      )}

      {row.req.status === "approved" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Did {name} help?</h2>
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
      <SeekerSafety target={{ kind: "connection", id: row.req.id }} who={name} />
    </div>
  );
}
