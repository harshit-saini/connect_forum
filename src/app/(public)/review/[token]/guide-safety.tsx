"use client";
import { SafetyDialog, type SafetyInput } from "@/components/safety/safety-dialog";
import { reviewSafetyAction } from "@/server/actions/review-safety";

export function GuideSafety({ token, csrf, name }: { token: string; csrf: string; name: string }) {
  async function submit(input: SafetyInput) {
    const fd = new FormData();
    fd.set("token", token);
    fd.set("csrf", csrf);
    fd.set("action", input.action);
    if (input.reason) fd.set("reason", input.reason);
    if (input.details) fd.set("details", input.details);
    const res = await reviewSafetyAction({}, fd);
    return res.error ?? null;
  }
  return <SafetyDialog who={name} onSubmit={submit} />;
}
