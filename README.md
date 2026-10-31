# Guni

Adaptive past-paper (PYQ) practice for CBSE Class 12, JEE and NEET. Students take original papers
digitally, get scored with the real marking scheme, upload rough work for step-by-step review, and
see which NCERT concepts to revise.

## Stack

- Next.js (App Router) + TypeScript, hosted on Vercel
- Supabase (Postgres, auth, private file storage), added through the Vercel Marketplace
- Anthropic API for the offline content pipeline (tagging, diagnostic MCQs) and rough-work review

## Principles

- Questions come only from PYQs. AI adds metadata, diagnostic MCQs and reviews, stored separately
  from the originals with model, prompt version and confidence.
- AI picks from a closed taxonomy (loaded by migrations); `src/lib/ai/tagging.ts` rejects anything else.
- Scoring and mastery are plain code (`src/lib/scoring/`), so the same answers always give the same result.

## Layout

| Path | What |
| --- | --- |
| `supabase/migrations/` | Schema, row level security and taxonomies; applied to production on merge |
| `supabase/test/` | Privacy (row level security) checks run in CI |
| `src/lib/scoring/` | Paper scoring for CBSE, JEE Main/Advanced, NEET |
| `src/lib/ai/` | AI output contracts and validation |
| `src/lib/supabase/` | Browser and server clients |

## Development

```bash
npm install
cp .env.example .env.local   # fill in from Vercel → Settings → Environment Variables
npm run dev
npm test
```

## Database changes

Add a new timestamped file to `supabase/migrations/` (never edit one that has been merged).
CI applies every migration to a fresh Postgres and runs `supabase/test/rls_test.sql`; after
merge, the *Migrate database* workflow pushes new migrations to production using the
`SUPABASE_DB_URL` repository secret.
