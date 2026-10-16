import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/** Constant-time check of `Authorization: Bearer ${CRON_SECRET}` for cron and worker routes. */
export function authorizedBearer(req: Request): boolean {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
