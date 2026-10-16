import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { db } from "@/server/db/client";
import { connectionRequests, userAliases } from "@/server/db/schema";
import { getOwnRating, RATING_EDIT_DAYS } from "@/server/ratings/service";
import { requireCompletedProfile } from "@/server/viewer";
import { RatingForm } from "./rating-form";

export const metadata = { title: "Rate your Guide" };
export const dynamic = "force-dynamic";

export default async function RatePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireCompletedProfile();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [row] = await db()
    .select({ status: connectionRequests.status, alias: userAliases.alias })
    .from(connectionRequests)
    .innerJoin(userAliases, eq(userAliases.userId, connectionRequests.guideId))
    .where(and(eq(connectionRequests.id, id), eq(connectionRequests.seekerId, viewer.id)));
  if (!row) notFound();

  const own = await getOwnRating(viewer.id, id);
  const locked = own?.locked ?? false;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">How was {row.alias}?</h1>
        <p className="mt-1 text-muted">Your rating and review are private. The Guide only ever sees an average, and only once they have at least 3 ratings.</p>
      </div>
      {row.status !== "approved" ? (
        <Card><p className="text-sm text-muted">You can rate a Guide once they have approved your request.</p></Card>
      ) : (
        <Card className="space-y-3">
          {own && <p className="text-sm text-muted">{locked ? "This rating can no longer be changed." : `You can change this until ${own.editableUntil.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} (${RATING_EDIT_DAYS} days after you gave it).`}</p>}
          <RatingForm connectionId={id} initialScore={own?.score} initialReview={own?.review ?? ""} locked={locked} />
        </Card>
      )}
      <Link href={`/seeker/connections/${id}`} className="text-sm underline">Back to the connection</Link>
    </div>
  );
}
