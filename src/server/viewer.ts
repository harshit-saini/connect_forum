import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { guideProfiles, seekerProfiles, userRoles } from "@/server/db/schema";
import { env } from "@/server/env";

export type Role = "seeker" | "guide";

export type Viewer = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: Role | null;
  isAdmin: boolean;
  suspended: boolean;
  profileCompleted: boolean;
  profileVersion: number;
};

/** The signed-in user with role and profile status, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as typeof session.user & { suspendedAt?: Date | null; deletedAt?: Date | null };
  if (user.deletedAt) return null;

  const [roleRow] = await db().select().from(userRoles).where(eq(userRoles.userId, user.id)).limit(1);
  const role = roleRow?.role ?? null;
  let profile: { profileCompletedAt: Date | null; profileVersion: number } | undefined;
  if (role) {
    const table = role === "seeker" ? seekerProfiles : guideProfiles;
    [profile] = await db().select().from(table).where(eq(table.userId, user.id)).limit(1);
  }
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role,
    isAdmin: user.emailVerified && env().ADMIN_EMAILS.includes(user.email.toLowerCase()),
    suspended: Boolean(user.suspendedAt),
    profileCompleted: Boolean(profile?.profileCompletedAt),
    profileVersion: profile?.profileVersion ?? 0,
  };
});

/** Requires a signed-in, non-suspended user. */
export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/sign-in");
  if (v.suspended) redirect("/suspended");
  return v;
}

/** Requires a viewer who has picked a role. */
export async function requireRole(): Promise<Viewer & { role: Role }> {
  const v = await requireViewer();
  if (!v.role) redirect("/choose-role");
  return v as Viewer & { role: Role };
}

/** The onboarding gate: everything outside /onboarding, /settings and sign-out needs a completed profile. */
export async function requireCompletedProfile(): Promise<Viewer & { role: Role }> {
  const v = await requireRole();
  if (!v.profileCompleted) redirect("/onboarding");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isAdmin) redirect("/");
  return v;
}

export function dashboardPath(role: Role | null) {
  return role === "guide" ? "/guide" : role === "seeker" ? "/seeker" : "/choose-role";
}
