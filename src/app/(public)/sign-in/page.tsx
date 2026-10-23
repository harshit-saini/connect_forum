import { redirect } from "next/navigation";
import { getViewer, dashboardPath } from "@/server/viewer";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const viewer = await getViewer();
  const { next } = await searchParams;
  // Only same-site relative paths are accepted as a post-login target.
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  // A signed-in visitor goes where the link they used points (e.g. /join/guide), else to their dashboard.
  if (viewer) redirect(target ?? dashboardPath(viewer.role));
  return (
    <div className="mx-auto max-w-md pt-10">
      <SignInForm next={target ?? "/dashboard"} />
    </div>
  );
}
