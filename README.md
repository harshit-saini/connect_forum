# Connect: career guidance matching portal

Next.js (App Router) PWA. Seekers and Guides stay anonymous until a Guide approves a connection.

## Local setup

```bash
pnpm install
cp .env.example .env          # MOCK_AI=true works with no external keys
# Postgres 16 with the pgvector extension (CREATE EXTENSION vector)
pnpm db:migrate
pnpm dev
```

Scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test` (needs `TEST_DATABASE_URL` or the local default), `pnpm db:generate`.

Full deployment docs (Neon, Resend, Foundry, Vercel, key rotation) are completed in the final milestone.
