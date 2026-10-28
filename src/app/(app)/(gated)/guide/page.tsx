import Link from "next/link";
import { and, count, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PauseToggle } from "@/components/guide/pause-toggle";
import { Card } from "@/components/ui/card";
import { db } from "@/server/db/client";
import { connectionRequests, guideProfiles } from "@/server/db/schema";
import { phoneStatus } from "@/server/profile/phone";
import { guideRatingSummary } from "@/server/ratings/service";
import { startOfMonthUtc } from "@/server/time";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "Guide dashboard" };
export const dynamic = "force-dynamic";

export default async function GuideDashboard() {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "guide") redirect("/dashboard");

  const [profile] = await db().select({ paused: guideProfiles.matchingPaused }).from(guideProfiles).where(eq(guideProfiles.userId, viewer.id));
  const monthStart = startOfMonthUtc();
  const [{ n: approved }] = await db().select({ n: count() }).from(connectionRequests).where(and(eq(connectionRequests.guideId, viewer.id), eq(connectionRequests.status, "approved"), gte(connectionRequests.approvedAt, monthStart)));
  const rating = await guideRatingSummary(viewer.id);
  const phone = await phoneStatus(db(), viewer.id);

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
          <p className="text-3xl font-semibold">{approved} <span className="text-base font-normal text-muted">new Seekers connected</span></p>
          <p className="text-sm text-muted">Pause matching below at any time if you need a break.</p>
        </Card>
      </div>

      <Card><PauseToggle paused={profile?.paused ?? false} /></Card>

      <Card className="space-y-1 text-sm">
        <h2 className="font-semibold">What happens when a Seeker connects</h2>
        <p className="text-muted">There is nothing to approve. When a Seeker presses “I want to connect”, they are emailed your public details: your role, years of experience, categories and how you can help. You get a short email saying someone connected, with their category and question. Seekers never share a name or contact details.</p>
        <p className="text-muted">
          {phone.has
            ? `Your phone number (ending ${phone.last4}) is emailed to every Seeker who connects with you. `
            : "You haven't added a phone number, so Seekers get only your profile details and can't contact you directly. "}
          To add, change or remove a number, <Link href="/profile/edit" className="underline">edit your profile</Link>. Removing it takes effect for future connections; emails already sent can&apos;t be recalled.
        </p>
      </Card>
    </div>
  );
}
