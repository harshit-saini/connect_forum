# Suggestions (not built)

Ideas that are outside the brief. Nothing here is implemented.

- **Unblock and a block list** in settings. Blocks are permanent today (admins could lift one).
- **Notify a reporter** when an admin has reviewed their report.
- **Guide pending-request list** on the Guide dashboard. Guides review requests only through the emailed link today, because only the token hash is stored; a list would need a session-authenticated review route.
- **Cancel a pending request** from the Seeker side.
- **Email digests** for Guides with several pending requests, and a reminder at day 5 of 7.
- **Multi-language UI** (the taxonomy already uses stable values with separate labels).
- **A matching quality dashboard** for admins (acceptance rate by score band) to tune `src/config/matching.ts`.
- **Move the job queue to QStash/Inngest** if Vercel function time becomes a constraint; the `JobQueue` interface is the seam.
