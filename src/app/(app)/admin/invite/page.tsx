import { InviteForm } from "./invite-form";

export const metadata = { title: "Invite Guides" };

export default function InvitePage() {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-3xl font-semibold">Invite Guides</h1>
      <p className="text-muted">Each address gets an email with the Guide registration link. Guides still need a valid member ID to register.</p>
      <InviteForm />
    </div>
  );
}
