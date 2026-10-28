"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Signs out, then refreshes the router so no signed-in page lingers in its cache. */
export function SignOutButton({ className = "hover:underline" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          const { error } = await authClient.signOut().catch(() => ({ error: true as const }));
          if (error) {
            setBusy(false);
            setError(true);
            return;
          }
          router.replace("/");
          router.refresh();
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <span role="alert" className="text-xs text-danger">Couldn&apos;t sign out. Try again.</span>}
    </span>
  );
}
