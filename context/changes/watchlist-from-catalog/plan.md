# Watchlist from the Catalogue Implementation Plan

## Overview

Roadmap slice S-03 (`watchlist-from-catalog`). A signed-in collector searches the RAWG catalogue as they type and adds a game to their watchlist, with an optional platform. Since 2026-10-06 they can also add a phrase. They see the list and remove entries. A removed entry disappears from their view for good, while its record stays in the data (FR-004).

The list is private:

- Postgres RLS on `auth.uid()` isolates it.
- `/watchlist` sends guests to `/login`.

When the catalogue fails, for any reason, the user sees one generic "temporarily unavailable" message. This is PRD question 6, answered by Tomasz on 2026-10-06.

## Current State Analysis

- **Nothing in the app is private.** `src/lib/auth/access.ts:13-14` says "Nothing is private yet. S-03 adds its private paths here when the first private view arrives."
  - `AccessDecision` can only redirect to `/` (`access.ts:2`).
  - The proxy applies the decision through `redirectTo()` (`src/proxy.ts:15-24`, `src/utils/supabase/session.ts:76`).
- **No table belongs to a user.** Every table is written by `service_role` from GitHub Actions.
  - The only grants to `anon` and `authenticated` are SELECT on `deals` and `pipeline_runs` (`supabase/migrations/20260930061813_create_deals.sql:35`, `20260930061820_create_pipeline_runs.sql:24`).
  - No migration uses `auth.uid()`.
- **The app has no Server Actions and no Route Handlers.**
  - S-02 signs in with the browser client (`src/components/auth/sign-in-form.tsx`).
  - Its plan lists "No Server Actions and no Route Handlers".
- **The RAWG client exists, but no app code calls it.**
  - The contract is `src/lib/catalog/types.ts`, with four failure reasons (`:27-37`).
  - The adapter is `src/lib/catalog/rawg.ts`. `readRawgApiKey` throws when the key is missing (`:36-44`).
  - `RAWG_API_KEY` lives only in `.env.local` (`.env.example:23`).
  - Vercel does not hold it, and `context/deployment/alternative-git-integration.md:110` still says not to add it.
- **Deals use a closed platform vocabulary.**
  - `Platform` is defined in `src/lib/deals/types.ts:17-25`.
  - The deals table mirrors it in a CHECK (`create_deals.sql:13`), and `platformLabel` in `src/lib/deals/format.ts` gives the labels.
  - RAWG differs on three counts (F-03 `coverage.md`): it uses other slugs, folds Switch 2 into Switch, and lists incomplete platforms per game.
- **Deals store titles, not catalogue ids.** The columns are `title`, `english_title` and `alternative_titles` (`create_deals.sql:14-16`). S-04 decides how to match.
- **The design system is shadcn base-nova on Base UI** (`components.json`), with components in `src/components/ui/`.
  - There is no select component yet. The registry ships `native-select` (checked 2026-10-06 with `npx shadcn view native-select`).
  - The kitchen sink (`src/app/kitchen-sink/page.tsx`) renders each state of a view from sample data. It is visible only under `next dev` and on previews (`src/lib/kitchen-sink.ts:11`).
- **The deals view gives the pattern to copy:**
  - a frame without hooks (`src/components/deals/deals-page.tsx`);
  - an async section inside Suspense, next to sync views for results, empty and error (`src/components/deals/deals-section.tsx:35-142`);
  - reads that return result values and log only an error code (`src/lib/deals/queries.ts:95-119`);
  - `loading.tsx` and `error.tsx` beside the page (`src/app/(app)/(deals)/`).
- **The PRD and the roadmap still forbid what was decided.**
  - `prd.md:98` says "Gra nieobecna w katalogu nie może zostać dodana do listy obserwowanych".
  - Roadmap questions 6 and 9 are open, and S-03 reads `blocked` (`roadmap.md:64`).

## Desired End State

- **Search.** A signed-in user opens `/watchlist` from a link in the header and types a title.
  - Once the query has three or more characters, results appear after a pause: up to 10 catalogue games.
  - Enter searches any non-empty query.
  - Each result can be watched with the platform chosen in the form, or with "any platform".
  - A result already on the list for that platform shows as such.
- **Phrases.** The same search offers to watch the typed text as a phrase, when the text has three or more characters. The offer also appears when the catalogue found nothing, or failed.
- **The list** shows active entries, newest first.
  - A game shows its name and release year; a phrase shows the phrase.
  - Each entry shows its platform or "Dowolna platforma", plus a remove button.
- **Removal.** A removed entry disappears from the view. Its row stays with `removed_at` set, and the same entry can be added again.
- **Duplicates.** One active entry per game and platform, where "no platform" counts as one value. Phrases follow the same rule, compared ignoring letter case and surrounding spaces.
- **Access and isolation.** A guest who opens `/watchlist` lands on `/login`. Another user can neither read nor change the list, whether through the UI, a forged request, or SQL run as `authenticated`.
- **Catalogue failure.** An outage, a timeout, a rate limit, a bad key and a malformed body all show the same generic message.
  - The list keeps working.
  - The server log carries the reason and the status, never a URL.
- **Records and production.** The PRD, the roadmap, CLAUDE.md and the deployment docs say all of the above. `RAWG_API_KEY` is set in Vercel for Production and Preview, and the demo account has a prepared watchlist.

Verification: the Phase 1 SQL checks, the Phase 3 acceptance in dev, and the Phase 4 acceptance on production.

### Key Discoveries:

- **Private paths are registered in one place, `decideAccess`.** Checks in a layout cannot protect a view (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1352`). Every redirect must go through `redirectTo()` (CLAUDE.md, Supabase).
- **Server Actions are public POST endpoints.**
  - Authenticate and validate inside each one (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:87-95`, `data-security.md:337-393`).
  - Return expected errors as values for `useActionState` (`01-app/01-getting-started/10-error-handling.md:17-25`).
  - Call `redirect()` outside any `try` (`01-app/03-api-reference/04-functions/redirect.md:51-53`).
  - `refresh()` from `next/cache` re-renders the current route, and it works only inside Server Actions (`04-functions/refresh.md`).
- **`next/form` fits the URL-driven search.** With a string `action=""` it submits as GET into search params on the same route, and it has `replace` and `scroll` props (`01-app/03-api-reference/02-components/form.md:86-133`). Navigation is interruptible (`01-app/01-getting-started/04-linking-and-navigating.md:147`), so a newer search supersedes an older one without any race handling on the client.
- **App code runs as `anon` or `authenticated`.** Vercel holds only the publishable key (`context/foundation/infrastructure.md:146`). A table owned by users therefore needs grants and policies for `authenticated`, and nothing for `service_role`.
- **The revoke-then-grant pair is required.** Supabase stops granting new tables automatically on 2026-10-30, and the pair gives the same privileges on both sides of that date (CLAUDE.md, Database migrations).
- **Postgres 17 supports `nulls not distinct`** (`supabase/config.toml:41`). A unique index can therefore treat "any platform" (null) as one value.
- **A missing RAWG key throws.** `readRawgApiKey` throws instead of returning a result (`src/lib/catalog/rawg.ts:36-44`). App code must catch it and treat it as `misconfigured`.
- **The Next-only wrapper lives outside `src/lib/catalog/`.** Node also loads the files in that folder, so the wrapper sits elsewhere with its `server-only` import (CLAUDE.md, Game catalogue).
- **New buttons avoid the outline and destructive variants.** Their focus indicator is below 3:1 (`context/changes/ui-init/change.md:14-26`). The header already avoids them (`src/app/(app)/layout.tsx:12-16`).
- **Dev and previews use the production Supabase project** (`infrastructure.md:110`). The kitchen sink must therefore never reach Supabase or RAWG.

## What We're NOT Doing

- **No deal matching.** S-04 consumes the watchlist, and `/` stays as it is.
- **No return to `/watchlist` after sign-in.**
  - S-02 deferred the `next` parameter to S-03 (`context/changes/email-password-accounts/plan.md:112`).
  - There is one private view, and the header link is one click away. Sign-in keeps landing on `/`, which leaves no open-redirect surface.
- **No editing of an entry's platform.** To change it, remove the entry and add it again.
- **No confirmation dialog and no undo for removal.** Re-adding is one search away.
- **No images from RAWG.** `imageUrl` is "Background art, not a box cover" (`src/lib/catalog/types.ts:23-24`).
- **No per-game platform list from RAWG.** The pin uses the fixed list of seven platforms (Tomasz, 2026-10-06).
- **No caching, throttling or retries of catalogue calls.** Each automatic search costs one RAWG request, and so does each add or removal while results are open (Performance Considerations).
- **No pagination of the watchlist or of the results.** Results stop at 10, and a personal list stays in the tens of entries.
- **No view of removed entries and no restore.**
- **No separate Supabase project for previews and dev** (`deploy-plan.md:87`, as in S-02).
- **No test runner** (CLAUDE.md, Verification). The pure module is shaped for one.
- **No fix for the focus indicator on outline and destructive buttons.** ui-init deferred it.
- **No change to the roadmap status of F-03 or S-02.** `/10x-archive` closes those.

## Implementation Approach

Four phases. Each ends in something that can be checked on its own:

1. **Decisions on record and the locked table.** The PRD and the roadmap say what was decided before any code depends on it. The migration ships with its RLS, and SQL run as `anon` and `authenticated` proves it before the app writes a single row.
2. **Views first, in the kitchen sink.** Every state of the search and the list renders from sample data with inert actions. The split follows the deals view: sync views now, async sections later.
3. **The private view, end to end.** The phase adds the access rule, a server-only catalogue search, the queries and three Server Actions, then the page that wires them. It is accepted in dev with two accounts and a broken key.
4. **Production.** The key goes to Vercel before the merge, the deployment docs follow, and acceptance runs on production with the demo account.

**Search state lives in the URL** (`/watchlist?q=…&platform=…`).

- A `next/form` GET form submits itself in three cases: 300 ms after the last keystroke, once the query has three or more characters; when the query is cleared; and when the platform changes.
- Enter submits any non-empty query.
- The page renders results on the server, inside a Suspense boundary keyed by the search, so the router discards superseded searches.

Adds and removals are Server Actions posted from small client buttons (`useActionState`). On success they call `refresh()`.

## Critical Implementation Details

### State sequencing

- **The select policy is owner-only and must not filter `removed_at`.** An update that sets `removed_at` needs the row visible to the SELECT policies: its WHERE reads columns, and an update that returns rows also checks the new row. If SELECT hid removed rows, every removal would fail with an RLS violation. FR-004's "disappears from their view" is the view's filter (`removed_at is null`), not the policy's.
- **No client can name an owner.** `user_id` defaults to `auth.uid()`, and `authenticated` has no INSERT privilege on that column. The insert policy still checks `user_id = (select auth.uid())`.

### User experience spec

- **Typing is never interrupted.** The query input is uncontrolled (`defaultValue` from `q`), and the form keeps a stable position above the Suspense boundaries. A results navigation therefore never resets or re-focuses what the user is typing.
- **Every server entry point re-checks the user before touching RAWG or the database.** The proxy redirect is optimistic, and `anon` has no grant on the table, so an unchecked read would show an error state instead of a redirect. Sections render nothing without a user; actions call `redirect("/login")`.

### Debug & observability

- **The catalogue wrapper logs only the reason and the status.** Never the URL, the error object or a response body, because the request URL carries the key (CLAUDE.md, Game catalogue).

## Phase 1: Decisions on record and the locked watchlist table

### Overview

This phase:

- records Tomasz's 2026-10-06 answers in the PRD and the roadmap;
- writes the rule for tables that users write themselves into CLAUDE.md;
- ships `public.watchlist_entries` locked, with owner-only access for `authenticated`.

Tomasz applies the migration and proves the isolation in SQL before any app code exists.

### Changes Required:

#### 1. PRD: the phrase ruling and the answered questions

**File**: `context/foundation/prd.md`

**Intent**: Make the PRD state what Tomasz decided on 2026-10-06: a watchlist holds catalogue games and phrases, and question 6 has an answer. The edits are in Polish, like the rest of the file. The PRD also records the answer to question 7, which the roadmap already carries.

**Contract**:

- **`## Business Logic`, `:96`.** The second input becomes "zbiór gier wybranych z katalogu i fraz, każda pozycja z opcjonalnie wskazaną platformą".
- **`:98`.** Keep the sentences on catalogue identity for games. Replace the last sentence ("Gra nieobecna w katalogu nie może zostać dodana…") with the phrase rule:
  - besides catalogue games, the list accepts phrases;
  - a phrase entry matches a deal when any of the deal's titles contains the phrase, regardless of letter case and Polish diacritics;
  - a phrase has no catalogue identity, so a typo silently matches nothing. That is the accepted cost of watching games the catalogue does not know (new releases), or broader phrases;
  - decided 2026-10-06 (roadmap question 9).
- **`:100`.** The second decision reads "czy okazja dotyczy gry albo frazy z listy obserwowanych…", and the platform rule applies to both kinds.
- **`### Lista obserwowanych`.**
  - FR-004 (`:71`) says "pozycję (grę albo frazę)".
  - A new requirement, with a one-line note that it was decided on 2026-10-06: "FR-010: Użytkownik może dodać do listy obserwowanych frazę, opcjonalnie wskazując platformę; fraza pasuje do okazji, której którykolwiek tytuł ją zawiera, bez względu na wielkość liter i polskie znaki. Priority: must-have".
- **`## Open Questions`.**
  - Question 6 (`:125`) gains "**Rozstrzygnięte 2026-10-06:**": whatever the reason, one generic message says the catalogue is temporarily unavailable. The list keeps working, and the typed phrase can still be watched.
  - Question 7 (`:126`) gains "**Rozstrzygnięte 2026-09-26:** PASS", with the coverage result and a link to `context/changes/game-catalog-provider-proven/coverage.md`.
- **No version bump**, as with the 2026-10-06 answers to questions 2 and 3.

#### 2. Roadmap: S-03 unblocked and reshaped, S-04 told what a phrase means

**File**: `context/foundation/roadmap.md`

**Intent**: Close the two questions and carry the phrase decision into the slices it changes. S-04's planning then starts from the definition instead of rediscovering it.

**Contract**:

- **Open Roadmap Questions 6 and 9 (`:209`, `:212`)** gain "**Answered 2026-10-06:**" with the decisions. For question 9: phrases join S-03 as a second kind of entry, defined as in the PRD.
- **`## At a glance`.**
  - S-03's outcome (`:64`) reads "search the catalogue, add a game or a phrase to a watchlist, remove one".
  - S-04's outcome (`:65`) mentions phrases.
- **S-03 body.**
  - The Outcome (`:164`) adds phrases.
  - The question-6 unknown gains its answer.
  - The Risk (`:173`) gains "Unblocked 2026-10-06: question 6 answered, question 7 resolved by F-03."
- **S-04 body.**
  - The Outcome (`:178`) reads "games and phrases on their watchlist".
  - A new unknown, answered: a phrase matches when it occurs in `title`, `english_title` or any entry of `alternative_titles`, ignoring letter case and Polish diacritics. The platform rule applies as it does for games. `ł` has no Unicode decomposition, so diacritic folding must map it explicitly.
- **Backlog Handoff S-03 row (`:199`).** Ready: `yes`. Note: "Planned 2026-10-07: `context/changes/watchlist-from-catalog/plan.md`".
- **Vision recap (`:40`).** The differentiator stays "matched to this user's own list". "Not to keywords or categories" becomes catalogue titles, plus phrases of the user's own where the catalogue falls short, not shared categories.
- **Status fields and frontmatter.** Status fields stay as they are: `/10x-plan` has set S-03 to `planning`, and `/10x-implement` moves it on. Frontmatter `updated` moves to the day of the edit.

#### 3. CLAUDE.md: the rule for a table users write themselves

**File**: `CLAUDE.md`

**Intent**: The rule for locked tables (`:47`) covers only writers holding `service_role`, and select policies. Record the user-owned variant this table introduces, as a fact.

**Contract**: One sentence appended to `:47`. A table that signed-in users write themselves (`public.watchlist_entries`):

- grants `authenticated` only the columns it writes;
- takes `user_id` from `default auth.uid()`;
- pins every policy to `(select auth.uid())`;
- grants `anon` and `service_role` nothing.

#### 4. Migration: `public.watchlist_entries`

**File**: `supabase/migrations/<timestamp>_create_watchlist_entries.sql`, created with `npm run db:new -- create_watchlist_entries`

**Intent**: The table, locked by default, with owner-only read, insert and soft removal for `authenticated`, and with active entries kept unique. Isolation and the duplicate rule then hold in the database, not in app code.

**Contract**:

- **Header:** `-- Revert: drop table public.watchlist_entries;` and `-- Backward-compatible with the previous deployment: yes — new table, no deployed code reads it.`
- **Columns:**

  | Column | Definition | Meaning |
  | --- | --- | --- |
  | `id` | `bigint generated always as identity primary key` | |
  | `user_id` | `uuid not null default auth.uid() references auth.users (id) on delete cascade` | |
  | `kind` | `text not null check (kind in ('game', 'phrase'))` | |
  | `game_id` | `integer check (game_id > 0)` | the RAWG id |
  | `game_slug` | `text` | |
  | `game_name` | `text` | |
  | `game_released` | `date` | |
  | `phrase` | `text` | |
  | `platform` | `text check (platform in ('ps5', 'ps4', 'xbox-series', 'xbox-one', 'switch', 'switch-2', 'pc'))` | the deals vocabulary without `other`; null means any platform |
  | `created_at` | `timestamptz not null default now()` | |
  | `removed_at` | `timestamptz` | |

- **Shape check.**
  - A `game` row has `game_id`, `game_slug` and `game_name`, and no `phrase`.
  - A `phrase` row has a `phrase` and no game columns.
  - A phrase is trimmed and has 3–100 characters.
- **Uniqueness of active entries**, with `nulls not distinct` so that "any platform" is one value. Plus a plain index on `user_id` for the policies.
- **Posture.**
  - `enable row level security`, then `revoke all … from anon, authenticated, service_role`.
  - `grant select`, `grant insert` on the seven writable columns, and `grant update (removed_at)` to `authenticated`.
  - Nothing for `anon` or `service_role`, and no delete for anyone.
- **Policies,** each `to authenticated` on `(select auth.uid()) = user_id`:
  - select: owner, removed rows included;
  - insert: owner, in `with check`;
  - update: `using` the owner and `removed_at is null`, `with check` the owner and `removed_at is not null`. A removal can be made, not undone.
- **A justification comment**, like `create_deals.sql:38-47`:
  - Vercel's Server Components and Server Actions hold only the publishable key plus the user's session, so they act as `authenticated` (`infrastructure.md:146`);
  - RLS is the isolation boundary (PRD guardrail);
  - no delete, because FR-004 keeps the record;
  - `platform` mirrors `src/lib/deals/types.ts` without `other`.
- **Table and column comments** in the style of `create_deals.sql:52-83`:
  - `removed_at`: hidden from the view from this instant, kept as the record that the user tracked the entry;
  - `game_name`: the catalogue's name at the time of adding, not refreshed.
- **The non-obvious parts:**

```sql
create unique index watchlist_entries_active_game
  on public.watchlist_entries (user_id, game_id, platform) nulls not distinct
  where kind = 'game' and removed_at is null;

create unique index watchlist_entries_active_phrase
  on public.watchlist_entries (user_id, lower(phrase), platform) nulls not distinct
  where kind = 'phrase' and removed_at is null;

grant insert (kind, game_id, game_slug, game_name, game_released, phrase, platform)
  on table public.watchlist_entries to authenticated;
grant update (removed_at) on table public.watchlist_entries to authenticated;

create policy "owners remove their entries" on public.watchlist_entries
  for update to authenticated
  using ((select auth.uid()) = user_id and removed_at is null)
  with check ((select auth.uid()) = user_id and removed_at is not null);
```

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run format:check` pass
- After Tomasz's push, `npx supabase gen types typescript --linked --schema public` lists `watchlist_entries` with the planned columns and nullability

#### Manual Verification:

- Tomasz runs `npm run db:push -- --dry-run` (only the new migration listed), `npm run db:push`, `npm run db:check` (exit 0) and `npm run db:status` (local and remote match)
- Tomasz's grants query on `information_schema.role_table_grants` and `information_schema.column_privileges` shows `authenticated` with SELECT, INSERT on the seven writable columns and UPDATE on `removed_at` only, and no privilege for `anon` or `service_role`
- Tomasz's isolation script — one transaction, rolled back, acting as two real user ids through `set local role` and `request.jwt.claims` — proves that: inserts as user A succeed, which also shows the identity column needs no sequence grant; a second active entry for the same game and platform, and a phrase differing only in case, fail with `23505`; the same game with another platform succeeds; user B reads none of A's rows, updates 0 of them and cannot insert with A's `user_id` (`42501`); `anon` cannot select (`42501`); A can set `removed_at`, cannot clear it, and can then add the same entry again
- Tomasz reads the PRD and roadmap changes and confirms they say what he decided

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Watchlist views in the kitchen sink

### Overview

Build every visible state of the search and the list from sample data, before any of it reads RAWG or Supabase. The phase adds a pure module for the vocabulary and the rules, the platform select from the registry, and the components.

### Changes Required:

#### 1. Platform select from the registry

**File**: `src/components/ui/native-select.tsx`

**Intent**: A platform choice that submits with a plain GET form and works without JavaScript. It comes from the design system already in use.

**Contract**:

- Added with `npx shadcn add native-select` (base-nova). It uses `cn`, the existing tokens and a lucide chevron.
- Kept as the registry ships it.
- `package.json`, `components.json` and `globals.css` stay unchanged.

#### 2. Watchlist rules, as pure functions

**File**: `src/lib/watchlist/rules.ts`, with the types in `src/lib/watchlist/types.ts`

**Intent**: Every decision the view and the actions share, as pure functions of data (lessons.md, "Separate logic from I/O and from components before tests arrive"):

- which platforms can be pinned;
- how the URL's search state parses;
- when a query can become a phrase;
- what counts as already on the list;
- the shapes the actions accept.

**Contract**:

- **Pinnable platforms.**
  - `PinnablePlatform = Exclude<Platform, "other">`.
  - `PINNABLE_PLATFORMS`, ordered PS5, PS4, Xbox Series X|S, Xbox One, Switch, Switch 2, PC, and tied to `Platform` with `satisfies`.
  - Labels come from `platformLabel` (`src/lib/deals/format.ts`); null reads "Dowolna platforma".
- **`parseSearchState(searchParams) → { query: string | null; platform: PinnablePlatform | null }`.**
  - The query is trimmed, cut to 100 characters, and null when empty.
  - An unknown or empty platform is null.
  - Like `parsePage` (`src/lib/deals/page.ts:23-29`), bad input is clamped, never answered with a 404.
- **`toPhrase(query) → string | null`.** The trimmed query when it has 3–100 characters, otherwise null. This matches the database check.
- **`isGameOnList(entries, gameId, platform)` and `isPhraseOnList(entries, phrase, platform)`** implement the duplicate rule: the same game id, or the same phrase ignoring case and surrounding spaces, with the same platform. Null equals null.
- **zod 4 schemas for the form data of the three actions:**
  - game: `gameId` positive integer, `gameSlug`, `gameName` of 1–200 characters, and `gameReleased` as `YYYY-MM-DD` or empty;
  - phrase: as `toPhrase`;
  - removal: `entryId` positive integer;
  - each with `platform` parsed as above.
- **`WatchlistEntry`**, a union of the game and phrase row shapes.

#### 3. Watchlist components

**Files**: `src/components/watchlist/`:

- `watchlist-page.tsx`
- `catalog-search-form.tsx`
- `search-results.tsx`
- `search-result-row.tsx`
- `phrase-offer.tsx`
- `watchlist-entries.tsx`
- `watchlist-entry-row.tsx`
- `entry-action-button.tsx`
- `rawg-attribution.tsx`

**Intent**: The pieces of the view, split like the deals view:

- a frame without hooks or server imports, so that `error.tsx` can render it;
- sync views for every outcome, which the kitchen sink renders;
- small client parts only where interaction needs them.

The async sections that fetch come in Phase 3.

**Contract**:

- **`WatchlistPage`** is a `<main>` like `DealsPage` (`src/components/deals/deals-page.tsx:12-27`), with the heading "Lista obserwowanych" and a one-sentence intro.
- **`CatalogSearchForm`** (`"use client"`) is a `next/form` with `action=""`, `replace` and `scroll={false}`.
  - Fields: a labelled `Input` with `name="q"`, `type="search"`, `autoComplete="off"` and a 100-character limit; a `NativeSelect` with `name="platform"`, offering "Dowolna platforma" plus the seven platforms; and a visible "Szukaj" button.
  - With JavaScript, it submits itself in three cases: 300 ms after the last keystroke, when the trimmed query has 3 or more characters; when the query is cleared; and when the platform changes.
  - Enter submits any non-empty query.
  - The input is uncontrolled.
- **The sync views in `search-results.tsx`:**
  - `SearchResultsList`: the rows, plus the phrase offer.
  - `SearchNoResults`: an `Empty` with "Nie znaleźliśmy tej gry w katalogu" and a hint to try the English title (F-03 handoff), plus the phrase offer.
  - `CatalogUnavailable`: a destructive `Alert` with "Katalog gier jest chwilowo niedostępny" and "Spróbuj ponownie za chwilę.", plus the phrase offer.
  - `SearchResultsSkeleton`: `role="status"`, with "Szukamy w katalogu…".
  - Without a query, nothing renders.
- **`SearchResultRow`** shows the game's name, its release year and the catalogue's platform names, as information. Its button reads "Obserwuj", or "Na liście" (disabled) when `isGameOnList` holds for the chosen platform.
- **`PhraseOffer`** shows only when `toPhrase(query)` is not null.
  - Its button reads "Obserwuj frazę „…”", with one line that states the rule: the phrase matches deals whose title contains it, regardless of letter case and Polish characters.
  - When the phrase is already on the list, it reads "Ta fraza jest już na liście" instead.
- **The sync views in `watchlist-entries.tsx`:**
  - `WatchlistEntries`: newest first.
  - `WatchlistEmpty`: "Twoja lista jest pusta", with a pointer to the search.
  - `WatchlistError`: like `DealsError` (`src/components/deals/deals-section.tsx:131-142`), with the retry button.
  - `WatchlistSkeleton`.
- **`WatchlistEntryRow`** shows either a game (name, year) or a phrase („…” with a "Fraza" badge). Then the platform badge or "Dowolna platforma", and "Usuń": ghost or secondary, never destructive or outline.
- **`EntryActionButton`** (`"use client"`) is a form with hidden fields and `useActionState`.
  - While pending, it shows "Dodawanie…" or "Usuwanie…".
  - It shows the action's message in a `role="alert"` line.
  - Without an action it renders the same button inert, and it accepts an initial message, so the kitchen sink can show the failure state.
- **`RawgAttribution`** is an active link to `https://rawg.io` ("Dane gier: RAWG"). It opens in a new tab with the sr-only note from `deal-card.tsx:48-58`, and has no `nofollow`.

#### 4. Kitchen sink section

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: The visual gate (CLAUDE.md, Module 2, Lesson 5). One section renders every named state from fixed sample data, so the screenshots review the whole view before it is wired.

**Contract**: A "Lista obserwowanych" section after "Okazje", with one h3 sub-block per state:

- the search form;
- results, with one row that can be added and one already on the list;
- a failed add;
- no results;
- the catalogue unavailable;
- a two-character query, with no phrase offer;
- loading;
- a list with a game on any platform, a game pinned to PS5, a phrase on any platform and a pinned phrase;
- an empty list;
- a list error;
- the attribution.

No action, fetch or client in the section reaches Supabase or RAWG.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero warnings
- `npm run format:check` passes
- `npm run build` succeeds with `/kitchen-sink` still prerendered as not found
- `git status --porcelain src/components/ui` lists only `native-select.tsx` as new, and `git diff --quiet -- package.json package-lock.json components.json src/app/globals.css` exits 0
- `grep -rEn '(zinc|slate|gray|neutral|stone)-[0-9]|(bg|text|border)-(black|white)|#[0-9a-fA-F]{3,8}\b' src/app src/components/watchlist --include=*.tsx` prints nothing

#### Manual Verification:

- With `npm run dev` started by Tomasz, screenshots of the kitchen sink's "Lista obserwowanych" section at 1280 px and 375 px, saved to `context/changes/watchlist-from-catalog/screenshots/`, show every state with no horizontal scroll
- Tab reaches the query field, the platform select and every enabled button in order, each with a visible focus indicator
- Tomasz reads the Polish copy of every state and accepts it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: The private `/watchlist` view, end to end

### Overview

This phase:

- makes `/watchlist` private;
- puts the catalogue behind a server-only search that never leaks its URL;
- adds the queries and the Server Actions;
- wires the page with the live search.

It is accepted in dev with two accounts and a broken key.

### Changes Required:

#### 1. Access rule

**File**: `src/lib/auth/access.ts`

**Intent**: The first private path, as S-02 left it (`context/changes/email-password-accounts/plan.md:110-111`). A guest who opens `/watchlist` is sent to `/login`; signed-in users pass.

**Contract**:

- The redirect target of `AccessDecision` widens to `"/" | "/login"`.
- A `PRIVATE_PAGES` set holds the exact path `/watchlist`. Matching is exact and case-sensitive, like `AUTH_PAGES`.
- Signed out on a private page returns `{ kind: "redirect", to: "/login" }`.
- The doc comment drops "Nothing is private yet".
- `src/proxy.ts` stays unchanged: it already applies any decision through `redirectTo()`.
- Wording that stops being true changes with it:
  - the `src/lib/auth/current-user.ts:8` docstring ("every view is public"), while the helper itself still never redirects;
  - `CLAUDE.md:24`, which gains that the proxy also sends signed-out users from `/watchlist` to `/login`.

#### 2. Catalogue search on the server

**File**: `src/lib/watchlist/catalog.ts`

**Intent**: The app's composition root for the catalogue. It reads the key, builds the RAWG client, and turns every failure into a result value, which the view shows as one generic message. The operator still learns the reason from the log.

**Contract**:

- `import "server-only"`.
- `searchCatalog(query: string): Promise<CatalogResult<CatalogGame[]>>`:
  - calls `readRawgApiKey(process.env)` inside `try`; a missing key becomes `{ ok: false, reason: "misconfigured", status: null }`;
  - builds the client with `createRawgCatalog({ apiKey, fetch })`;
  - calls `searchGames(query, { limit: 10 })`, leaving `exclude_additions` off (F-03 handoff);
  - on failure, logs the reason and the status only, with `console.error`.
- It lives outside `src/lib/catalog/` because it is Next-only (CLAUDE.md, Game catalogue).

#### 3. Watchlist reads and writes

**Files**: `src/lib/watchlist/queries.ts`, `src/lib/watchlist/current-entries.ts`

**Intent**: Database access in the shape of `src/lib/deals/queries.ts`: the client is passed in, rows are checked with zod, results are values, and only an error code reaches the log.

**Contract**:

- `loadActiveEntries(client)` returns the active entries (`removed_at is null`), ordered by `created_at desc, id desc`.
- `insertGameEntry(client, input)` and `insertPhraseEntry(client, input)` return `ok`, `duplicate` (Postgres `23505`) or `failed`. They never send `user_id`.
- `markEntryRemoved(client, entryId)` sets `removed_at` where the `id` matches and `removed_at is null`. Zero rows counts as done: the entry was already removed, or it is not the caller's, and RLS hides it.
- `current-entries.ts` (`server-only`) exports `getActiveEntries`, wrapped in React `cache` like `getCurrentUser` (`src/lib/auth/current-user.ts:19`). The list and the search's "on the list" checks then share one query per render.

#### 4. Server Actions

**File**: `src/app/(app)/watchlist/actions.ts`

**Intent**: The three mutations, kept thin: check who is asking, check the input, write, refresh.

**Contract**:

- `"use server"`, with three actions: `addGameEntry`, `addPhraseEntry` and `removeEntry`.
- Each has the signature `(prevState, formData) → Promise<{ message: string | null }>`, for `useActionState`.
- Each action:
  1. calls `getCurrentUser()`; without a user, it calls `redirect("/login")`, outside any `try`;
  2. parses the form data with the Phase 2 schemas; invalid input returns "Coś poszło nie tak. Spróbuj ponownie.";
  3. calls the query with a fresh `createClient()`;
  4. returns the result: `duplicate` gives "Ta pozycja jest już na liście.", `failed` gives "Nie udało się zapisać zmiany. Spróbuj ponownie.", and success calls `refresh()` and returns `{ message: null }`.

#### 5. The page and its sections

**Files**:

- `src/app/(app)/watchlist/page.tsx`, `loading.tsx` and `error.tsx`;
- async sections added to `src/components/watchlist/search-results.tsx` and `watchlist-entries.tsx`.

**Intent**: Wire the Phase 2 views to real data. The shell stays instant, and every slow read sits inside Suspense.

**Contract**:

- **`page.tsx`** takes `PageProps<"/watchlist">`, awaits `searchParams` and calls `parseSearchState`. It renders `WatchlistPage` with:
  - `CatalogSearchForm`, its defaults taken from the state;
  - `<Suspense key={`${query}|${platform}`} fallback={<SearchResultsSkeleton />}>` around `SearchResultsSection`;
  - `RawgAttribution`;
  - `<Suspense fallback={<WatchlistSkeleton />}>` around `WatchlistSection`;
  - the metadata title "Lista obserwowanych".
- **`SearchResultsSection`** renders nothing without a query, and nothing without a user. Otherwise it runs `searchCatalog` and `getActiveEntries` in parallel and renders one of the sync views. The action buttons get the real actions.
- **`WatchlistSection`** renders nothing without a user. Otherwise it calls `getActiveEntries` and renders `WatchlistEntries`, `WatchlistEmpty` or `WatchlistError`.
- **`loading.tsx` and `error.tsx`** mirror `src/app/(app)/(deals)/`: fixed copy and `retry`.

#### 6. Header link

**File**: `src/app/(app)/layout.tsx`

**Intent**: A way to the list, for signed-in users only.

**Contract**: An "Obserwowane" link to `/watchlist`, in the signed-in branch of `HeaderAuth` (`:42-48`), before the e-mail. It uses `buttonVariants({ variant: "ghost" })`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with zero warnings
- `npm run format:check` passes
- `npm run build` succeeds and lists `/watchlist` as a dynamic route
- `grep -rn "NEXT_PUBLIC_RAWG" src` prints nothing, and `grep -ln "server-only" src/lib/watchlist/catalog.ts src/lib/watchlist/current-entries.ts` lists both files
- With Tomasz's `npm run dev` running and no session, `curl -sI http://localhost:3000/watchlist` answers `307` with `location: /login`

#### Manual Verification:

- Signed in under `npm run dev`: typing "silent hill" shows results after a pause without interrupting the typing; Enter on "Ys" searches; the browser's Back button leaves `/watchlist` instead of stepping through earlier queries
- Duplicate rule for games: Silent Hill 2 with PS5 is added and shows at the top of the list; adding it again with PS5 is blocked ("Na liście"), and when forced from a second tab opened earlier it shows "Ta pozycja jest już na liście."; Silent Hill 2 with any platform is added beside it
- Phrases: "Fire Emblem" is added from the search; "fire emblem " is then reported as already on the list; a two-character query offers no phrase
- Removal: a removed entry disappears from the list and can be added again
- Isolation: a second test account sees an empty list, and its entries never appear for the first account
- Failure path: with `RAWG_API_KEY` overridden to an invalid value for one `npm run dev` (`$env:RAWG_API_KEY="invalid"` in PowerShell — `.env.local` is never opened), a search shows "Katalog gier jest chwilowo niedostępny" with the phrase offer, the list still loads, and the terminal logs the reason and the status without a URL
- Signed out, the header shows no "Obserwowane" link; screenshots of the live view, signed in, at 1280 px and 375 px are saved to `context/changes/watchlist-from-catalog/screenshots/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Production and records

### Overview

Give production the key, bring the deployment docs and the rules in line, merge, and accept the slice on production with the demo account.

### Changes Required:

#### 1. `RAWG_API_KEY` on Vercel

**Intent**: Search needs the key at runtime, on Production and on Preview.

**Contract**:

- Before the merge, Tomasz adds `RAWG_API_KEY` in Vercel's project settings, for Production and Preview. It is server-only and never takes the `NEXT_PUBLIC_` prefix.
- The agent checks the names with `vercel env ls`, which is read-only and allowed unattended (`infrastructure.md:114`).
- The value never enters the conversation.

#### 2. Deployment docs and rules

**Files**:

- `.env.example`
- `context/foundation/infrastructure.md`
- `context/deployment/deploy-plan.md`
- `context/deployment/alternative-git-integration.md`
- `CLAUDE.md`

**Intent**: Every place that lists where secrets live says the key is now on Vercel.

**Contract**:

- **`.env.example:23`:** on Vercel (Production, Preview) since S-03, and server-only. Whether the pipeline needs the key stays S-04's call.
- **`infrastructure.md:111` (Secrets) and `:146` (Setup 4):** add `RAWG_API_KEY` as a runtime, server-only variable on Production and Preview.
- **`deploy-plan.md`, "Where each secret lives" (`:76-85`):** a row for the key.
- **`alternative-git-integration.md:110`:** move `RAWG_API_KEY` from "do not add" to the variables to add.
- **`CLAUDE.md`, Game catalogue (`:31`):** where the key lives, worded like the OpenRouter line (`:38`).

#### 3. Merge and acceptance

**Intent**: Prove the slice on production, and leave the demo account a watchlist to show (the PRD's note on FR-001; roadmap S-02).

**Contract**:

- Tomasz merges to `main`, and CI deploys.
- Departures from this plan go into `change.md` in the commit that makes them (lessons.md).

### Success Criteria:

#### Automated Verification:

- `vercel env ls` lists `RAWG_API_KEY` for Production and Preview
- `npm run lint` and `npm run format:check` pass
- `curl -sI https://physical-games-deals.vercel.app/watchlist` answers `307` with `location: /login`
- `vercel logs` for the production deployment, read after the acceptance searches, contains neither `api.rawg.io` nor `key=`

#### Manual Verification:

- Tomasz signs in to production with the demo account and builds its watchlist through the UI — at least three games, one of them pinned to a platform, and one phrase — and the rawg.io link is visible
- A second, temporary account on production sees an empty list; Tomasz's SQL check (the read parts of the Phase 1 script, rolled back) shows it reads none of the demo account's rows; the temporary account is deleted afterwards
- After more than an hour idle, opening `/watchlist` from the address bar keeps the session, with no redirect to `/login`
- Live search, adding, the duplicate message and removal work on production as they did in Phase 3

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

There is no test runner (CLAUDE.md). The pure functions in `src/lib/watchlist/rules.ts` are what a runner would cover first:

- `parseSearchState`: an empty query, a query over 100 characters, an unknown platform.
- `toPhrase`: 2 against 3 characters, surrounding spaces, 100 against 101 characters.
- `isGameOnList` and `isPhraseOnList`: a null platform equals null; "Fire Emblem" against "fire emblem "; a different platform is not a duplicate.

### Integration Tests:

- The Phase 1 isolation script in the Supabase SQL editor, rolled back.
- The Phase 3 acceptance in dev, with two accounts and an invalid key.

### Manual Testing Steps:

1. As a guest, open `/watchlist` and land on `/login`.
2. Signed in, check live search; adding a game with and without a platform; a duplicate from a second tab; adding a phrase, and its duplicate in another letter case; removal and re-adding.
3. Run a search with an invalid key and see the generic message.
4. With a second account, check isolation.
5. On production, check the demo watchlist, the session after an hour idle, and logs without RAWG URLs.

## Performance Considerations

- **RAWG requests.**
  - Each costs one request: an automatic search (3+ characters, after a 300 ms pause), each Enter, and each add or removal while results are open, because `refresh()` re-renders the route.
  - The free tier allows 20,000 a month (F-03 plan), and this slice adds no throttling or caching. A typed title costs a few requests.
- **Latency.** RAWG answered in 128–2034 ms in F-03's probe, inside the 5,000 ms default timeout. The skeleton covers the wait, as the PRD's requirement on visible progress asks.
- **One watchlist query per render**, shared through React `cache`.
- **One session read per render.** Sections await `getCurrentUser()`, which React `cache` deduplicates with the header's call.

## Migration Notes

- **A new table only, with no existing data.**
- **The revert drops the table.** That is harmless before production users have entries, and destructive after. From then on, CLAUDE.md's additive rule applies.
- **Supabase's 2026-10-30 change to default grants does not affect this table.** The migration revokes and grants explicitly.

## References

- Roadmap S-03, S-04 and open questions 6 and 9: `context/foundation/roadmap.md`
- PRD (FR-003, FR-004, Business Logic, Open Questions): `context/foundation/prd.md`
- F-03 handoff to S-03: `context/changes/game-catalog-provider-proven/coverage.md` (Handoff)
- S-02 access decisions: `context/changes/email-password-accounts/plan.md:88-112`
- Deals view pattern: `src/components/deals/deals-section.tsx`, `src/lib/deals/queries.ts`, `src/app/(app)/(deals)/`
- Locked-table pattern: `supabase/migrations/20260930061813_create_deals.sql`
- Next 16 docs (`node_modules/next/dist/docs/01-app/`):
  - `02-guides/server-actions.md`
  - `02-guides/forms.md`
  - `03-api-reference/02-components/form.md`
  - `03-api-reference/04-functions/refresh.md`
  - `03-api-reference/04-functions/redirect.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Decisions on record and the locked watchlist table

#### Automated

- [x] 1.1 `npm run lint` and `npm run format:check` pass — cea2f1a
- [x] 1.2 After Tomasz's push, `npx supabase gen types typescript --linked --schema public` lists `watchlist_entries` with the planned columns and nullability — cea2f1a

#### Manual

- [x] 1.3 Tomasz runs `npm run db:push -- --dry-run` (only the new migration listed), `npm run db:push`, `npm run db:check` (exit 0) and `npm run db:status` (local and remote match) — cea2f1a
- [x] 1.4 Tomasz's grants query on `information_schema.role_table_grants` and `information_schema.column_privileges` shows `authenticated` with SELECT, INSERT on the seven writable columns and UPDATE on `removed_at` only, and no privilege for `anon` or `service_role` — cea2f1a
- [x] 1.5 Tomasz's isolation script — one transaction, rolled back, acting as two real user ids through `set local role` and `request.jwt.claims` — proves that: inserts as user A succeed, which also shows the identity column needs no sequence grant; a second active entry for the same game and platform, and a phrase differing only in case, fail with `23505`; the same game with another platform succeeds; user B reads none of A's rows, updates 0 of them and cannot insert with A's `user_id` (`42501`); `anon` cannot select (`42501`); A can set `removed_at`, cannot clear it, and can then add the same entry again — cea2f1a
- [x] 1.6 Tomasz reads the PRD and roadmap changes and confirms they say what he decided — cea2f1a

### Phase 2: Watchlist views in the kitchen sink

#### Automated

- [x] 2.1 `npm run lint` passes with zero warnings
- [x] 2.2 `npm run format:check` passes
- [x] 2.3 `npm run build` succeeds with `/kitchen-sink` still prerendered as not found
- [x] 2.4 `git status --porcelain src/components/ui` lists only `native-select.tsx` as new, and `git diff --quiet -- package.json package-lock.json components.json src/app/globals.css` exits 0
- [x] 2.5 `grep -rEn '(zinc|slate|gray|neutral|stone)-[0-9]|(bg|text|border)-(black|white)|#[0-9a-fA-F]{3,8}\b' src/app src/components/watchlist --include=*.tsx` prints nothing

#### Manual

- [x] 2.6 With `npm run dev` started by Tomasz, screenshots of the kitchen sink's "Lista obserwowanych" section at 1280 px and 375 px, saved to `context/changes/watchlist-from-catalog/screenshots/`, show every state with no horizontal scroll
- [x] 2.7 Tab reaches the query field, the platform select and every enabled button in order, each with a visible focus indicator
- [x] 2.8 Tomasz reads the Polish copy of every state and accepts it

### Phase 3: The private `/watchlist` view, end to end

#### Automated

- [ ] 3.1 `npm run lint` passes with zero warnings
- [ ] 3.2 `npm run format:check` passes
- [ ] 3.3 `npm run build` succeeds and lists `/watchlist` as a dynamic route
- [ ] 3.4 `grep -rn "NEXT_PUBLIC_RAWG" src` prints nothing, and `grep -ln "server-only" src/lib/watchlist/catalog.ts src/lib/watchlist/current-entries.ts` lists both files
- [ ] 3.5 With Tomasz's `npm run dev` running and no session, `curl -sI http://localhost:3000/watchlist` answers `307` with `location: /login`

#### Manual

- [ ] 3.6 Signed in under `npm run dev`: typing "silent hill" shows results after a pause without interrupting the typing; Enter on "Ys" searches; the browser's Back button leaves `/watchlist` instead of stepping through earlier queries
- [ ] 3.7 Duplicate rule for games: Silent Hill 2 with PS5 is added and shows at the top of the list; adding it again with PS5 is blocked ("Na liście"), and when forced from a second tab opened earlier it shows "Ta pozycja jest już na liście."; Silent Hill 2 with any platform is added beside it
- [ ] 3.8 Phrases: "Fire Emblem" is added from the search; "fire emblem " is then reported as already on the list; a two-character query offers no phrase
- [ ] 3.9 Removal: a removed entry disappears from the list and can be added again
- [ ] 3.10 Isolation: a second test account sees an empty list, and its entries never appear for the first account
- [ ] 3.11 Failure path: with `RAWG_API_KEY` overridden to an invalid value for one `npm run dev` (`$env:RAWG_API_KEY="invalid"` in PowerShell — `.env.local` is never opened), a search shows "Katalog gier jest chwilowo niedostępny" with the phrase offer, the list still loads, and the terminal logs the reason and the status without a URL
- [ ] 3.12 Signed out, the header shows no "Obserwowane" link; screenshots of the live view, signed in, at 1280 px and 375 px are saved to `context/changes/watchlist-from-catalog/screenshots/`

### Phase 4: Production and records

#### Automated

- [ ] 4.1 `vercel env ls` lists `RAWG_API_KEY` for Production and Preview
- [ ] 4.2 `npm run lint` and `npm run format:check` pass
- [ ] 4.3 `curl -sI https://physical-games-deals.vercel.app/watchlist` answers `307` with `location: /login`
- [ ] 4.4 `vercel logs` for the production deployment, read after the acceptance searches, contains neither `api.rawg.io` nor `key=`

#### Manual

- [ ] 4.5 Tomasz signs in to production with the demo account and builds its watchlist through the UI — at least three games, one of them pinned to a platform, and one phrase — and the rawg.io link is visible
- [ ] 4.6 A second, temporary account on production sees an empty list; Tomasz's SQL check (the read parts of the Phase 1 script, rolled back) shows it reads none of the demo account's rows; the temporary account is deleted afterwards
- [ ] 4.7 After more than an hour idle, opening `/watchlist` from the address bar keeps the session, with no redirect to `/login`
- [ ] 4.8 Live search, adding, the duplicate message and removal work on production as they did in Phase 3
