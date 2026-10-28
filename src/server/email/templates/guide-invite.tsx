import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

/** To a prospective Guide: a short invitation with the registration link. No personal data. */
export function GuideInviteEmail({ link }: { link: string }) {
  return (
    <EmailLayout preview="You're invited to join Connect as a Guide">
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        Join Connect as a Guide
      </Heading>
      <Text>You&apos;ve been invited to share your career experience with people who need guidance.</Text>
      <Text>Registration is one short page and takes about two minutes. Have your member ID ready. A phone number is optional: if you give one, it is stored encrypted and e-mailed to Seekers who connect with you, and you can remove it any time.</Text>
      <Button href={link} style={{ backgroundColor: "#0f766e", borderRadius: 8, color: "#fff", padding: "12px 20px" }}>
        Register as a Guide
      </Button>
      <Text style={{ color: "#6b7280", fontSize: 13 }}>Link: {link}</Text>
    </EmailLayout>
  );
}
