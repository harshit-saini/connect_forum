"use client";
import { useRouter } from "next/navigation";
import { StepForm } from "@/components/wizard/step-form";
import type { Role, StepKey } from "@/schemas";

export function EditStep({ role, step, data, phone }: { role: Role; step: Exclude<StepKey, "review">; data: Record<string, unknown>; phone: { has: boolean; last4: string | null } }) {
  const router = useRouter();
  return (
    <StepForm
      role={role}
      step={step}
      initial={(data[step] as Record<string, unknown>) ?? {}}
      completed
      phone={phone}
      defaultCountry={String((data.basics as { country?: string } | undefined)?.country ?? "IN")}
      submitLabel="Save changes"
      onBack={() => router.push("/profile")}
      onSaved={() => {
        router.push("/profile");
        router.refresh();
      }}
    />
  );
}
