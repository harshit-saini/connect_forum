"use client";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useFormContext, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FUNCTIONS, INDUSTRIES } from "@/config/taxonomy";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { suggestAliasAction } from "@/server/actions/profile";
import { CheckboxField, NumberField, SelectField, TextAreaField, TextField, useIsClient } from "./controls";
import { Field } from "./field";

export function AliasField() {
  const { register, setValue } = useFormContext<FieldValues>();
  const [pending, start] = useTransition();
  return (
    <Field name="alias" label="Alias" hint="Other users only ever see this name. 3–24 letters, numbers, spaces, _ or -. Don't use your real name.">
      {({ id, describedBy, invalid }) => (
        <div className="flex gap-2">
          <Input id={id} maxLength={24} autoComplete="off" aria-invalid={invalid} aria-describedby={describedBy || undefined} placeholder="e.g. CuriousFalcon42" {...register("alias")} />
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => setValue("alias", await suggestAliasAction(), { shouldDirty: true, shouldValidate: true }))}>
            {pending ? "…" : "Suggest"}
          </Button>
        </div>
      )}
    </Field>
  );
}

export function CountryField({ name = "country", label = "Country" }: { name?: string; label?: string }) {
  const { register, getValues, setValue } = useFormContext<FieldValues>();
  useEffect(() => {
    if (!getValues(name)) setValue(name, DEFAULT_COUNTRY, { shouldDirty: false });
  }, [name, getValues, setValue]);
  return (
    <Field name={name} label={label}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-invalid={invalid} aria-describedby={describedBy || undefined} className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base" {...register(name)}>
          <option value="">Select a country…</option>
          {/* Region names come from the runtime's ICU data, which can differ between Node and the browser. */}
          {COUNTRIES.map((c) => <option key={c.code} value={c.code} suppressHydrationWarning>{c.name}</option>)}
        </select>
      )}
    </Field>
  );
}

export function TimezoneField() {
  const { register, getValues, setValue } = useFormContext<FieldValues>();
  const client = useIsClient();
  const zones = useMemo(() => {
    if (!client) return [] as string[];
    const list = Intl.supportedValuesOf("timeZone");
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return list.includes(detected) ? list : [detected, ...list];
  }, [client]);
  useEffect(() => {
    if (client && !getValues("timezone")) setValue("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone, { shouldDirty: false });
  }, [client, getValues, setValue]);
  return (
    <Field name="timezone" label="Timezone" hint="Detected from your device. Change it if it's wrong.">
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-invalid={invalid} aria-describedby={describedBy || undefined} className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base" {...register("timezone")}>
          <option value="">{client ? "Select a timezone…" : "Detecting…"}</option>
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </select>
      )}
    </Field>
  );
}

export function ConsentsField() {
  return (
    <Field as="fieldset" name="consents" label="Consents (all required)">
      {() => (
        <div className="space-y-1">
          <CheckboxField name="consents.terms" label="">
            I agree to the <Link href="/terms" target="_blank" className="underline">Terms of use</Link>.
          </CheckboxField>
          <CheckboxField name="consents.privacy" label="">
            I have read the <Link href="/privacy" target="_blank" className="underline">Privacy policy</Link>.
          </CheckboxField>
          <CheckboxField name="consents.aiProcessing" label="My free text is processed by AI for matching." />
        </div>
      )}
    </Field>
  );
}

/**
 * Phone input with a country selector. The value is composed to E.164 and lives outside the form state
 * (so autosave can never include it). An already-saved number is never shown, only its last 4 digits.
 */
export function PhoneField({ last4, value, onChange, error, defaultCountry }: { last4: string | null; value: string; onChange: (e164: string) => void; error?: string; defaultCountry: string }) {
  const [country, setCountry] = useState<CountryCode>((COUNTRIES.some((c) => c.code === defaultCountry) ? defaultCountry : DEFAULT_COUNTRY) as CountryCode);
  const [national, setNational] = useState("");
  const [replacing, setReplacing] = useState(!last4);
  const dial = COUNTRIES.find((c) => c.code === country)?.dial ?? "";

  function update(nextCountry: CountryCode, nextNational: string) {
    setCountry(nextCountry);
    setNational(nextNational);
    const parsed = nextNational.trim() ? parsePhoneNumberFromString(nextNational, nextCountry) : undefined;
    onChange(parsed?.number ?? "");
  }

  if (last4 && !replacing) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Phone number</p>
        <p className="rounded-lg border border-border bg-card p-3 text-sm">A number ending in <strong>{last4}</strong> is saved securely. <button type="button" className="font-medium text-primary underline" onClick={() => setReplacing(true)}>Replace it</button></p>
        <p className="text-sm text-muted">Shown only to Seekers you approve.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor="phone-national" className="text-sm font-medium">Phone number</label>
      <p className="text-sm text-muted">Stored encrypted. Shown only to Seekers you approve. We don&apos;t verify it, so double-check it.</p>
      <div className="flex gap-2">
        <select aria-label="Country calling code" value={country} onChange={(e) => update(e.target.value as CountryCode, national)} className="min-h-11 max-w-[9.5rem] rounded-lg border border-border bg-card px-2 text-base">
          {COUNTRIES.map((c) => <option key={c.code} value={c.code} suppressHydrationWarning>{c.code} {c.dial}</option>)}
        </select>
        <Input id="phone-national" type="tel" inputMode="tel" autoComplete="off" placeholder="98765 43210" value={national} aria-invalid={Boolean(error)} onChange={(e) => update(country, e.target.value)} />
      </div>
      <p className="text-xs text-muted">{value ? `Will be saved as ${value}` : `Enter the number without ${dial}`}</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {last4 && <button type="button" className="text-sm underline" onClick={() => { setReplacing(false); setNational(""); onChange(""); }}>Keep the saved number</button>}
    </div>
  );
}

export function TimelineEditor({ required }: { required: boolean }) {
  const { control, watch } = useFormContext<FieldValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "timeline" });
  return (
    <Field as="fieldset" name="timeline" label="Career timeline" optional={!required} hint={required ? "Add at least one past role, most recent first. Don't name companies." : "Optional. Up to 6 roles. Don't name companies."} counter={`${fields.length}/6`}>
      {() => (
        <div className="space-y-4">
          {fields.map((f, i) => {
            const current = watch(`timeline.${i}.endYear`) === null;
            return (
              <div key={f.id} className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Role {i + 1}</p>
                  <button type="button" className="text-sm text-danger underline" onClick={() => remove(i)}>Remove</button>
                </div>
                <TextField name={`timeline.${i}.title`} label="Title" max={80} placeholder="e.g. Data analyst" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField name={`timeline.${i}.industry`} label="Industry" options={INDUSTRIES} />
                  <SelectField name={`timeline.${i}.function`} label="Function" options={FUNCTIONS} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField name={`timeline.${i}.startYear`} label="Start year" min={1960} max={new Date().getFullYear()} />
                  <div className="space-y-1.5">
                    <Controller
                      control={control}
                      name={`timeline.${i}.endYear`}
                      render={({ field }) => (
                        <>
                          <Field name={`timeline.${i}.endYear`} label="End year">
                            {({ id, invalid }) => (
                              <Input id={id} type="number" inputMode="numeric" disabled={current} aria-invalid={invalid} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
                            )}
                          </Field>
                          <label className="flex min-h-9 items-center gap-2 text-sm">
                            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={field.value === null} onChange={(e) => field.onChange(e.target.checked ? null : undefined)} />
                            Current role
                          </label>
                        </>
                      )}
                    />
                  </div>
                </div>
                <TextAreaField name={`timeline.${i}.summary`} label="One-line summary" max={200} rows={2} placeholder="What you did, without naming the company" />
              </div>
            );
          })}
          {fields.length < 6 && (
            <button type="button" className={cn("min-h-11 rounded-lg border border-dashed border-border px-4 text-sm font-medium text-primary hover:bg-accent")} onClick={() => append({ title: "", industry: "", function: "", startYear: undefined, endYear: undefined, summary: "" })}>
              + Add a role
            </button>
          )}
        </div>
      )}
    </Field>
  );
}
