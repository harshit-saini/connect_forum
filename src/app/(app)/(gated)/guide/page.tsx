import { requireCompletedProfile } from "@/server/viewer";
import { redirect } from "next/navigation";

export const metadata = { title: "Guide dashboard" };

export default async function Page() {
  const viewer = await requireCompletedProfile();
  if (viewer.role !== "guide") redirect("/dashboard");
  return <h1 className="text-3xl font-semibold">Guide dashboard</h1>;
}
