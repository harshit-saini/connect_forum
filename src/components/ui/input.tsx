import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ref, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      ref={ref}
      className={cn(
        "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base placeholder:text-muted/70 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
