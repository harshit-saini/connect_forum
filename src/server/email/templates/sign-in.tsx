import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export function SignInEmail({ otp, link, minutes }: { otp: string; link: string; minutes: number }) {
  return (
    <EmailLayout preview={`Your sign-in code is ${otp}`}>
      <Heading as="h1" style={{ fontSize: 22, margin: "0 0 12px" }}>
        Sign in to Connect
      </Heading>
      <Text>Your one-time code is:</Text>
      <Text style={{ fontSize: 32, fontWeight: 700, letterSpacing: 6, margin: "8px 0 16px" }}>{otp}</Text>
      <Text>
        It expires in {minutes} minutes. If you installed the app, type the code there. Otherwise tap the button to
        open the sign-in page with the code filled in.
      </Text>
      <Button href={link} style={{ backgroundColor: "#0f766e", borderRadius: 8, color: "#fff", padding: "12px 20px" }}>
        Open sign-in page
      </Button>
      <Text style={{ color: "#6b7280", fontSize: 13 }}>Link: {link}</Text>
      <Text style={{ color: "#6b7280", fontSize: 13 }}>Didn&apos;t ask for this? You can safely ignore this email.</Text>
    </EmailLayout>
  );
}
