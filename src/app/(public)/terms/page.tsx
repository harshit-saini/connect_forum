export const metadata = { title: "Terms of use" };

export default function Page() {
  return (
    <article className="max-w-2xl space-y-4 pt-8">
      <h1 className="text-3xl font-semibold">Terms of use</h1>
      <p className="text-muted">Placeholder: the final text will be provided before launch. Until then, these are the basics of how connecting works.</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>When a Seeker connects with a Guide, no approval is needed. The Seeker is emailed the Guide&apos;s profile details, and the Guide&apos;s phone number only if the Guide chose to provide one.</li>
        <li>Guides decide whether to provide a number. A number you provide is emailed to Seekers who connect with you, and you can remove it from your profile at any time.</li>
        <li>Connect never relays messages. Any conversation happens outside the portal, on the participants&apos; own terms.</li>
        <li>Use a number you receive only to contact that Guide about career guidance. Don&apos;t share it or use it for anything else.</li>
        <li>Be respectful. You can block or report anyone from the portal.</li>
      </ul>
    </article>
  );
}
