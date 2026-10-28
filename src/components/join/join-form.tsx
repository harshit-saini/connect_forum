"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormProvider, useForm, type FieldValues, type Resolver } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxField, MultiCheckField, NumberField, RadioField, TextAreaField, TextField } from "@/components/form/controls";
import { AliasField, PhoneField } from "@/components/form/special";
import { CATEGORIES } from "@/config/taxonomy";
import { DEFAULT_COUNTRY } from "@/lib/countries";
import { formSchema, normalizeEmpty, type Role } from "@/schemas";
import { saveProfileAction } from "@/server/actions/profile";

/**
 * The single-page registration / edit form for both roles. A new member enters their member ID (checked
 * on the server against the allow-list); a registered member sees it read-only.
 */
export function JoinForm({
  role,
  initial,
  memberId,
  phone,
  aiProcessing,
}: {
  role: Role;
  initial: Record<string, unknown>;
  /** Set when editing: the ID already registered. */
  memberId: string | null;
  phone: { has: boolean; last4: string | null };
  /** Real AI_ENABLED: the consent text must describe what actually happens to the text. */
  aiProcessing: boolean;
}) {
  const editing = memberId !== null;
  const form = useForm<FieldValues>({
    defaultValues: {
      ...(role === "guide" ? { categories: [] } : {}),
      ...initial,
      memberId: memberId ?? "",
      agree: editing,
    },
    resolver: ((values, ctx, opts) => zodResolver(formSchema(role) as never)(normalizeEmpty(values), ctx, opts)) as Resolver<FieldValues>,
    mode: "onTouched",
  });
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneError, setPhoneError] = useState<string | undefined>();

  function onSubmit(values: FieldValues) {
    setFormError(null);
    setPhoneError(undefined);
    start(async () => {
      const res = await saveProfileAction(role, normalizeEmpty(values), phoneValue || undefined);
      // On success the action redirects to the dashboard, so only failures come back here.
      if (!res || res.ok) return;
      for (const [path, message] of Object.entries(res.fieldErrors)) {
        if (path === "phone") setPhoneError(message);
        else if (path === "_") setFormError(message);
        else form.setError(path, { message });
      }
    });
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        <TextField
          name="memberId"
          label="Member ID"
          hint={editing ? "Your ID can't be changed." : "The ID you were given as a member."}
          readOnly={editing}
          autoComplete="off"
          max={40}
        />
        <AliasField />

        {role === "seeker" ? (
          <>
            <RadioField name="category" label="What do you need help with?" options={CATEGORIES} />
            <TextAreaField
              name="query"
              label="Your question"
              hint="In a few sentences. Don't include names, phone numbers or emails."
              min={20}
              max={600}
              rows={4}
            />
          </>
        ) : (
          <>
            <MultiCheckField name="categories" label="Which categories can you help with?" options={CATEGORIES} />
            <TextField name="jobTitle" label="Your current or last role" max={80} placeholder="e.g. Senior HR Manager" />
            <TextAreaField
              name="about"
              label="How can you help?"
              hint="Two or three sentences. Your experience, and who you help best."
              min={30}
              max={500}
              rows={4}
            />
          </>
        )}

        <NumberField name="totalYears" label="Years of work experience" min={0} max={50} />

        {role === "guide" && (
          <>
            <PhoneField last4={phone.last4} value={phoneValue} onChange={setPhoneValue} error={phoneError} defaultCountry={DEFAULT_COUNTRY} />
          </>
        )}

        {!editing && (
          <CheckboxField name="agree" label="">
            I agree to the <Link href="/terms" target="_blank" className="underline">Terms</Link> and{" "}
            <Link href="/privacy" target="_blank" className="underline">Privacy policy</Link>, and to my question and profile text being {aiProcessing ? "processed by AI" : "processed automatically"} for matching.
          </CheckboxField>
        )}

        {formError && <Alert tone="error">{formError}</Alert>}
        {Object.keys(form.formState.errors).length > 0 && form.formState.isSubmitted && <Alert tone="error">Please fix the highlighted fields.</Alert>}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : editing ? "Save changes" : role === "seeker" ? "Join" : "Join as a Guide"}
        </Button>
      </form>
    </FormProvider>
  );
}
