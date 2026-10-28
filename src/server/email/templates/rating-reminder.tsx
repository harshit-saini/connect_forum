import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export function RatingReminderEmail({ guideName, link }: { guideName: string; link: string }) {
  return (
    <EmailLayout preview="How was your Guide?">
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        How was your Guide?
      </Heading>
      <Text>
        You connected with <strong>{guideName}</strong> a few days ago. A quick rating helps other Seekers and helps us match well. It takes less than a minute, and the Guide never sees what you write.
      </Text>
      <Button href={link} style={{ backgroundColor: "#0f766e", borderRadius: 8, color: "#fff", padding: "12px 20px" }}>
        Rate your Guide
      </Button>
    </EmailLayout>
  );
}
