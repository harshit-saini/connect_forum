import { Card } from "@/components/ui/card";
import { loadReview } from "@/server/connections/service";
import { rateLimit } from "@/server/ratelimit";
import { clientKey } from "@/server/ratelimit/ip";
import { csrfFor } from "@/server/tokens";
import { GuideSafety } from "./guide-safety";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Review a request", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted">{body}</p>
    </Card>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line">{children}</dd>
    </div>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const limited = await rateLimit(`review_view:${await clientKey()}`, 120, 600);
  if (!limited.allowed) return <Message title="Too many attempts" body="Please wait a few minutes and open the link again." />;

  const review = await loadReview(token);
  if (review.state === "invalid") return <Message title="This link isn't valid" body="Check that you opened the full link from your email." />;
  if (review.state === "expired") return <Message title="This request has expired" body="Requests are open for 7 days. The Seeker can send a new one." />;
  if (review.state === "answered") {
    return <Message title="Already answered" body={review.outcome === "approved" ? "You approved this request." : review.outcome === "declined" ? "You declined this request." : "This request is no longer open."} />;
  }

  const s = review.seeker;
  return (
    <div className="mx-auto mt-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{review.seekerName} would like your guidance</h1>
        <p className="mt-1 text-muted">Only their question and career details are shown, never their name. No contact information is shared unless you approve.</p>
      </div>
      <Card>
        <dl className="space-y-4 text-sm">
          <Block label="Category">{s.category}</Block>
          <Block label="Their question">{s.question}</Block>
          <Block label="Experience">{`${s.years} years`}</Block>
          <Block label="Note to you">{review.note}</Block>
        </dl>
      </Card>
      <ReviewForm token={token} csrf={csrfFor(review.tokenHash)} />
      <div className="border-t border-border pt-4">
        <GuideSafety token={token} csrf={csrfFor(review.tokenHash)} name={review.seekerName} />
      </div>
    </div>
  );
}
