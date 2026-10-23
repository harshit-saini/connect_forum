import "server-only";
import { normalizeMemberId } from "@/lib/member-id";
import { env } from "@/server/env";

export type MemberRole = "seeker" | "guide";

/**
 * The hard member-ID check. The allow-lists come from GUIDE_MEMBER_IDS / SEEKER_MEMBER_IDS; an ID of
 * one role is not valid for the other. An empty list admits nobody (fails closed).
 */
export function isKnownMemberId(role: MemberRole, input: string): boolean {
  const list = role === "guide" ? env().GUIDE_MEMBER_IDS : env().SEEKER_MEMBER_IDS;
  const id = normalizeMemberId(input);
  return id.length > 0 && list.includes(id);
}
