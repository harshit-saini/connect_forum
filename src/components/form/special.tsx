"use client";
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";

/**
 * Optional phone input with a country selector. The value is composed to E.164 and lives outside the form
 * state. An already-saved number is never shown, only its last 4 digits. `removed` is the parent's
 * "delete my saved number on save" flag.
 */
export function PhoneField({ last4, value, onChange, error, defaultCountry, removed, onRemovedChange, onIncompleteChange }: { last4: string | null; value: string; onChange: (e164: string) => void; error?: string; defaultCountry: string; removed: boolean; onRemovedChange: (removed: boolean) => void; /** True while digits are typed that do not form a complete number. */ onIncompleteChange: (incomplete: boolean) => void }) {
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
    onIncompleteChange(digits.length > 0 && !parsed?.isPossible());
  }

  const entered = national.replace(/[^\d]/g, "").length > 0;
  const ok = Boolean(value);
  const problem = error ?? (touched && entered && !ok ? `That doesn't look like a complete ${meta?.name ?? ""} number. Check the digits.` : undefined);

  // Focus moves to the button that replaces the one just pressed, so keyboard and screen-reader users keep their place.
  const [moved, setMoved] = useState(false);
  const showsInput = !(last4 && (removed || !replacing));
  const head = (
    <div>
      {showsInput ? <label htmlFor="phone-national" className="text-sm font-medium">Phone number (optional)</label> : <p className="text-sm font-medium">Phone number (optional)</p>}
      <p className="mt-0.5 text-sm text-muted">If you add a number, it is emailed to Seekers who connect with you. Leave it empty to share only your profile details.</p>
      <p className="mt-0.5 flex items-start gap-1.5 text-sm text-muted">
        <span aria-hidden="true">🔒</span>
        <span>Stored encrypted. You can change or remove it at any time.</span>
      </p>
    </div>
  );

  if (last4 && removed) {
    return (
      <div className="space-y-2">
        {head}
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <p className="text-sm">Your saved number (ending <strong>{last4}</strong>) will be removed when you save. Seekers who connect later get only your profile details.</p>
          <button type="button" autoFocus={moved} className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => { setMoved(true); onRemovedChange(false); }}>Keep my number</button>
        </div>
      </div>
    );
  }
  if (last4 && !replacing) {
    return (
      <div className="space-y-2">
        {head}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <p className="text-sm"><span aria-hidden="true">✓ </span>Saved number ending in <strong>{last4}</strong></p>
          <div className="flex gap-4">
            <button type="button" autoFocus={moved} className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => { setMoved(true); setReplacing(true); }}>Change number</button>
            <button type="button" className="text-sm font-medium text-danger underline-offset-4 hover:underline" onClick={() => { setMoved(true); onChange(""); onRemovedChange(true); }}>Remove number</button>
          </div>
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
        {ok ? `✓ Will be saved as ${parsePhoneNumberFromString(value)?.formatInternational() ?? value}` : "Enter your number without the country code. We don't verify it, so double-check it. Seekers who connect with you will receive it by email."}
      </p>
      {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
      {last4 && <button type="button" className="text-sm underline" onClick={() => { setReplacing(false); setNational(""); setTouched(false); onChange(""); onIncompleteChange(false); }}>Keep the saved number (ending {last4})</button>}
    </div>
  );
}
