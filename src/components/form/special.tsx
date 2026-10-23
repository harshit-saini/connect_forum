"use client";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { useState, useTransition } from "react";
import { useFormContext, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import { suggestAliasAction } from "@/server/actions/profile";
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
