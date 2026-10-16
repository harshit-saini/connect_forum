import "server-only";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { db } from "@/server/db/client";
import { devOutbox } from "@/server/db/schema";
import { env } from "@/server/env";
import { log } from "@/server/logging/logger";

export type OutgoingEmail = {
  to: string;
  subject: string;
  react: ReactElement;
  /** Free-form label stored with the Resend event for correlation, e.g. "signin-otp". */
  kind: string;
};

let resend: Resend | undefined;

/**
 * Sends one email. With MOCK_AI=true nothing leaves the machine: the plain-text body is written to
 * `dev_outbox` (read by local dev and Playwright). Bodies are never logged.
 */
export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  const e = env();
  const [html, text] = await Promise.all([render(mail.react), render(mail.react, { plainText: true })]);

  if (e.MOCK_AI) {
    await db().insert(devOutbox).values({ to: mail.to.toLowerCase(), subject: mail.subject, text });
    log.info("email.mock_sent", { kind: mail.kind });
    return;
  }

  resend ??= new Resend(e.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: e.FROM_EMAIL,
    to: mail.to,
    subject: mail.subject,
    html,
    text,
    tags: [{ name: "kind", value: mail.kind }],
  });
  if (error) {
    log.error("email.send_failed", { kind: mail.kind, error: error.message });
    throw new Error(`Email send failed: ${error.name}`);
  }
  log.info("email.sent", { kind: mail.kind });
}
