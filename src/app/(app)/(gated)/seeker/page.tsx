import { requireCompletedProfile } from "@/server/viewer";
import { redirect } from "next/navigation";

export const metadata = { title: "Seeker dashboard" };

export default async function Page() {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "seeker") redirect("/dashboard");
  return <h1 className="text-3xl font-semibold">Seeker dashboard</h1>;
}
