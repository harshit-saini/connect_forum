"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormProvider, useForm, type FieldValues, type Resolver } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PhoneField } from "@/components/form/special";
import { normalizeEmpty, stepSchema, STEP_TITLES, type Role, type StepKey } from "@/schemas";
import { autosaveAction, saveStepAction } from "@/server/actions/profile";
import {
  AvailabilityStep,
  BackgroundStep,
  BasicsStep,
  ExpertiseStep,
  GoalsStep,
  PreferencesStep,
} from "./steps";

type DataStep = Exclude<StepKey, "review">;

function defaultsFor(step: DataStep, initial: Record<string, unknown>): FieldValues {
  const base: Record<DataStep, FieldValues> = {
    basics: { languages: [], consents: { terms: false, privacy: false, aiProcessing: false } },
    background: { skills: [], timeline: [], excludedCompanies: [] },
    goals: { targetRoles: [""], targetIndustries: [], helpNeeded: [], questions: [] },
    preferences: {
      preferredGuideIndustries: [],
      preferredGuideFunctions: [],
      minGuideExperience: "0",
      mustShareLanguage: true,
      similarTransition: false,
      availability: [],
    },
    expertise: {
      primaryFunctions: [],
      primaryIndustries: [],
      help: [],
      stagesBestAt: [],
      transitions: [],
      wontHelpWith: { types: [] },
    },
    availability: { availability: [], pauseMatching: false, acknowledgement: false },
  };
  return { ...base[step], ...initial };
}

export function StepForm({
  role,
  step,
  initial,
  completed,
  phone,
  defaultCountry,
  submitLabel,
  onSaved,
  onBack,
}: {
  role: Role;
  step: DataStep;
  initial: Record<string, unknown>;
  completed: boolean;
  phone: { has: boolean; last4: string | null };
  defaultCountry: string;
  submitLabel: string;
  onSaved: () => void;
  onBack?: () => void;
}) {
  const schema = stepSchema(role, step);
  const form = useForm<FieldValues>({
    defaultValues: defaultsFor(step, initial),
    resolver: ((values, ctx, opts) =>
      zodResolver(schema as never)(normalizeEmpty(values), ctx, opts)) as Resolver<FieldValues>,
    mode: "onTouched",
  });
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Autosave drafts while onboarding. Completed profiles are saved only through the explicit button.
  useEffect(() => {
    if (completed) return;
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        clearTimeout(timer.current);
        setSaved("saving");
        timer.current = setTimeout(async () => {
          const res = await autosaveAction(step, values).catch(() => ({ ok: false }));
          setSaved(res.ok ? "saved" : "idle");
        }, 1200);
      },
    });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
  }, [form, step, completed]);

  function onSubmit(values: FieldValues) {
    setFormError(null);
    setPhoneError(undefined);
    start(async () => {
      const res = await saveStepAction(step, normalizeEmpty(values), phoneValue || undefined);
      if (res.ok) return onSaved();
      for (const [path, message] of Object.entries(res.fieldErrors)) {
        if (path === "phone") setPhoneError(message);
        else if (path === "_") setFormError(message);
        else form.setError(path, { message });
      }
      if (res.formError) setFormError(res.formError);
    });
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        <h2 className="text-xl font-semibold">{STEP_TITLES[step]}</h2>
        {step === "basics" && <BasicsStep />}
        {step === "background" && <BackgroundStep role={role} />}
        {step === "goals" && <GoalsStep />}
        {step === "preferences" && <PreferencesStep />}
        {step === "expertise" && <ExpertiseStep />}
        {step === "availability" && (
          <AvailabilityStep
            phoneField={
              <PhoneField
                last4={phone.last4}
                value={phoneValue}
                onChange={setPhoneValue}
                error={phoneError}
                defaultCountry={defaultCountry}
              />
            }
          />
        )}
        {formError && <Alert tone="error">{formError}</Alert>}
        {Object.keys(form.formState.errors).length > 0 && form.formState.isSubmitted && (
          <Alert tone="error">Please fix the highlighted fields.</Alert>
        )}
        <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
          {onBack && (
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
          )}
          <Button type="submit" disabled={pending} className="flex-1 sm:flex-none">
            {pending ? "Saving…" : submitLabel}
          </Button>
          {!completed && (
            <span className="text-xs text-muted" aria-live="polite">
              {saved === "saving" ? "Saving draft…" : saved === "saved" ? "Draft saved" : ""}
            </span>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
