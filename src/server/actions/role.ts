"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db/client";
import { guideProfiles, seekerProfiles, userRoles } from "@/server/db/schema";
import { requireViewer } from "@/server/viewer";

const input = z.object({ role: z.enum(["seeker", "guide"]) });

/** First sign-in only: the role is permanent for now. Creates the empty profile row. */
export async function chooseRole(formData: FormData) {
  const viewer = await requireViewer();
  const { role } = input.parse({ role: formData.get("role") });
  if (!viewer.role) {
    await db().transaction(async (tx) => {
      const existing = await tx.select().from(userRoles).where(eq(userRoles.userId, viewer.id));
      if (existing.length > 0) return;
      await tx.insert(userRoles).values({ userId: viewer.id, role });
      await tx.insert(role === "seeker" ? seekerProfiles : guideProfiles).values({ userId: viewer.id }).onConflictDoNothing();
    });
  }
  redirect("/onboarding");
}
