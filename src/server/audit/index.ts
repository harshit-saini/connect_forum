import "server-only";
import type { Db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";
import { redact } from "@/server/logging/logger";

export type AuditAction =
  | "connection.requested"
  | "connection.approved"
  | "connection.declined"
  | "connection.expired"
  | "unlock.created"
  | "phone.revealed"
  | "phone.reveal_denied"
  | "user.suspended"
  | "user.unsuspended"
  | "user.deleted"
  | "data.exported"
  | "report.created"
  | "report.reviewed"
  | "block.created";

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  targetId?: string | null;
  subjectType?: string;
  subjectId?: string;
  /** Ids, counts and states only. Sensitive keys are stripped automatically. */
  metadata?: Record<string, unknown>;
};

/** Writes an audit row. Pass a transaction so the entry commits atomically with the action it records. */
export async function audit(tx: Pick<Db, "insert">, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    action: entry.action,
    actorId: entry.actorId ?? null,
    targetId: entry.targetId ?? null,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    metadata: (redact(entry.metadata ?? {}) as Record<string, unknown>) ?? {},
  });
}
