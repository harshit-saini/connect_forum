"use client";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { screenText } from "@/lib/screening";
import { submitRatingAction, type RatingActionState } from "@/server/actions/ratings";

const LABELS = ["Not helpful", "Slightly helpful", "Helpful", "Very helpful", "Excellent"];

export function RatingForm({ connectionId, initialScore, initialReview, locked }: { connectionId: string; initialScore?: number; initialReview?: string; locked: boolean }) {
  const [state, action, pending] = useActionState<RatingActionState, FormData>(submitRatingAction.bind(null, connectionId), {});
  const [score, setScore] = useState(initialScore ?? 0);
  const [review, setReview] = useState(initialReview ?? "");
  const hint = screenText(review).errors[0];

  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={locked} className="space-y-2">
        <legend className="text-sm font-medium">Your rating</legend>
        <div role="radiogroup" aria-label="Rating from 1 to 5" className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={`grid size-12 cursor-pointer place-items-center rounded-lg border text-lg font-semibold ${score >= n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
              <input type="radio" name="score" value={n} checked={score === n} onChange={() => setScore(n)} className="sr-only" aria-label={`${n} star${n > 1 ? "s" : ""}: ${LABELS[n - 1]}`} />
              <span aria-hidden>★</span>
            </label>
          ))}
        </div>
        <p className="text-sm text-muted" aria-live="polite">{score ? LABELS[score - 1] : "Choose 1 to 5 stars"}</p>
      </fieldset>
      <div>
        <label htmlFor="review" className="mb-1.5 flex justify-between text-sm font-medium"><span>Review <span className="font-normal text-muted">(optional)</span></span><span className="text-xs font-normal text-muted">{review.length}/600</span></label>
        <textarea id="review" name="review" rows={4} maxLength={600} disabled={locked} value={review} onChange={(e) => setReview(e.target.value)} aria-invalid={Boolean(hint)} placeholder="What was helpful? The Guide never sees this." className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base aria-[invalid=true]:border-danger" />
        {hint && <p role="alert" className="mt-1 text-sm text-danger">{hint}</p>}
      </div>
      <div aria-live="polite">
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.done && <Alert>{state.edited ? "Your rating was updated." : "Thank you. Your rating helps other Seekers."}</Alert>}
      </div>
      {!locked && <Button type="submit" disabled={pending || score === 0 || Boolean(hint)}>{pending ? "Saving…" : initialScore ? "Update rating" : "Submit rating"}</Button>}
    </form>
  );
}
