# Suggestions (not built)

Ideas that are outside the brief. Nothing here is implemented.

- **Unblock and a block list** in settings. Blocks are permanent today (admins could lift one).
- **Notify a reporter** when an admin has reviewed their report.
- **A Guide "connections" list** on the Guide dashboard (anonymous: category and date only), so a Guide can see who was given their details without digging through email.
- **Email digests** for Guides who get several connections in a day, instead of one heads-up each.
- **Opt-in approval for Guides** who want to vet Seekers first (the pre-pilot flow), as a per-Guide setting rather than the default.
- **Per-connection email sharing for Guides**: `shareEmail` is one switch for every Seeker. A Guide who wants to share their address only with some Seekers (or after a first reply) would need a per-connection choice.
- **Per-Seeker share of a Guide's number**: let a Guide choose to share the number only on request, if "emailed to every Seeker who connects" proves too open.
- **Multi-language UI** (the taxonomy already uses stable values with separate labels).
- **A matching quality dashboard** for admins (acceptance rate by score band) to tune `src/config/matching.ts`.
- **Move the job queue to QStash/Inngest** if Vercel function time becomes a constraint; the `JobQueue` interface is the seam.
- **Show the Seeker form inside GACS.world** with an iframe (needs `frame-ancestors` in the CSP in `src/proxy.ts` changed from `'none'`, and a cookie review). The pilot links to `/join/seeker` instead.
- **Manage member IDs in the admin UI** instead of environment variables (add, revoke, see which are used), once the pilot outgrows a list in `.env`.
- **Drop the legacy columns** (`country`, `timezone`, `skills`, `help_needed`, …) and the unused `profile_drafts` table from the database. The pilot migration only adds columns, so nothing is deleted; legacy profiles without a member ID are simply asked to register again.
- **Seeker-side "ask the Guides" for unanswered FAQs**: promote frequent questions that reach Guides into the FAQ list.
