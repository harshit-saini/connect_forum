"use client";
import { get, useFormContext, type FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";

function firstMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e.message === "string" && e.message) return e.message;
  for (const [k, v] of Object.entries(e)) {
    if (k === "ref" || k === "type") continue;
    const m = firstMessage(v);
    if (m) return m;
  }
  return undefined;
}

/** First error message anywhere under `name` (including array items and nested objects). */
export function useFieldError(name: string): string | undefined {
  const { formState } = useFormContext<FieldValues>();
  return firstMessage(get(formState.errors, name));
}

export function Field({
  name, label, hint, optional, children, counter, warnings, className, as = "div",
}: {
  name: string;
  label: string;
  hint?: string;
  optional?: boolean;
  counter?: string;
  warnings?: string[];
  as?: "div" | "fieldset";
  className?: string;
  children: (a11y: { id: string; describedBy: string; invalid: boolean }) => React.ReactNode;
}) {
  const error = useFieldError(name);
  const id = `f-${name.replace(/[^\w-]/g, "-")}`;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`, warnings?.length && `${id}-warn`].filter(Boolean).join(" ");
  const Wrapper = as;
  // A <legend> must be the fieldset's first child, which our flex header prevents, so fieldsets are named via aria-labelledby.
  const Label = as === "fieldset" ? "span" : "label";
  return (
    <Wrapper
      className={cn("space-y-1.5", className)}
      {...(as === "fieldset" ? { "aria-describedby": describedBy || undefined, "aria-labelledby": label ? `${id}-label` : undefined } : {})}
    >
      <div className={cn("flex items-baseline justify-between gap-2", !label && !counter && "hidden")}>
        <Label {...(as === "div" && label ? { htmlFor: id } : { id: `${id}-label` })} className="text-sm font-medium">
          {label}
          {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
        </Label>
        {counter && <span className="text-xs text-muted" aria-hidden>{counter}</span>}
      </div>
      {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {warnings?.map((w) => (
        <p key={w} id={`${id}-warn`} className="text-sm text-amber-700 dark:text-amber-300">{w}</p>
      ))}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">{error}</p>
      )}
    </Wrapper>
  );
}
