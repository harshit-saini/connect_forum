export const metadata = { title: "Privacy policy" };

export default function Page() {
  return (
    <article className="max-w-2xl space-y-4 pt-8">
      <h1 className="text-3xl font-semibold">Privacy policy</h1>
      <p className="text-muted">Placeholder: the final text will be provided before launch. Until then, this is what the portal does with contact details.</p>

      <h2 className="pt-2 text-xl font-semibold">Guides&apos; phone numbers</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>A phone number is optional for Guides.</li>
        <li>If you provide one, it is stored encrypted, and it is <strong>emailed to every Seeker who connects with you</strong>. A Seeker can also view it again on their connections page.</li>
        <li>Email is not a private channel. Once a number has been emailed it is in the Seeker&apos;s mailbox and outside our control, and we can&apos;t take it back.</li>
        <li>You can remove your number at any time by editing your profile. Removing it deletes it from our systems and stops it being sent to future Seekers. Emails already sent are not recalled.</li>
        <li>If you provide no number, Seekers receive only your profile details (role, years of experience, categories and how you can help) and have no direct way to contact you.</li>
      </ul>

      <h2 className="pt-2 text-xl font-semibold">Seekers</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Guides never see your name, email or phone number. When you connect with a Guide, they are told that someone connected, with your category and your question text and optional note.</li>
        <li>Don&apos;t put names, phone numbers or emails in your question or note.</li>
        <li>The Guide&apos;s details are emailed to the address you signed in with.</li>
      </ul>

      <h2 className="pt-2 text-xl font-semibold">Your data</h2>
      <p>You can export or delete your data in Settings. Deleting your account also deletes your encrypted phone number, if you have one.</p>
    </article>
  );
}
