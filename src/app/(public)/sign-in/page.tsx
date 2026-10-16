import { redirect } from "next/navigation";
import { getViewer, dashboardPath } from "@/server/viewer";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const viewer = await getViewer();
  if (viewer) redirect(dashboardPath(viewer.role));
  const { next } = await searchParams;
  // Only same-site relative paths are accepted as a post-login target.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return (
    <div className="mx-auto max-w-md pt-10">
      <SignInForm next={safeNext} />
    </div>
  );
}
