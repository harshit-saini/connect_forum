import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export function MatchesReadyEmail({ matches, link }: { matches: Array<{ name: string; why: string }>; link: string }) {
  return (
    <EmailLayout preview="Your top Guide matches are ready">
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        Your top matches
      </Heading>
      <Text>We found Guides who could help. Seekers stay anonymous: Guides only see your category and question.</Text>
      {matches.map((m, i) => (
        <Text key={i} style={{ margin: "8px 0" }}>
          <strong>{m.name}</strong>
          <br />
          {m.why}
        </Text>
      ))}
      <Button href={link} style={{ backgroundColor: "#0f766e", borderRadius: 8, color: "#fff", padding: "12px 20px", marginTop: 12 }}>
        View your matches
      </Button>
    </EmailLayout>
  );
}
