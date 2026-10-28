"use client";
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
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
 * Phone input with a country selector. The value is composed to E.164 and lives outside the form state.
 * An already-saved number is never shown, only its last 4 digits.
 */
export function PhoneField({ last4, value, onChange, error, defaultCountry }: { last4: string | null; value: string; onChange: (e164: string) => void; error?: string; defaultCountry: string }) {
  const [country, setCountry] = useState<CountryCode>((COUNTRIES.some((c) => c.code === defaultCountry) ? defaultCountry : DEFAULT_COUNTRY) as CountryCode);
  const [national, setNational] = useState("");
  const [touched, setTouched] = useState(false);
  const [replacing, setReplacing] = useState(!last4);
  const meta = COUNTRIES.find((c) => c.code === country);

  function update(nextCountry: CountryCode, raw: string) {
    // Digits only, shown with the country's own grouping as the person types.
    const digits = raw.replace(/[^\d]/g, "").slice(0, 15);
    const shown = new AsYouType(nextCountry).input(digits);
    setCountry(nextCountry);
    setNational(shown);
    const parsed = digits ? parsePhoneNumberFromString(digits, nextCountry) : undefined;
    onChange(parsed?.isPossible() ? parsed.number : "");
  }

  const entered = national.replace(/[^\d]/g, "").length > 0;
  const ok = Boolean(value);
  const problem = error ?? (touched && entered && !ok ? `That doesn't look like a complete ${meta?.name ?? ""} number. Check the digits.` : undefined);

  const head = (
    <div>
      <label htmlFor="phone-national" className="text-sm font-medium">Phone number</label>
      <p className="mt-0.5 flex items-start gap-1.5 text-sm text-muted">
        <span aria-hidden="true">🔒</span>
        <span>Stored encrypted. Shown only to Seekers you approve, never by email.</span>
      </p>
    </div>
  );

  if (last4 && !replacing) {
    return (
      <div className="space-y-2">
        {head}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <p className="text-sm"><span aria-hidden="true">✓ </span>Saved number ending in <strong>{last4}</strong></p>
          <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setReplacing(true)}>Change number</button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {head}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Country"
          value={country}
          onChange={(e) => update(e.target.value as CountryCode, national)}
          className="min-h-11 rounded-lg border border-border bg-card px-2 text-base sm:w-52"
        >
          {COUNTRIES.map((c) => <option key={c.code} value={c.code} suppressHydrationWarning>{c.name} ({c.dial})</option>)}
        </select>
        <Input
          id="phone-national" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210"
          value={national} aria-invalid={Boolean(problem)} aria-describedby="phone-help" className="flex-1"
          onChange={(e) => update(country, e.target.value)} onBlur={() => setTouched(true)}
        />
      </div>
      <p id="phone-help" aria-live="polite" className={ok ? "text-sm text-primary" : "text-sm text-muted"}>
        {ok ? `✓ Will be saved as ${parsePhoneNumberFromString(value)?.formatInternational() ?? value}` : "Enter your number without the country code. We don't verify it, so double-check it."}
      </p>
      {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
      {last4 && <button type="button" className="text-sm underline" onClick={() => { setReplacing(false); setNational(""); setTouched(false); onChange(""); }}>Keep the saved number (ending {last4})</button>}
    </div>
  );
}
