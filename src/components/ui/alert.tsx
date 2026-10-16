import * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, tone = "info", ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: "info" | "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "error" ? "border-danger/40 bg-danger-bg text-danger" : "border-border bg-accent",
        className,
      )}
      {...props}
    />
  );
}
