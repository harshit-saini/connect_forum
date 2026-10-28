import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

const button = { backgroundColor: "#0f766e", borderRadius: 8, color: "#fff", padding: "12px 20px" } as const;

/**
 * To a Seeker who connected with a Guide. The Guide's public profile, plus their phone number only when
 * the Guide chose to provide one (`phone` is null otherwise).
 */
export function GuideDetailsEmail({ title, years, categories, about, phone, link }: { title: string; years: number; categories: string[]; about: string; phone: string | null; link: string }) {
  return (
    <EmailLayout preview={`Your Guide's details: ${title}`}>
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        Your Guide&apos;s details
      </Heading>
      <Text>You asked to connect with a Guide, and here are their details.</Text>
      <Text style={{ margin: "4px 0" }}>
        <strong>{title}</strong>
      </Text>
      <Text style={{ margin: "4px 0" }}>Experience: {years} years</Text>
      {categories.length > 0 && <Text style={{ margin: "4px 0" }}>Can help with: {categories.join(", ")}</Text>}
      <Text style={{ margin: "4px 0" }}>How I can help: {about}</Text>
      {phone ? (
        <>
          <Text style={{ margin: "16px 0 4px" }}>Phone number, shared by the Guide so Seekers can reach them:</Text>
          <Text style={{ fontSize: 20, fontWeight: 600, margin: "0 0 12px" }}>{phone}</Text>
          <Text>Please be respectful of their time, and keep the number to yourself.</Text>
        </>
      ) : (
        <Text style={{ margin: "16px 0 12px" }}>This Guide didn&apos;t share a phone number, so you can&apos;t contact them directly.</Text>
      )}
      <Button href={link} style={button}>Open in Connect</Button>
    </EmailLayout>
  );
}

/** To a Guide. Tells them a Seeker was given their details: Seekers have no contact details to share. */
export function GuideNotifiedEmail({ category, question, note, hasPhone }: { category: string; question: string; note: string | null; hasPhone: boolean }) {
  return (
    <EmailLayout preview="A Seeker has been given your details">
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        A Seeker connected with you
      </Heading>
      <Text>A Seeker asked for guidance and has been sent your profile details{hasPhone ? ", including your phone number" : ""}.</Text>
      <Text style={{ margin: "4px 0" }}>Category: {category}</Text>
      <Text style={{ margin: "4px 0" }}>Their question: {question}</Text>
      {note && <Text style={{ margin: "4px 0" }}>Their note: {note}</Text>}
      <Text>{hasPhone ? "They may call or text you. You can remove your number any time by editing your profile." : "You didn't provide a phone number, so they can't contact you directly. You can add one any time by editing your profile."}</Text>
    </EmailLayout>
  );
}
