"use client";
import { useMemo, useSyncExternalStore } from "react";
import { Controller, useFormContext, type FieldValues } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { type Option } from "@/config/taxonomy";
import { screenText } from "@/lib/screening";
import { cn } from "@/lib/utils";
import { Field } from "./field";

type Base = { name: string; label: string; hint?: string; optional?: boolean };

const selectClass =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base disabled:opacity-50 aria-[invalid=true]:border-danger";
const invalidClass = "aria-[invalid=true]:border-danger";

function useScreen(value: unknown) {
  return useMemo(() => (typeof value === "string" ? screenText(value).warnings : []), [value]);
}

export function TextField({ name, label, hint, optional, placeholder, max, type = "text", autoComplete, readOnly }: Base & { placeholder?: string; max?: number; type?: string; autoComplete?: string; readOnly?: boolean }) {
  const { register, watch } = useFormContext<FieldValues>();
  const value = watch(name) as string | undefined;
  const warnings = useScreen(value);
  return (
    <Field name={name} label={label} hint={hint} optional={optional} warnings={warnings} counter={max ? `${(value ?? "").length}/${max}` : undefined}>
      {({ id, describedBy, invalid }) => (
        <Input id={id} type={type} maxLength={max ? max + 40 : undefined} placeholder={placeholder} autoComplete={autoComplete ?? "off"} aria-invalid={invalid} aria-describedby={describedBy || undefined} readOnly={readOnly} className={cn(invalidClass, readOnly && "bg-accent")} {...register(name)} />
      )}
    </Field>
  );
}

export function TextAreaField({ name, label, hint, optional, placeholder, max, min, rows = 5 }: Base & { placeholder?: string; max: number; min?: number; rows?: number }) {
  const { register, watch } = useFormContext<FieldValues>();
  const value = watch(name) as string | undefined;
  const warnings = useScreen(value);
  const len = (value ?? "").length;
  const counter = min && len < min ? `${len}/${max} (min ${min})` : `${len}/${max}`;
  return (
    <Field name={name} label={label} hint={hint} optional={optional} warnings={warnings} counter={counter}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} rows={rows} placeholder={placeholder} aria-invalid={invalid} aria-describedby={describedBy || undefined} className={cn("w-full rounded-lg border border-border bg-card px-3 py-2 text-base placeholder:text-muted/70", invalidClass)} {...register(name)} />
      )}
    </Field>
  );
}

export function NumberField({ name, label, hint, optional, min = 0, max }: Base & { min?: number; max?: number }) {
  const { control } = useFormContext<FieldValues>();
  return (
    <Field name={name} label={label} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Input
              id={id} type="number" inputMode="numeric" min={min} max={max} aria-invalid={invalid} aria-describedby={describedBy || undefined}
              className={cn("max-w-40", invalidClass)}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            />
          )}
        />
      )}
    </Field>
  );
}

export function SelectField({ name, label, hint, optional, options, placeholder = "Select…" }: Base & { options: readonly Option[]; placeholder?: string }) {
  const { register } = useFormContext<FieldValues>();
  return (
    <Field name={name} label={label} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-invalid={invalid} aria-describedby={describedBy || undefined} className={selectClass} {...register(name)}>
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function RadioField({ name, label, hint, optional, options }: Base & { options: readonly Option[] }) {
  const { register, watch } = useFormContext<FieldValues>();
  const current = watch(name);
  return (
    <Field as="fieldset" name={name} label={label} hint={hint} optional={optional}>
      {({ id }) => (
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby={id}>
          {options.map((o) => (
            <label key={o.value} className={cn("flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm", current === o.value && "border-primary bg-accent")}>
              <input type="radio" value={o.value} className="mt-0.5 size-4 accent-[var(--primary)]" {...register(name)} />
              <span>
                <span className="font-medium">{o.label}</span>
                {o.description && <span className="block text-muted">{o.description}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </Field>
  );
}

export function CheckboxField({ name, label, hint, children }: { name: string; label: string; hint?: string; children?: React.ReactNode }) {
  const { register } = useFormContext<FieldValues>();
  return (
    <Field as="div" name={name} label="" hint={hint}>
      {({ id, describedBy, invalid }) => (
        <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm">
          <input id={id} type="checkbox" aria-invalid={invalid} aria-describedby={describedBy || undefined} className="mt-0.5 size-5 accent-[var(--primary)]" {...register(name)} />
          <span>{children ?? label}</span>
        </label>
      )}
    </Field>
  );
}

/** Checkbox group with an optional maximum. Stores an array of values. */
export function MultiCheckField({ name, label, hint, optional, options, max }: Base & { options: readonly Option[]; max?: number }) {
  const { control } = useFormContext<FieldValues>();
  return (
    <Field as="fieldset" name={name} label={label} hint={hint} optional={optional}>
      {() => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => {
            const value: string[] = field.value ?? [];
            const full = max !== undefined && value.length >= max;
            return (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((o) => {
                  const checked = value.includes(o.value);
                  return (
                    <label key={o.value} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm", checked && "border-primary bg-accent", !checked && full && "cursor-not-allowed opacity-50")}>
                      <input
                        type="checkbox" checked={checked} disabled={!checked && full} className="size-4 accent-[var(--primary)]"
                        onChange={() => field.onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value])}
                      />
                      <span>
                        {o.label}
                        {o.description && <span className="block text-xs text-muted">{o.description}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          }}
        />
      )}
    </Field>
  );
}

const noop = () => () => {};
export function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false);
}
