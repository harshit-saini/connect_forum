import Link from "next/link";
import { and, count, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PauseToggle } from "@/components/guide/pause-toggle";
import { Card } from "@/components/ui/card";
import type { GuideProfileData } from "@/schemas";
import { db } from "@/server/db/client";
import { connectionRequests } from "@/server/db/schema";
import { loadProfileState } from "@/server/profile/service";
import { guideRatingSummary } from "@/server/ratings/service";
import { startOfMonthUtc } from "@/server/time";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "Guide dashboard" };
export const dynamic = "force-dynamic";

export default async function GuideDashboard() {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "guide") redirect("/dashboard");

  const state = await loadProfileState(viewer.id, "guide");
  const a = (state.data as unknown as GuideProfileData).availability;
  const monthStart = startOfMonthUtc();
  const [{ n: approved }] = await db().select({ n: count() }).from(connectionRequests).where(and(eq(connectionRequests.guideId, viewer.id), eq(connectionRequests.status, "approved"), gte(connectionRequests.approvedAt, monthStart)));
  const rating = await guideRatingSummary(viewer.id);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">Guide dashboard</h1>
        <Link href="/profile" className="text-sm underline">My profile</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-1">
          <h2 className="text-sm font-medium text-muted">Your rating</h2>
          {rating.average !== null ? (
            <p className="text-3xl font-semibold" data-testid="guide-rating">★ {rating.average.toFixed(1)} <span className="text-base font-normal text-muted">from {rating.count} ratings</span></p>
          ) : (
            <>
              <p className="text-xl font-semibold" data-testid="guide-rating">Not shown yet</p>
              <p className="text-sm text-muted">Your average appears after {rating.needed} more rating{rating.needed === 1 ? "" : "s"}, so no one can tell who rated you. Individual reviews are never shown to you.</p>
            </>
          )}
        </Card>
        <Card className="space-y-1">
          <h2 className="text-sm font-medium text-muted">This month</h2>
          <p className="text-3xl font-semibold">{approved} <span className="text-base font-normal text-muted">of {a.maxNewSeekersPerMonth} new Seekers</span></p>
          <p className="text-sm text-muted">You can change this limit in your <Link href="/profile/edit/availability" className="underline">availability settings</Link>.</p>
        </Card>
      </div>

      <Card><PauseToggle paused={a.pauseMatching} /></Card>

      <Card className="space-y-1 text-sm">
        <h2 className="font-semibold">How requests reach you</h2>
        <p className="text-muted">When a Seeker asks to connect, you receive an email with a private link to approve or decline. No login is needed, and your number is shown only to Seekers you approve.</p>
      </Card>
    </div>
  );
}
