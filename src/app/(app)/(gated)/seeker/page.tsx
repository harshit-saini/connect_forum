import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { FaqGate } from "@/components/faq/faq-gate";
import { FindGuides } from "@/components/matches/find-guides";
import { FAQS } from "@/config/faqs";
import { CATEGORIES, labelOf } from "@/config/taxonomy";
import { db } from "@/server/db/client";
import { seekerProfiles } from "@/server/db/schema";
import { getRunView, latestRunId } from "@/server/matching/view";
import { requireCompletedProfile } from "@/server/viewer";

export const metadata = { title: "Seeker dashboard" };

export default async function SeekerDashboard() {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "seeker") redirect("/dashboard");
  const runId = await latestRunId(viewer.id);
  const initial = runId ? await getRunView(runId, viewer.id) : null;
  const [profile] = await db().select({ category: seekerProfiles.category }).from(seekerProfiles).where(eq(seekerProfiles.userId, viewer.id));
  const category = CATEGORIES.find((c) => c.value === profile?.category);
  const finder = <FindGuides initial={initial} />;
  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">Seeker dashboard</h1>
        <nav aria-label="Seeker" className="flex gap-4 text-sm"><Link href="/seeker/connections" className="underline">My requests</Link><Link href="/profile" className="underline">My profile</Link></nav>
      </div>
      {/* Seekers who haven't searched yet see the FAQs for their category first. */}
      {category && !initial ? (
        <FaqGate categoryLabel={labelOf(CATEGORIES, category.value)} faqs={FAQS[category.value]}>{finder}</FaqGate>
      ) : (
        finder
      )}
    </div>
  );
}
