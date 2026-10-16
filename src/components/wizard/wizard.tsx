"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { STEP_ORDER, STEP_TITLES, type GuideProfileData, type Role, type SeekerProfileData, type StepKey } from "@/schemas";
import { submitProfileAction } from "@/server/actions/profile";
import { AnonymousCard } from "./anonymous-card";
import { ProfileSummary } from "./profile-summary";
import { StepForm } from "./step-form";

type Data = Partial<SeekerProfileData> & Partial<GuideProfileData> & Record<string, Record<string, unknown>>;

export function Wizard({ role, step, data, phone }: { role: Role; step: StepKey; data: Record<string, unknown>; phone: { has: boolean; last4: string | null } }) {
  const router = useRouter();
  const order = STEP_ORDER[role];
  const index = order.indexOf(step);
  const go = (s: StepKey) => router.push(`/onboarding?step=${s}`);
  const percent = Math.round((index / (order.length - 1)) * 100);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <p className="font-medium">Step {index + 1} of {order.length}: {STEP_TITLES[step]}</p>
          <p className="text-muted">{percent}%</p>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Profile progress" className="mt-2 h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(percent, 6)}%` }} />
        </div>
        <ol className="mt-2 hidden gap-1 text-xs text-muted sm:flex">
          {order.map((s, i) => (
            <li key={s} className={i === index ? "font-semibold text-foreground" : ""}>{i > 0 && "· "}{STEP_TITLES[s]}</li>
          ))}
        </ol>
      </div>

      {step === "review" ? (
        <ReviewStep role={role} data={data as Data} phone={phone} onBack={() => go(order[index - 1]!)} onGoto={go} />
      ) : (
        <StepForm
          key={step}
          role={role}
          step={step}
          initial={(data[step] as Record<string, unknown>) ?? {}}
          completed={false}
          phone={phone}
          defaultCountry={String((data.basics as { country?: string } | undefined)?.country ?? "IN")}
          submitLabel="Save and continue"
          onBack={index > 0 ? () => go(order[index - 1]!) : undefined}
          onSaved={() => go(order[index + 1]!)}
        />
      )}
    </div>
  );
}

function ReviewStep({ role, data, phone, onBack, onGoto }: { role: Role; data: Data; phone: { has: boolean; last4: string | null }; onBack: () => void; onGoto: (s: StepKey) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ step: StepKey; message: string } | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await submitProfileAction();
      if (res && !res.ok) {
        const first = Object.values(res.fieldErrors)[0] ?? res.formError ?? "Something needs your attention.";
        setError({ step: res.step, message: `${STEP_TITLES[res.step]}: ${first}` });
      }
    });
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="preview">
        <h2 id="preview" className="text-xl font-semibold">What others will see</h2>
        <p className="mb-3 text-sm text-muted">This anonymous card is all {role === "seeker" ? "Guides" : "Seekers"} see. Your contact details and private answers stay hidden.</p>
        <AnonymousCard role={role} data={data} />
      </section>
      <section aria-labelledby="summary">
        <h2 id="summary" className="mb-3 text-xl font-semibold">Your answers</h2>
        <ProfileSummary role={role} data={data} phone={phone} editHref={(s) => `/onboarding?step=${s}`} />
      </section>
      {error && (
        <Alert tone="error">
          {error.message}{" "}
          <button type="button" className="font-medium underline" onClick={() => onGoto(error.step)}>Go to that step</button>
        </Alert>
      )}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="button" disabled={pending} onClick={submit} className="flex-1 sm:flex-none">{pending ? "Submitting…" : "Submit profile"}</Button>
      </div>
    </div>
  );
}
