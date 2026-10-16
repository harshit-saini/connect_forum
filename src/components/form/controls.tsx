"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Controller, useFormContext, type FieldValues } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { DAY_PARTS, DAYS, labelOf, type Option } from "@/config/taxonomy";
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

export function TextField({ name, label, hint, optional, placeholder, max, type = "text", autoComplete }: Base & { placeholder?: string; max?: number; type?: string; autoComplete?: string }) {
  const { register, watch } = useFormContext<FieldValues>();
  const value = watch(name) as string | undefined;
  const warnings = useScreen(value);
  return (
    <Field name={name} label={label} hint={hint} optional={optional} warnings={warnings} counter={max ? `${(value ?? "").length}/${max}` : undefined}>
      {({ id, describedBy, invalid }) => (
        <Input id={id} type={type} maxLength={max ? max + 40 : undefined} placeholder={placeholder} autoComplete={autoComplete ?? "off"} aria-invalid={invalid} aria-describedby={describedBy || undefined} className={invalidClass} {...register(name)} />
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

/** Searchable tag picker. With `options` and `allowCustom=false` it behaves as a multi-select. */
export function TagField({ name, label, hint, optional, options, allowCustom = true, max, maxLen = 40, placeholder }: Base & { options?: readonly Option[]; allowCustom?: boolean; max?: number; maxLen?: number; placeholder?: string }) {
  const { control } = useFormContext<FieldValues>();
  const [query, setQuery] = useState("");
  return (
    <Field as="fieldset" name={name} label={label} hint={hint} optional={optional} counter={max ? `max ${max}` : undefined}>
      {({ id, describedBy, invalid }) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => {
            const value: string[] = field.value ?? [];
            const atMax = max !== undefined && value.length >= max;
            const q = query.trim().toLowerCase();
            const matches = (options ?? []).filter((o) => !value.includes(o.value) && (q === "" ? false : o.label.toLowerCase().includes(q))).slice(0, 6);
            const add = (v: string) => {
              if (!v || atMax || value.some((x) => x.toLowerCase() === v.toLowerCase())) return;
              field.onChange([...value, v]);
              setQuery("");
            };
            const exact = options?.find((o) => o.label.toLowerCase() === q || o.value === q);
            return (
              <div className="space-y-2">
                {value.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label={`${label}, selected`}>
                    {value.map((v) => (
                      <li key={v} className="flex items-center gap-1 rounded-full bg-accent py-1 pl-3 pr-1 text-sm">
                        {options ? labelOf(options, v) : v}
                        <button type="button" aria-label={`Remove ${options ? labelOf(options, v) : v}`} className="grid size-7 place-items-center rounded-full hover:bg-border" onClick={() => field.onChange(value.filter((x) => x !== v))}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
                <Input
                  id={id} aria-label={label} value={query} disabled={atMax} maxLength={maxLen} placeholder={atMax ? "Maximum reached" : placeholder ?? "Type to search or add"}
                  aria-invalid={invalid} aria-describedby={describedBy || undefined} aria-autocomplete="list" autoComplete="off"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      if (exact) add(exact.value);
                      else if (matches[0] && !allowCustom) add(matches[0].value);
                      else if (allowCustom) add(query.trim());
                    }
                  }}
                />
                {(matches.length > 0 || (allowCustom && q && !exact)) && (
                  <ul className="flex flex-wrap gap-2" aria-label="Suggestions">
                    {matches.map((o) => (
                      <li key={o.value}><button type="button" className="min-h-9 rounded-full border border-border px-3 text-sm hover:bg-accent" onClick={() => add(o.value)}>+ {o.label}</button></li>
                    ))}
                    {allowCustom && q && !exact && (
                      <li><button type="button" className="min-h-9 rounded-full border border-dashed border-border px-3 text-sm hover:bg-accent" onClick={() => add(query.trim())}>+ Add “{query.trim()}”</button></li>
                    )}
                  </ul>
                )}
              </div>
            );
          }}
        />
      )}
    </Field>
  );
}

/** A short list of free-text lines (e.g. target roles, questions). */
export function ListField({ name, label, hint, optional, max, maxLen, placeholder, addLabel = "Add another" }: Base & { max: number; maxLen: number; placeholder?: string; addLabel?: string }) {
  const { control } = useFormContext<FieldValues>();
  return (
    <Field as="fieldset" name={name} label={label} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => {
            const value: string[] = field.value?.length ? field.value : [""];
            const set = (next: string[]) => field.onChange(next);
            return (
              <div className="space-y-2">
                {value.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <Input id={i === 0 ? id : undefined} value={v} maxLength={maxLen + 40} placeholder={placeholder} aria-label={`${label} ${i + 1}`} aria-invalid={invalid} aria-describedby={describedBy || undefined} onChange={(e) => set(value.map((x, j) => (j === i ? e.target.value : x)))} />
                    {value.length > 1 && (
                      <button type="button" aria-label={`Remove ${label} ${i + 1}`} className="min-h-11 rounded-lg border border-border px-3 hover:bg-accent" onClick={() => set(value.filter((_, j) => j !== i))}>×</button>
                    )}
                  </div>
                ))}
                {value.length < max && (
                  <button type="button" className="min-h-11 text-sm font-medium text-primary hover:underline" onClick={() => set([...value, ""])}>+ {addLabel}</button>
                )}
              </div>
            );
          }}
        />
      )}
    </Field>
  );
}

/**
 * Pick help types, then order them. Position is the rank; the first three are the ranked top needs.
 * With `withLevel`, each item also carries a some/solid/expert self-rating (Guides).
 */
export function RankedHelpField({ name, label, hint, options, levels, max }: Base & { options: readonly Option[]; levels?: readonly Option[]; max: number }) {
  const { control } = useFormContext<FieldValues>();
  return (
    <Field as="fieldset" name={name} label={label} hint={hint} counter={`up to ${max}`}>
      {() => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => {
            const raw: Array<string | { type: string; level: string }> = field.value ?? [];
            const items = raw.map((r) => (typeof r === "string" ? { type: r, level: "solid" } : r));
            const emit = (next: typeof items) => field.onChange(levels ? next : next.map((n) => n.type));
            const move = (i: number, d: -1 | 1) => {
              const j = i + d;
              if (j < 0 || j >= items.length) return;
              const next = [...items];
              [next[i], next[j]] = [next[j]!, next[i]!];
              emit(next);
            };
            const selected = new Set(items.map((i) => i.type));
            return (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((o) => {
                    const checked = selected.has(o.value);
                    const full = items.length >= max;
                    return (
                      <label key={o.value} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm", checked && "border-primary bg-accent", !checked && full && "cursor-not-allowed opacity-50")}>
                        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked} disabled={!checked && full} onChange={() => emit(checked ? items.filter((i) => i.type !== o.value) : [...items, { type: o.value, level: "solid" }])} />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
                {items.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-sm font-medium">Your order (top 3 count most)</p>
                    <ol className="space-y-2">
                      {items.map((it, i) => (
                        <li key={it.type} className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm", i < 3 && "border-primary/50")}>
                          <span className="grid size-7 place-items-center rounded-full bg-accent text-xs font-semibold" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                          <span className="min-w-0 flex-1">{labelOf(options, it.type)}</span>
                          {levels && (
                            <select aria-label={`Your level for ${labelOf(options, it.type)}`} className="min-h-9 rounded-md border border-border bg-card px-2" value={it.level} onChange={(e) => emit(items.map((x) => (x.type === it.type ? { ...x, level: e.target.value } : x)))}>
                              {levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                            </select>
                          )}
                          <button type="button" aria-label={`Move ${labelOf(options, it.type)} up`} disabled={i === 0} className="size-9 rounded-md border border-border disabled:opacity-30" onClick={() => move(i, -1)}>↑</button>
                          <button type="button" aria-label={`Move ${labelOf(options, it.type)} down`} disabled={i === items.length - 1} className="size-9 rounded-md border border-border disabled:opacity-30" onClick={() => move(i, 1)}>↓</button>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          }}
        />
      )}
    </Field>
  );
}

export function AvailabilityGrid({ name, label, hint }: Base) {
  const { control } = useFormContext<FieldValues>();
  return (
    <Field as="fieldset" name={name} label={label} hint={hint}>
      {() => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => {
            const value: string[] = field.value ?? [];
            const toggle = (slot: string) => field.onChange(value.includes(slot) ? value.filter((s) => s !== slot) : [...value, slot]);
            return (
              <div className="overflow-x-auto" role="region" aria-label="Weekly availability grid" tabIndex={0}>
                <table className="w-full min-w-[20rem] border-separate border-spacing-1 text-sm">
                  <thead>
                    <tr>
                      <th className="w-12" />
                      {DAY_PARTS.map((p) => (
                        <th key={p.value} scope="col" className="pb-1 text-center font-medium">
                          {p.label}
                          <span className="block text-[10px] font-normal text-muted">{p.description}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((d) => (
                      <tr key={d.value}>
                        <th scope="row" className="pr-2 text-left font-medium">{d.label}</th>
                        {DAY_PARTS.map((p) => {
                          const slot = `${d.value}.${p.value}`;
                          const on = value.includes(slot);
                          return (
                            <td key={slot}>
                              <button type="button" role="checkbox" aria-checked={on} aria-label={`${d.label} ${p.label}`} onClick={() => toggle(slot)} className={cn("h-11 w-full rounded-md border border-border", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>
                                {on ? "✓" : ""}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-xs text-muted">{value.length} slot{value.length === 1 ? "" : "s"} selected. Times are in your own timezone.</p>
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
