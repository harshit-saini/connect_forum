export const metadata = { title: "Terms of use" };

export default function Page() {
  return (
    <article className="max-w-2xl space-y-4 pt-8">
      <h1 className="text-3xl font-semibold">Terms of use</h1>
      <p className="text-muted">Placeholder: the final text will be provided before launch. Until then, these are the basics of how connecting works.</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>When a Seeker connects with a Guide, no approval is needed. The Seeker is emailed the Guide&apos;s profile details, plus the Guide&apos;s email address if the Guide opted in to share it and their phone number if the Guide chose to provide one. The Guide is emailed the Seeker&apos;s email address.</li>
        <li>By pressing &ldquo;Email me their details&rdquo;, a Seeker agrees to share their email address with that Guide. Guides decide whether to share their own email address and whether to provide a number. Both are sent to Seekers who connect with you, and you can change either in your profile at any time. Emails already sent can&apos;t be recalled.</li>
        <li>Connect never relays messages. Any conversation happens outside the portal, on the participants&apos; own terms.</li>
        <li>Use an email address or number you receive only to contact the other person about career guidance. Don&apos;t share it or use it for anything else.</li>
        <li>Be respectful. You can block or report anyone from the portal.</li>
      </ul>
    </article>
  );
}
