import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

const button = { backgroundColor: "#0f766e", borderRadius: 8, color: "#fff", padding: "12px 20px" } as const;

/**
 * To a Seeker who connected with a Guide. The Guide's public profile, plus their e-mail address only when
 * the Guide opted in (`guideEmail` is null otherwise) and their phone number only when the Guide chose to
 * provide one (`phone` is null otherwise).
 */
export function GuideDetailsEmail({ title, years, categories, about, phone, guideEmail, link }: { title: string; years: number; categories: string[]; about: string; phone: string | null; guideEmail: string | null; link: string }) {
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
      {guideEmail && <Text style={{ margin: "16px 0 4px" }}>Email: {guideEmail}</Text>}
      {phone ? (
        <>
          <Text style={{ margin: "16px 0 4px" }}>Phone number, shared by the Guide so Seekers can reach them:</Text>
          <Text style={{ fontSize: 20, fontWeight: 600, margin: "0 0 12px" }}>{phone}</Text>
        </>
      ) : (
        <Text style={{ margin: "16px 0 4px" }}>This Guide didn&apos;t share a phone number{guideEmail ? "." : " or an email address, so you can't contact them directly."}</Text>
      )}
      {(guideEmail || phone) && <Text>Please be respectful of their time, and keep their contact details to yourself.</Text>}
      <Button href={link} style={button}>Open in Connect</Button>
    </EmailLayout>
  );
}

/** To a Guide. Tells them a Seeker was given their details, and gives the Seeker's e-mail address (shared by the Seeker when they connected). */
export function GuideNotifiedEmail({ category, question, note, hasPhone, seekerEmail }: { category: string; question: string; note: string | null; hasPhone: boolean; seekerEmail: string | null }) {
  return (
    <EmailLayout preview="A Seeker has been given your details">
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        A Seeker connected with you
      </Heading>
      <Text>A Seeker asked for guidance and has been sent your profile details{hasPhone ? ", including your phone number" : ""}. {seekerEmail ? " They agreed to share their email address with you so you can write to them." : ""}</Text>
      <Text style={{ margin: "4px 0" }}>Category: {category}</Text>
      <Text style={{ margin: "4px 0" }}>Their question: {question}</Text>
      {note && <Text style={{ margin: "4px 0" }}>Their note: {note}</Text>}
      {seekerEmail && <Text style={{ margin: "16px 0 4px" }}>Reply to the Seeker at: {seekerEmail}</Text>}
      {seekerEmail && <Text>Please be respectful of their time and privacy, and don&apos;t share their email address with anyone else.</Text>}
      <Text>
        If you have chosen to share your email address, Seekers who connect with you receive it, so they may write to you.{" "}
        {hasPhone ? "They may also call or text you." : "You didn't provide a phone number."} You can change what you share any time by editing your profile.
      </Text>
    </EmailLayout>
  );
}
