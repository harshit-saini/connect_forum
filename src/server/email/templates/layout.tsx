import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f6f7f9", fontFamily: "system-ui, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 520, padding: 32 }}>
          {children}
          <Section style={{ marginTop: 32 }}>
            <Text style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>
              A Guide&apos;s phone number and email address are shared only if the Guide chose to share them; a Seeker&apos;s email address goes only to the Guide they connect with. We will never ask for your
              password or payment details by email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
