import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

const button = { backgroundColor: "#0f766e", borderRadius: 8, color: "#fff", padding: "12px 20px" } as const;

/** To a Guide. Alias and public career details only: never any contact information. */
export function ConnectionRequestEmail({ seekerAlias, stage, goal, target, help, link, days }: { seekerAlias: string; stage: string; goal: string; target: string; help: string[]; link: string; days: number }) {
  return (
    <EmailLayout preview={`${seekerAlias} would like your guidance`}>
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        A Seeker would like your guidance
      </Heading>
      <Text>
        <strong>{seekerAlias}</strong> asked to connect with you.
      </Text>
      <Text style={{ margin: "4px 0" }}>Career stage: {stage}</Text>
      <Text style={{ margin: "4px 0" }}>Goal: {goal}</Text>
      <Text style={{ margin: "4px 0" }}>Looking for: {target}</Text>
      <Text style={{ margin: "4px 0" }}>Help needed: {help.join(", ")}</Text>
      <Text>You can review the request, then approve or decline. Your phone number is shared with this Seeker only if you approve. No login needed. The link works once and expires in {days} days.</Text>
      <Button href={link} style={button}>Review the request</Button>
      <Text style={{ color: "#6b7280", fontSize: 13 }}>Link: {link}</Text>
    </EmailLayout>
  );
}

/** To a Seeker. Deliberately does not contain the Guide's number. */
export function RequestApprovedEmail({ guideAlias, link }: { guideAlias: string; link: string }) {
  return (
    <EmailLayout preview={`${guideAlias} approved your request`}>
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        Your request was approved
      </Heading>
      <Text>
        <strong>{guideAlias}</strong> approved your request. Sign in to see how to reach them. For your privacy, contact details are never sent by email.
      </Text>
      <Button href={link} style={button}>Open in Connect</Button>
    </EmailLayout>
  );
}

/** To a Seeker. Generic on purpose: no Guide is named. */
export function RequestDeclinedEmail({ link }: { link: string }) {
  return (
    <EmailLayout preview="An update on your request">
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        An update on your request
      </Heading>
      <Text>A Guide isn&apos;t able to take your request right now. That&apos;s no reflection on you, as Guides have limited time.</Text>
      <Text>Your other matches are still waiting, and you can send a request to another Guide.</Text>
      <Button href={link} style={button}>See other matches</Button>
    </EmailLayout>
  );
}

export function RequestExpiredEmail({ link }: { link: string }) {
  return (
    <EmailLayout preview="Your request wasn't answered in time">
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        Your request wasn&apos;t answered in time
      </Heading>
      <Text>A Guide didn&apos;t respond within 7 days, so the request has closed. You can send a request to another Guide.</Text>
      <Button href={link} style={button}>See other matches</Button>
    </EmailLayout>
  );
}
