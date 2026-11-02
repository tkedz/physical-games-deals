# physical-games-deals

A deal finder for collectors of **physical** (boxed) video games. It reads
human-written deal posts from RSS feeds, extracts the deals with an LLM, drops
digital editions and keys, and shows each signed-in user only the deals that
match the games and phrases on their own watchlist.

**Live:** https://physical-games-deals.vercel.app

## What it does

- **`/`**: the public list of every current physical-edition deal, with its
  price, discount, platform and a link to the shop or to the source post. The
  catalogue search sits above the list.
- **`/games/[id]`**: a game's public page, with its catalogue image and every
  listed deal matching it. Signed-in users can watch the game from here,
  optionally pinned to one platform, and remove it from the watchlist for the
  chosen platform („Usuń z listy obserwowanych”).
- **`/my-deals`** (signed in): your watchlist on top, then only the deals
  matching it. You can add a game from the catalogue or a free-text phrase
  for titles the catalogue does not know, edit an entry („Edytuj”: a phrase's
  text and platform, a game's platform) and remove one („Usuń”).
- Accounts use e-mail and password. Each user's watchlist is isolated by
  Postgres row-level security.

The interface is in Polish, for the Polish market.

## How it works

```
RSS feeds ──collect──▶ collected_posts ──extract (LLM)──▶ deals ──match──▶ /my-deals
 (every 4 h, GitHub Actions)          (OpenRouter)                   (SQL view, RLS)
```

1. **Collect.** `.github/workflows/collect.yml` runs every four hours. It reads
   the feeds in `scripts/collector/feeds.json` and appends new posts to
   `public.collected_posts`.
2. **Extract.** In the same job, `scripts/extract/` sends each pending post to
   a model on OpenRouter (`MODELS` in `scripts/extract/config.mts`). It writes
   the deals it finds, each with its edition (physical, digital or unclear)
   and the quote that settles it. Only physical, priced, unexpired game deals
   are listed.
3. **Match.** Matching runs in the database. A deal matches a game entry by
   the game's name and a phrase entry when any of the deal's titles contains
   the phrase, ignoring letter case, diacritics and punctuation. A platform pin
   admits only that platform's offers. `/my-deals` reads the
   `security_invoker` view `public.matched_deals`.
4. **Catalogue.** Game search, names and images come from
   [RAWG](https://rawg.io). The app caches the answers.

## Stack

- **Next.js 16** (App Router, Server Components and Server Actions), React 19,
  TypeScript, Tailwind CSS 4, shadcn/ui on Base UI.
- **Supabase**: Postgres with RLS, and Auth. The schema lives in
  `supabase/migrations/`.
- **OpenRouter** for deal extraction and **RAWG** for the game catalogue.
- **Vercel** for hosting. **GitHub Actions** runs CI, the deploy and the
  scheduled pipeline.
- **Vitest** (with PGlite for database tests) and **Playwright** for tests.

## Running it locally

Requirements: **Node 24** (`.nvmrc`), **Docker** for the local Supabase stack,
and a free [RAWG API key](https://rawg.io/apidocs) for the search and the game
pages.

```bash
npm ci
cp .env.example .env.local   # then fill it in, see below
npm run dev                  # starts the local Supabase stack first, then Next
```

Open http://localhost:3000.

- `npm run dev` runs `npm run local:start` first, which starts Supabase on
  Docker (`supabase start` with the unused services excluded).
- After the first start, run `npx supabase status` **in your own terminal** and
  copy the API URL, the publishable key and the secret key into `.env.local`.
  `.env.example` documents every variable. Never commit `.env.local`, and never
  give a key the `NEXT_PUBLIC_` prefix unless `.env.example` says so.
- `npm run local:reset` rebuilds the local database from the migrations and
  loads `supabase/seed.sql`, a small set of fixture deals. It wipes local data
  and local accounts.
- To see real deals locally, set `OPENROUTER_API_KEY` and run
  `npm run collect`, then `npm run extract`. Extraction calls OpenRouter for
  every pending post, so it costs credits.

## Tests and checks

| Command                | What it runs                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`             | Vitest: unit tests (`tests/unit`), database tests against PGlite built from the migrations (`tests/db`, the matching rule's truth table included), agent-hook tests (`tests/hooks`) |
| `npx playwright test`  | End-to-end tests (`tests/e2e`) against a production build and the local stack. They need `E2E_USERNAME` and `E2E_PASSWORD` for a user created at `/signup` on the local app        |
| `npm run lint`         | ESLint with `--max-warnings 0`                                                                                                                                                  |
| `npm run format:check` | Prettier                                                                                                                                                                        |

CI (`.github/workflows/ci.yml`) runs lint, format and Vitest in `verify`, and
Playwright in `e2e`. The `e2e` job uses a Supabase stack started inside the
runner. `deploy` ships to Vercel only when both pass. A pull request gets a
preview deployment, and a push to `main` goes to production.

## Database changes

Migrations are applied to the hosted project by hand, never from CI:
`npm run db:new -- <name>` → `npm test` → `npm run local:up` →
`npm run db:push -- --dry-run` → `npm run db:push` → `npm run db:check`.
Every new table and function ships locked, with RLS on and privileges revoked,
and is granted only what it needs. `CLAUDE.md` holds the full rules.

## Repository layout

- `src/app/`: routes. `(app)` holds the deals, game pages and `/my-deals`,
  `(auth)` holds sign-in and sign-up, and `kitchen-sink` shows every UI state.
- `src/lib/`: domain logic as pure functions (watchlist rules, deal queries,
  catalogue access).
- `scripts/`: the collector, the extractor and its evaluation gate, and the
  local-stack wrappers.
- `supabase/`: migrations, seed data and SQL checks.
- `context/`: product and planning documents, partly in Polish: the PRD, the
  roadmap, the test plan, and one folder per change under `changes/` and
  `archive/`.
