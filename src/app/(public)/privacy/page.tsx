export const metadata = { title: "Privacy policy" };

export default function Page() {
  return (
    <article className="max-w-2xl space-y-4 pt-8">
      <h1 className="text-3xl font-semibold">Privacy policy</h1>
      <p className="text-muted">Placeholder: the final text will be provided before launch. Until then, this is what the portal does with contact details.</p>

      <h2 className="pt-2 text-xl font-semibold">Email addresses</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>When a Seeker connects with a Guide, the two can write to each other. <strong>The Seeker&apos;s email address is shared with the Guide</strong>, and <strong>the Guide&apos;s email address is shared with the Seeker only if the Guide opted in</strong> (a tick box on the Guide form, which a Guide can change at any time in their profile).</li>
        <li>Each address goes in the email we send to the other person. Seekers agree to this each time they press &ldquo;Email me their details&rdquo;. Guides who have not opted in never have their address sent.</li>
        <li>Email is not a private channel. Once an address has been emailed it is in the other person&apos;s mailbox and outside our control, and we can&apos;t take it back. Switching sharing off, or deleting your account, does not recall emails already sent.</li>
        <li>Both sides are asked to use the address only to talk about career guidance and not to pass it on. We never relay messages.</li>
      </ul>

      <h2 className="pt-2 text-xl font-semibold">Guides&apos; phone numbers</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>A phone number is optional for Guides.</li>
        <li>If you provide one, it is stored encrypted, and it is <strong>emailed to every Seeker who connects with you</strong>. A Seeker can also view it again on their connections page.</li>
        <li>Email is not a private channel. Once a number has been emailed it is in the Seeker&apos;s mailbox and outside our control, and we can&apos;t take it back.</li>
        <li>You can remove your number at any time by editing your profile. Removing it deletes it from our systems and stops it being sent to future Seekers. Emails already sent are not recalled.</li>
        <li>If you provide no number and don&apos;t share your email address, Seekers receive only your profile details (role, years of experience, categories and how you can help) and have no direct way to contact you.</li>
      </ul>

      <h2 className="pt-2 text-xl font-semibold">Seekers</h2>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Guides never see your name or phone number. When you connect with a Guide, they are told that someone connected, with your category, your question text, your optional note and <strong>your email address</strong>, so they can write to you.</li>
        <li>Don&apos;t put names, phone numbers or emails in your question or note.</li>
        <li>The Guide&apos;s details are emailed to the address you signed in with. That includes the Guide&apos;s email address if they opted in to share it.</li>
      </ul>

      <h2 className="pt-2 text-xl font-semibold">Your data</h2>
      <p>You can export or delete your data in Settings. Deleting your account also deletes your encrypted phone number, if you have one.</p>
    </article>
  );
}
