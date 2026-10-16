"use client";
import { useRouter } from "next/navigation";
import { SafetyDialog, type SafetyInput } from "./safety-dialog";

/** Report/block for a Seeker, pointing at one of their own matches or connections. */
export function SeekerSafety({ target, who, onDone }: { target: { kind: "match" | "connection"; id: string }; who: string; onDone?: () => void }) {
  const router = useRouter();
  async function submit(input: SafetyInput) {
    try {
      const res = await fetch("/api/safety", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, target }) });
      if (res.ok) return null;
      return ((await res.json()) as { error?: string }).error ?? "Something went wrong. Please try again.";
    } catch {
      return "We couldn't reach the server. Check your connection and try again.";
    }
  }
  return <SafetyDialog who={who} onSubmit={submit} onDone={() => (onDone ? onDone() : router.refresh())} />;
}
