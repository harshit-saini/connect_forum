"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // The emailed link carries the address and code in the URL fragment (never sent to a server).
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const e = params.get("email");
    const c = params.get("code");
    if (e && c) {
      // One-time sync from the URL fragment, which does not exist during SSR.
      /* eslint-disable react-hooks/set-state-in-effect */
      setEmail(e);
      setCode(c);
      setStep("code");
      /* eslint-enable react-hooks/set-state-in-effect */
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: "sign-in" });
    setBusy(false);
    if (error) return setError(error.status === 429 ? "Too many attempts. Please wait a few minutes." : "Could not send the code. Check the address and try again.");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: code.trim() });
    if (error) {
      setBusy(false);
      return setError(error.status === 429 ? "Too many attempts. Please wait a few minutes." : "That code is invalid or has expired.");
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold">{step === "email" ? "Sign in or create an account" : "Check your email"}</h1>
      <p className="mt-1 text-sm text-muted">
        {step === "email"
          ? "We'll email you a one-time code. No password needed."
          : `We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
      </p>

      <div aria-live="polite" className="mt-4">
        {error && <Alert tone="error">{error}</Alert>}
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Email me a code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="code">6-digit code</Label>
            <Input id="code" ref={codeRef} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="123456" className="text-center text-2xl tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
          <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
            {busy ? "Verifying…" : "Sign in"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("email"); setCode(""); setError(null); }}>
            Use a different email
          </Button>
        </form>
      )}
      <p className="mt-4 text-xs text-muted">By continuing you agree to the Terms and Privacy policy.</p>
    </Card>
  );
}
