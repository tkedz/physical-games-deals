# Deals Matched to the Watchlist Implementation Plan

## Overview

A signed-in collector opens a private view, `/my-deals`. It shows only the listed deals that match their own watchlist:

- a catalogue game, by its name;
- a phrase, by substring;
- each under the entry's platform pin.

Matching runs in Postgres, as a `security_invoker` view over match keys stored on every deal. The page therefore reads one paged query, as `/` does today. `/` stays the public list of every deal.

This completes US-01 and the PRD's primary success criterion. It also settles the open S-04 unknowns in `context/foundation/roadmap.md:184-188`.

## Current State Analysis

- **What `/` shows.** Every listed deal, to everyone: 30 per page, newest first.
  - It comes from one PostgREST query that reads 31 rows to learn whether an older page exists (`src/lib/deals/queries.ts:137-166`, `src/lib/deals/page.ts:9`).
  - A freshness line reads the last successful run from `pipeline_runs` (`queries.ts:176-191`, `src/lib/deals/freshness.ts`).
  - On 2026-10-06 it held 1,162 listed deals (`context/changes/physical-deals-from-real-posts/reviews/impl-review.md:37`).
- **The row cap.** The Data API silently caps a response at 1,000 rows (`context/changes/physical-deals-from-real-posts/plan.md:87`). Matching in TypeScript would have to fetch the whole listed set in chunks on every request.
- **What a deal carries.** Titles, not a catalogue id: `title`, `english_title` and `alternative_titles` (`supabase/migrations/20260930061813_create_deals.sql:14-16`; S-01 `plan.md:104-107`).
- **What a watchlist entry carries** (`supabase/migrations/20261007141021_create_watchlist_entries.sql:7-27`).
  - A game holds the RAWG `game_id` and the catalogue's `game_name`, frozen at adding.
  - A phrase is trimmed and 3–100 characters long.
  - Either may be pinned to one of seven platforms.
  - The server reads entries as `authenticated`, under RLS (`src/lib/watchlist/queries.ts:82-114`, `src/lib/watchlist/current-entries.ts:20-22`). `service_role` holds nothing on the table (`create_watchlist_entries.sql:44-55`).
- **Phrase duplicates** are judged on letter case alone: a unique index on `lower(phrase)` (`create_watchlist_entries.sql:37-39`), mirrored by `phraseKey` and `isPhraseOnList` (`src/lib/watchlist/rules.ts:75-78`, `:104-116`). „Wiedzmin” and „Wiedźmin” can both sit on one list (S-03 review F4, `context/changes/watchlist-from-catalog/change.md:76`).
- **Access.** Only `/watchlist` is private (`src/lib/auth/access.ts:10`). The header offers signed-in users "Obserwowane" (`src/app/(app)/layout.tsx:44-46`).
- **Title quality**, from S-01's 100-post review sample (`context/changes/physical-deals-from-real-posts/review.md:46-50`, `:73-78`):
  - pepper and lowcygier titles keep platform and packaging words;
  - `english_title` names another game in 4 of 68 listed rows (Red Dead Redemption → Red Dead Redemption 2);
  - `alternative_titles` has held a whole headline and a joke;
  - no listed row lacks a platform.
- **Edition words.** The extraction prompt asks `englishTitle` to leave them out (`scripts/extract/prompt.mts:42`). The model kept them in 14 of the 22 listed sample rows that carry one.
- **RAWG names** (`context/changes/game-catalog-provider-proven/coverage.md:31-34`, `:129`, `:165-169`).
  - The 2024 remake is "Silent Hill 2", and the original is "Silent Hill 2 (2001)".
  - Years tell same-named games apart ("Hades (2016)").
  - Some editions are entries of their own ("Bloodborne: Game of the Year Edition").
  - F-03 itself warned that name matching is fragile.
- **Existing title normalisers** live under `scripts/`: `normalizeTitle` (`scripts/catalog/coverage.mts:94`) and `titleKey` with its `NOISE_WORDS` (`scripts/extract/evaluation.mts:200-231`). Nothing under `src/` imports `scripts/`.

## Desired End State

- **The view.** A signed-in user follows "Moje okazje" in the header to `/my-deals`. They see the listed, unexpired deals that match at least one of their active entries:
  - newest first, 30 per page, under the freshness line;
  - each deal once, however many entries match it.
- **Game rule.** A game entry matches a deal when the match key of its catalogue name equals the match key of the deal's `title`, `english_title` or any of its `alternative_titles`.
  - A match key is the normalised text with three things taken off:
    - a trailing "(YYYY)";
    - one leading "the" or "gra [platform]";
    - trailing edition, platform and packaging words.
  - Remake, Remastered and HD stay, because they name separate releases.
- **Phrase rule.** A phrase entry matches when its normalised text occurs in any of the deal's normalised titles.
- **Normalisation.**
  - ASCII letters are lower-cased.
  - A fixed table folds Latin diacritics to their base letter, ł included.
  - Apostrophes are removed, and "&" reads "and".
  - Every other run of characters outside `[a-z0-9]` becomes one space, and the result is trimmed.
  - An empty key matches nothing.
- **Platform rule.** A pinned entry admits only deals on exactly that platform. An unpinned entry admits any deal, including one without a platform or with `other`.
- **States.**
  - An empty list shows a prompt with a link to `/watchlist`.
  - A list with no matches shows the freshness line, an explanation, and links to `/` and `/watchlist` (US-01, criterion 2).
  - A page past the end, a failed read and the wait each have a state of their own.
- **Access.**
  - A visitor who opens `/my-deals` lands on `/login`.
  - `/` and the sign-in landing are unchanged.
  - One user's matches never reach another: the view runs as the caller, and RLS confines the entries.
- **Phrase duplicates.** A phrase whose normalised text equals one already on the list, for the same platform, is refused by the database. The view shows it as already on the list.
- **Acceptance.** On production, at least 80% of the deals of about 20 watched games reach `/my-deals`, and at most 5% of the deals there are another game.

Verification:

1. `supabase/checks/matching.sql` passes in PGlite, then in the SQL editor.
2. `npm run build`, `npm run lint` and `npm run format:check` pass.
3. The views pass a browser check.
4. The production measurement is recorded in `context/changes/deals-matched-to-watchlist/acceptance.md`.

### Key Discoveries:

- **Matching cannot run in the Actions pipeline.** The grants rule it out: `service_role` holds nothing on `watchlist_entries` (`create_watchlist_entries.sql:44-55`). Matching belongs where the user's session is.
- **`security_invoker` views keep RLS.** Such a view makes the underlying tables' RLS apply to the caller (Supabase docs, Row Level Security, "Expose a view safely"). Splinter lint 0010 is at ERROR level for a view without it, so only such a view fails `npm run db:check` (S-01 `plan.md:86`).
- **Function privileges.** Functions are executable by `PUBLIC` by default. Supabase recommends three things (Database Functions, "Secure a database function"):
  - revoke from `public` and `anon`;
  - grant only the roles that need it;
  - pin `search_path = ''`.
- **The pagination's base path must be a string.** `DealsPagination` is a Client Component (`src/components/deals/deals-pagination.tsx:1`), so it can take a base path only as a string, never as a function.
- **The kitchen-sink pattern.** Sync state components sit beside an async section that only reads. That split is what lets the kitchen sink render every state from sample data without reaching Supabase (`src/components/deals/deals-section.tsx:25-34`, `src/app/kitchen-sink/page.tsx:421-483`).
- **The DO-block check pattern** (`context/changes/watchlist-from-catalog/checks/isolation.sql:1-11`). It acts as each role through `set local role` plus `request.jwt.claims`, then rolls everything back by raising its report. It was dry-run in PGlite first (`context/changes/watchlist-from-catalog/change.md:23`, `:64`).
- **The platform comes from the post.** The platform rule compares the pin with the deal's own platform, so F-03's warning does not bite: a catalogue's incomplete platform list cannot reject a deal (`coverage.md:169`).
- **Why this name rule.** On the 22 edition-suffixed listed rows of S-01's sample (`scripts/extract/review/sample-2026-10-06T061853Z.md`), the candidate rules compare as follows:
  - exact name equality catches 9;
  - containment catches all 22, but 13 of the 68 listed rows would also match a shorter-named game from the same series (Elden Ring → Nightreign, Final Fantasy VII → Rebirth);
  - equality after stripping trailing edition words catches 17–19, and keeps the series apart.

## What We're NOT Doing

- **No catalogue id on deals.** The pipeline does not resolve deals to RAWG ids. Tomasz is not committing to RAWG: it serves the MVP, but IGDB may replace it. The idea goes under Parked in the roadmap, together with images on deal cards, which depend on it.
- **No change to `/`.** It stays the public list of every deal, for everyone. Sign-in still lands on `/` (S-02).
- **No "matched because" line on cards.** It would show RAWG names on the page, which then needs a rawg.io link (`CLAUDE.md`, Game catalogue).
- **No platform compatibility.** A Switch 2 pin does not admit Switch deals, and a PS5 pin does not admit a PS4 disc with a PS5 upgrade (PRD US-01: „wyłącznie oferty na PS5”).
- **No merging of one offer across aggregators.** Such offers stay separate cards, as in S-01.
- **No `set_with` matching.** Each game of a set has its own row (S-01 `review.md:77`).
- **No filtering of `alternative_titles` for phrases.** Tomasz's rule of 2026-10-06 names the column, and any wrong matches it causes count towards the 5%.
- **No numeral equivalence or letter–digit split.** "Hades II" does not match "Hades 2", and "Watch_Dogs2" is not split. Both are outside the agreed normalisation.
- **No index on `deals`, and no change to the extractor's code.** The keys are generated columns.
- **No prompt change and no re-extraction.**
- **No TypeScript copy of the game key.** Only the fold is mirrored, for the phrase pre-check.
- **No test runner, and no new dependency.** PGlite runs from the session's scratchpad, as in S-03.
- **No `cacheComponents` or `use cache`.**
- **No `outline` or `destructive` button variant.** Their focus indicator is an open ui-init finding.

## Implementation Approach

The rule becomes data in the database. Two immutable SQL functions define it:
- `public.fold_for_matching` normalises text;
- `public.game_match_key` builds a game key on top of it.

Each deal stores what the rule needs, as two generated columns. The extractor's inserts fill them without a code change:
- `match_keys`: the game keys of its titles;
- `match_text`: its folded titles.

The view `public.matched_deals` keys the caller's active entries once per query. It then keeps each listed deal that some entry matches under the platform rule. The page reads the view with the same columns, filters, order and range it uses on `deals`.

The decisions reach the PRD, the roadmap and `CLAUDE.md` in Phase 1, before any code that depends on them.

The truth table in `supabase/checks/matching.sql` stands in for unit tests of a rule that lives in SQL. It runs twice: in PGlite before the push, and in the SQL editor after it.

The view reuses the deal card, list, freshness line and pagination. It follows the layout of `/` and `/watchlist`:
- a frame;
- sync state components that the kitchen sink renders;
- an async section that reads and picks one state;
- `loading.tsx` and `error.tsx`.

## Critical Implementation Details

**Who executes the functions.** Postgres runs the functions inside a generated column, or an index expression, with the privileges of the role that inserts the row.
- The extractor inserts deals as `service_role`, so `service_role` needs EXECUTE on all four functions.
- `authenticated` needs EXECUTE on `fold_for_matching` and `game_match_key`, for two reasons:
  - a signed-in user's watchlist insert evaluates the folded phrase index;
  - the view keys entries as `authenticated`.

A missing grant surfaces as 42501 at write time, on production, and not at push. `checks/matching.sql` performs both inserts as those roles.

**Keys go stale silently.** `create or replace function` neither recomputes stored keys nor rebuilds an expression index. A later rule change must do both in the same migration:
- recompute the keys with `update public.deals set title = title`;
- for a change to the fold, settle any newly equal phrases and `reindex` the folded phrase index.

**Locale-independent fold.** Lower-casing goes through the same `translate` table as the diacritics (`A`–`Z` → `a`–`z`), never through `lower()`.
- `lower()`'s result for non-ASCII letters depends on the database's locale, and PGlite and Supabase can differ there.
- The table keeps the TypeScript mirror byte-identical.

**Order inside the migration.**
1. Functions.
2. Generated columns.
3. Settle phrase duplicates.
4. Folded index.
5. View.
6. Grants and comments.

The settle step must run before the index. Otherwise the index fails to build on a list that already holds a pair.

**No read without a user.** `/my-deals` renders nothing without a user, before any read. `anon` holds no grant on the view, so an unchecked read would surface as an error page rather than a redirect. The `/watchlist` sections already work this way (`src/components/watchlist/watchlist-entries.tsx:33-38`).

## Phase 1: Decisions on record and matching in the database

### Overview

1. Record the planning decisions in the PRD, the roadmap and `CLAUDE.md`.
2. Land the matching rule in a migration, together with its truth table.
3. Prove both in PGlite before Tomasz pushes.

### Changes Required:

#### 1. PRD

**File**: `context/foundation/prd.md`

**Intent**: Bring the product's wording in line with name matching and the broader normalisation. Answer open question 5 with the number Tomasz set.

**Contract** (in Polish, as the file is):

- **`## Business Logic`, the paragraph on catalogue identity (`:100`).** It now says:
  - the game on the watchlist comes from the catalogue;
  - a deal carries the titles its post uses, not a catalogue entry;
  - a game entry matches a deal when the catalogue name equals one of the deal's titles, once letter case, diacritics, punctuation, and edition and platform words are set aside;
  - this identifies the game, not the edition (`## Non-Goals`).

  The phrase sentence reads „bez względu na wielkość liter, znaki diakrytyczne i interpunkcję”.
- **`FR-010` (`:75`).** It takes the same normalisation wording.
- **Open question 5 (`:126`).** It gets „Rozstrzygnięte 2026-10-09:” with the threshold, measured in S-04's acceptance:
  - at least 80% of the watched games' deals reach the view;
  - at most 5% of the deals on it are another game.

  Phase 4 adds the result.
- **Nothing else changes.** US-01 stays as written: its "widok okazji" is the view of the user's own deals.

#### 2. Roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: Answer S-04's unknowns, align its outcome with the private view, and keep the catalogue-id idea for later.

**Contract**:

- **S-04's Outcome (`:178`) and its Backlog Handoff title.** The user opens their own deals view, `/my-deals`; `/` stays the public list of every deal.
- **S-04's Unknowns (`:184-188`).** Each gets `Answered 2026-10-09: …`:
  - titles against ids: games match by name, with the key rule above;
  - the phrase rule: normalisation broadened to all Latin diacritics and punctuation;
  - phrase duplicates: judged on the same normalisation;
  - PRD question 5: the 80% / 5% threshold.
- **Open Roadmap Question 5 (`:210`).** It gets the same answer.
- **A new Parked entry, "Resolving deals to a catalogue id".**
  - Why it is parked: S-04 matches by name, and the provider is not settled for good (RAWG for the MVP, IGDB possibly later).
  - What it would unlock: id matching, and images on deal cards.
  - What it costs: a pipeline step, the provider's key in Actions, about one search per deal, and parent lookups for editions with an id of their own (`coverage.md:165-169`).
- **`Status` stays as `/10x-plan` set it:** `planning`.

#### 3. Project instructions

**File**: `CLAUDE.md`

**Intent**: State the new private path, and the facts that a later change to the matching rule depends on.

**Contract**:

- **`## Supabase`, line 24.** Every path is public except `/watchlist` and `/my-deals`. Signed-out users are sent from both to `/login`.
- **A new `## Deal matching` section**, facts only (the reasoning lives in this plan):
  - `/my-deals` reads `public.matched_deals`;
  - the rule is `public.fold_for_matching` and `public.game_match_key`, in the new migration;
  - `deals.match_keys` and `deals.match_text` are generated from it;
  - `foldForMatching` in `src/lib/watchlist/rules.ts` mirrors the fold and must stay identical to it;
  - changing a matching function also recomputes the keys and, for the fold, rebuilds the folded phrase index;
  - `supabase/checks/matching.sql` is the truth table to rerun.

#### 4. The migration

**File**: `supabase/migrations/<timestamp>_match_deals_to_watchlist.sql`, created by `npm run db:new -- match_deals_to_watchlist`

**Intent**: Define the rule once, in SQL. Store each deal's keys, refuse phrases that normalise alike, and expose the caller's matches through one view that only `authenticated` can read.

**Contract**:

**Header.**
- A `-- Revert:` line that drops, in reverse order, the view, the folded index, the two columns and the four functions. Phrases the settle step marked removed stay removed.
- A line stating that the migration is backward-compatible with the previous deployment:
  - the new columns are generated, so the deployed extractor's inserts do not name them;
  - nothing deployed reads the view;
  - the folded index refuses only what S-03's code already answers as a duplicate.

**Functions.** All four are `language sql immutable parallel safe set search_path = ''`, and their bodies name `pg_catalog.` and `public.` explicitly.

- **`public.fold_for_matching(value text) returns text`**, in this order:
  1. One `translate`, with a single table:
     - `A`–`Z` → `a`–`z`;
     - `ĄĆĘŁŃÓŚŹŻ` and `ąćęłńóśźż` → `acelnoszz`;
     - `ÀÁÂÃÄÅàáâãäå` → `a`, `ÇČçč` → `c`, `ĎĐďđ` → `d`, `ÈÉÊËĚèéêëě` → `e`, `ÌÍÎÏìíîï` → `i`, `ŇÑňñ` → `n`, `ÒÔÕÖØŐòôõöøő` → `o`, `Řř` → `r`, `Šš` → `s`, `Ťť` → `t`, `ÙÚÛÜŮŰùúûüůű` → `u`, `ÝŸýÿ` → `y`, `Žž` → `z`;
     - the apostrophes `'` `’` `‘` `` ` `` `´` `ʼ`, listed last with no counterpart, so they are deleted.
  2. `&` → ` and `.
  3. Every run outside `[a-z0-9]` → one space.
  4. `btrim`.
- **`public.game_match_key(value text) returns text`**:
  1. Drop a trailing `\s*\(\d{4}\)\s*$` from the raw text.
  2. Fold.
  3. Drop one leading `the ` or `gra [platform] `.
  4. Repeatedly drop trailing qualifiers, with the pattern in the snippet below.
  5. `btrim`.

  Seed the qualifiers from `NOISE_WORDS` (`scripts/extract/evaluation.mts:200-219`) and the review sample, then tune them against the sample's listed rows.

  Keep `remake`, `remastered`, `remaster` and `hd`. Bare `ultimate`, `gold`, `limited` and `special` are stripped only when `edition` follows them, because they often end a real name ("Super Smash Bros. Ultimate", "Pokémon Gold").
- **`public.deal_match_keys(title text, english_title text, alternative_titles text[]) returns text[]`**: the distinct, non-empty `game_match_key` of every title, ordered.
- **`public.deal_match_text(title text, english_title text, alternative_titles text[]) returns text`**: every title folded and joined with ` | `, never null. A folded phrase holds no `|`, so it cannot span two titles.

**`public.deals` columns.**
- `match_keys text[] generated always as (public.deal_match_keys(title, english_title, alternative_titles)) stored`.
- `match_text text generated always as (public.deal_match_text(title, english_title, alternative_titles)) stored`.

**Settle step.**
- Covers active phrase entries whose folded text is non-empty.
- In each `(user_id, folded phrase, platform)` group, keep the oldest, by `created_at` then `id`.
- Set `removed_at = now()` on the rest. They stay as records (FR-004).

**Indexes.**
- `watchlist_entries_active_phrase_folded`: a unique index on `(user_id, public.fold_for_matching(phrase), platform) nulls not distinct where kind = 'phrase' and removed_at is null and public.fold_for_matching(phrase) <> ''`.
- `watchlist_entries_active_phrase` on `lower(phrase)` stays. It still keeps identical phrases whose folded text is empty to one entry.

**View.** `public.matched_deals`, defined in the snippet below.

**Grants.**
- The view: revoke all from `anon`, `authenticated` and `service_role`, then grant `select` to `authenticated`.
- The four functions: revoke `execute` from `public`, `anon`, `authenticated` and `service_role`.
- Grant `execute` on `fold_for_matching` and `game_match_key` to `authenticated`, and on all four functions to `service_role`.

**Comments.**
- **On the view: why it may be read through the publishable key.** It sits above the grants, as `create_deals.sql:38-47` places its justification:
  - Vercel's Server Components act as `authenticated`;
  - the view runs as the caller, so RLS confines the entries;
  - every row is a listed deal, which is already public.
- **On each function and column:** what it holds.
- **A new `comment on column public.watchlist_entries.phrase`**, with the broadened rule. The S-03 comment names Polish diacritics only.

The pattern and the view are non-obvious enough to fix here:

```sql
-- Trailing qualifiers, on folded text prefixed with a space, so that a title
-- made only of qualifiers reduces to '' and never matches. The leftmost start
-- that reaches the end wins, so "nintendo switch 2 edition" goes whole.
regexp_replace(' ' || key,
  '(?: (?:(?:na |for )?(?:ps5|ps4|playstation 5|playstation 4|xbox series x s|xbox series x|xbox series s|xbox series|xbox one|nintendo switch 2|nintendo switch|switch 2|switch|pc)'
  || '|(?:game of the year|nintendo switch 2|switch 2|[a-z0-9]+)? edition'
  || '|edycja(?: gry roku| [a-z0-9]+)?'
  || '|game of the year|goty|deluxe|enhanced|complete|definitive|directors cut|launch|day one|premium|standard'
  || '|pudelkowa|pudelkowe|pudelko|okladka pl|plyta blu ray|plyta|blu ray|steelbook|pl))+$', '')

create view public.matched_deals with (security_invoker = true) as
with my_entries as materialized (
  select e.platform,
         case when e.kind = 'game' then public.game_match_key(e.game_name) end as game_key,
         case when e.kind = 'phrase' then public.fold_for_matching(e.phrase) end as phrase_key
  from public.watchlist_entries e
  where e.user_id = (select auth.uid()) and e.removed_at is null
)
select d.id, d.link, d.source, d.published_at, d.platform, d.title, d.set_with,
       d.price_amount, d.currency, d.discount_percent, d.expires_at, d.shop_url, d.shop_name
from public.deals d
where d.kind = 'game' and d.edition = 'physical' and d.price_amount is not null
  and exists (
    select 1 from my_entries e
    where (e.platform is null or e.platform = d.platform)
      and (e.game_key <> '' and e.game_key = any (d.match_keys)
        or e.phrase_key <> '' and pg_catalog.strpos(d.match_text, e.phrase_key) > 0)
  );
```

#### 5. The truth table

**File**: `supabase/checks/matching.sql`

**Intent**: An executable check of the rule, the grants and the isolation. It lives beside the migrations rather than in this change folder, because every later rule change reruns it.

**Contract**:

**Shape.** One `do $check$ … $check$` block, in the shape of `context/changes/watchlist-from-catalog/checks/isolation.sql`:
- each check runs in its own `begin … exception … end`;
- identities switch through `set local role` and `request.jwt.claims`;
- the report collects lines with `array_append`;
- the block ends in `raise exception`, whose message is the report. The error rolls everything back. Expect "Rolled back on purpose. All checks passed."

**Fixtures.**
- **Two fixture users in `auth.users`**, so that real watchlists cannot touch the results. If the hosted `auth.users` refuses a minimal insert, fall back to the two oldest users, with their active entries marked removed inside the transaction.
- **One fixture `collected_posts` row and one `post_extractions` row.**
- **Fixture `deals` rows inserted as `service_role`.**

Every expected result is computed over the fixture deal ids only.

**Sections:**
1. Fold and key cases, compared as text pairs.
2. The keys stored on the fixture deals that `service_role` inserted.
3. User A's view, compared with the expected id set.
4. User B's view: none of A's matches, and B's own.
5. `anon`'s select on the view, refused with 42501.
6. Phrase duplicates.

The cases are listed under Testing Strategy.

#### 6. PGlite dry-run

**File**: none in the repository. A scratch harness runs in the session's scratchpad, as in S-03.

**Intent**: Prove the migration and the check before Tomasz pushes, including the parts the hosted check cannot reach.

**Contract**:

1. Apply every migration in order to PGlite, with stub Supabase roles, `auth.users` and `auth.uid()`, then run `supabase/checks/matching.sql`.
2. Before applying the new migration, seed two phrases that fold alike for one user. After it, the newer phrase is removed and the folded index exists.
3. Break the migration on purpose twice, and confirm that the check reports each break:
   - drop the `service_role` EXECUTE grant;
   - remove the platform condition from the view.

### Success Criteria:

#### Automated Verification:

- `supabase/checks/matching.sql` passes in a PGlite run over every migration, and reports a failure when the migration is broken on purpose (the `service_role` EXECUTE grant dropped; the view's platform condition removed)
- In PGlite, two phrases that fold alike, added before the migration, leave the older active and the newer removed, and the folded index builds
- `npx supabase gen types typescript --linked --schema public` lists `deals.match_keys`, `deals.match_text` and the `matched_deals` view (run after Tomasz's push)
- `npm run build`, `npm run lint` and `npm run format:check` pass

#### Manual Verification:

- Tomasz runs `npm run db:push -- --dry-run`, `npm run db:push`, `npm run db:check` and `npm run db:status`: only the new migration is applied, with no error-level finding and no drift
- Tomasz runs `supabase/checks/matching.sql` in the Supabase SQL editor and gets "Rolled back on purpose. All checks passed."
- Tomasz reads the PRD, roadmap and `CLAUDE.md` changes and accepts them

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Ask for the SQL editor's report text back, as `context/changes/watchlist-from-catalog/change.md` records it for S-03.

---

## Phase 2: `/my-deals` states in the kitchen sink

### Overview

Before anything reads the database:

1. Build every state of the new view as sync components, rendered from sample data.
2. Generalise the pagination to a base path.
3. Update the phrase rule line.
4. Pass the screenshot gate.

### Changes Required:

#### 1. Pagination by base path

**File**: `src/lib/deals/page.ts`, `src/components/deals/deals-pagination.tsx`, `src/components/deals/deals-section.tsx`

**Intent**: Let each list page through its own address. `/` passes its own path, so it behaves exactly as it does today.

**Contract**:

- **`pageHref(page, basePath)`.** `basePath` is `"/" | "/my-deals"`. The first page is the base path itself; a later page is `<basePath>?page=<n>`.
- **`DealsPagination`** takes `basePath` as a string prop.
- **On `/`,** `DealsResults` and `DealsEmpty` (its link back to the newest deals) pass `"/"`.

#### 2. The view's frame and states

**File**: `src/components/deals/my-deals-page.tsx` (new), `src/components/deals/my-deals-section.tsx` (new), `src/components/deals/deal-list-skeleton.tsx`

**Intent**: The frame and every state of `/my-deals`. They reuse S-01's card, list, freshness line, pagination and retry, in the frame-plus-sync-states pattern of `deals-section.tsx`.

**Contract**:

**`MyDealsPage`**, the frame.
- A `<main>` on the header's column, with the h1 „Moje okazje” and the intro „Okazje na gry i frazy z Twojej listy obserwowanych, od najnowszych.”
- No hooks and no server-only imports, because `error.tsx` renders it.

**The sync states**, exported from `my-deals-section.tsx`:
- **`MyDealsResults({ page, freshness, deals, hasOlder })`.** The freshness line, then either the list with `DealsPagination basePath="/my-deals"`, or `MyDealsEmpty`.
- **`MyDealsEmpty({ page })`.**
  - On page 1: the heading „Brak okazji na gry z Twojej listy”, the text „Gdy w serwisach z okazjami pojawi się promocja na pudełkowe wydanie gry z Twojej listy, zobaczysz ją tutaj.”, and the links „Zobacz wszystkie okazje” (`/`) and „Zmień listę obserwowanych” (`/watchlist`).
  - Past the last page: „Na tej stronie nie ma już okazji”, with the link „Wróć do najnowszych okazji” (`/my-deals`).
- **`MyDealsNoEntries()`.** No freshness line. The heading „Twoja lista obserwowanych jest pusta”, the text „Dodaj gry albo frazy do listy obserwowanych, a ich okazje pojawią się tutaj.”, and the link „Przejdź do listy obserwowanych” (`/watchlist`).
- **`MyDealsError()`.** The alert „Nie udało się wczytać Twoich okazji” with „Spróbuj ponownie za chwilę.”, and `RetryButton`.

**Links** use the `secondary` or `ghost` button variants.

**`DealListSkeleton`** takes an optional status line. The default stays „Wczytujemy okazje…”, and `/my-deals` passes „Wczytujemy Twoje okazje…”.

#### 3. The phrase rule line

**File**: `src/components/watchlist/phrase-offer.tsx`

**Intent**: State the broadened rule where a phrase is offered.

**Contract**: the line at `:46` reads „Fraza pasuje do okazji, których tytuł ją zawiera, bez względu na wielkość liter, znaki diakrytyczne i interpunkcję.”

#### 4. Kitchen sink

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: Render every state of `/my-deals` from sample data, for the screenshot gate. It reaches neither Supabase nor RAWG.

**Contract**: a „Moje okazje” section after „Okazje”, reusing `sampleDeals`, with these states:
- results with an older page;
- page 2 with both directions;
- no matches under a fresh freshness line;
- no matches under a stale one;
- the empty list;
- past the end;
- the error;
- the skeleton with its own line.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes and still prerenders `/kitchen-sink` as a 404 for production
- `npm run lint` and `npm run format:check` pass
- `package.json`, `components.json` and `src/app/globals.css` are unchanged, and no new view uses the `outline` or `destructive` button variant

#### Manual Verification:

- The kitchen sink's „Moje okazje” section, under `npm run dev`, renders every state at 1280 px and at 375 px without horizontal scroll, captured in `context/changes/deals-matched-to-watchlist/screenshots/`
- Tab reaches every link and button of each state in order, each with a visible focus indicator
- Tomasz reads and accepts the Polish copy of every state and of the new phrase rule line

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: `/my-deals` end to end in dev

### Overview

1. Wire the route to the view. It reads the user's entries, the page of matches and the freshness in parallel, then picks a state.
2. Make the path private, and add the header link.
3. Mirror the fold for the phrase pre-check, and prove that the mirror matches SQL.

### Changes Required:

#### 1. The read

**File**: `src/lib/deals/queries.ts`

**Intent**: Page through `matched_deals` exactly as `/` pages through `deals`.

**Contract**:

- **`loadMatchedDealsPage(client, page, now): Promise<DealsPageResult>`** matches `loadDealsPage` in everything but the relation: the same columns, listed predicate and expiry filter, the same order (`published_at desc, id desc`) and the same `PAGE_SIZE + 1` range.
- **One private builder** takes the relation name. The server log names the relation.
- **The listed predicate stays in the query** even though the view states it, for the reason given at `queries.ts:128-130`.

#### 2. The section and the route

**File**: `src/components/deals/my-deals-section.tsx`, `src/app/(app)/my-deals/page.tsx`, `src/app/(app)/my-deals/loading.tsx`, `src/app/(app)/my-deals/error.tsx` (new)

**Intent**: The private view, streaming under its own skeleton, with a safety net for an unexpected throw.

**Contract**:

**`MyDealsSection({ page })`:**
1. Render nothing when `getCurrentUser()` returns no user.
2. Otherwise read three things in parallel: `getActiveEntries()`, `loadMatchedDealsPage(client, page, now)` and `loadLastRefresh(client)`.
3. Pick the state:
   - any failed read: `MyDealsError`;
   - no entries: `MyDealsNoEntries`;
   - otherwise: `MyDealsResults`, with `decideFreshness`.

**The route files:**
- **`page.tsx`.** `metadata.title` is „Moje okazje”, and the page number is read with `parsePage`. `MyDealsPage` wraps `<Suspense key={page}>` around `MyDealsSection`, with the skeleton's own line.
- **`loading.tsx`.** The frame over the skeleton.
- **`error.tsx`.** A Client Component in the shape of `src/app/(app)/(deals)/error.tsx`, with „Nie udało się wyświetlić Twoich okazji” and `retry()`.

#### 3. Access and header

**File**: `src/lib/auth/access.ts`, `src/app/(app)/layout.tsx`

**Intent**: Make the view private, and reachable from every page.

**Contract**:

- **`PRIVATE_PAGES`** holds `"/watchlist"` and `"/my-deals"`, matched exactly, as now. The doc comment names both.
- **`HeaderAuth`** adds a ghost-variant link „Moje okazje” to `/my-deals`, before „Obserwowane”.

#### 4. The fold mirror and the phrase pre-check

**File**: `src/lib/watchlist/rules.ts`

**Intent**: Tell the user that a phrase is already on the list in every case where the database would refuse it.

**Contract**:

**`foldForMatching(value: string): string`** applies the four steps of `public.fold_for_matching` in the same order.
- It uses the same table, written once as two strings. A character beyond the second string's length is deleted.
- It iterates by code point and never calls `toLowerCase`.
- It is pure and free of zod.
- Its comment names the SQL twin and the migration file.

**`isPhraseOnList`** is true, for the same platform, when either:
- the folded texts are equal and non-empty (the folded index);
- the lower-cased, trimmed texts are equal (the old index).

### Success Criteria:

#### Automated Verification:

- `npm run build`, `npm run lint` and `npm run format:check` pass
- `foldForMatching` and `public.fold_for_matching` return identical text for every fold case of `supabase/checks/matching.sql`, from a scratch script against PGlite
- Against `npm run dev`, signed out: `/my-deals` and `/my-deals?page=2` answer 307 to `/login`, and `/` still answers 200 with 30 cards

#### Manual Verification:

- Signed in as the demo account (Tomasz signs in, the agent drives Chrome DevTools): `/my-deals` lists only deals for its active entries, newest first, none twice, and the Switch 2 pin on Metroid Prime 4: Beyond admits no `switch` deal
- A temporary account goes from the empty-list state, through the no-matches state with its freshness line, to a watched game's deals appearing on `/my-deals` with no step beyond adding it
- With „Wiedźmin” on the temporary account's list, a search for „wiedzmin” shows „Ta fraza jest już na liście”
- `/my-deals?page=999` shows the past-the-end state, and the header shows „Moje okazje” on every view and wraps at 375 px
- A tab left on `/my-deals` after signing out in another tab lands on `/login` when reloaded

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Production acceptance and records

### Overview

1. Deploy.
2. Check access and isolation on production.
3. Measure the matching against the threshold Tomasz set.
4. Record the result.

### Changes Required:

#### 1. Deployment

**File**: none. Tomasz pushes `main` after the Phase 3 commit, as in S-03.

**Intent**: Serve `/my-deals`. The migration is already applied, in Phase 1.

**Contract**: `ci.yml`'s `verify` gate, then `deploy`, run as usual. No new environment variable.

#### 2. The measurement

**File**: `context/changes/deals-matched-to-watchlist/acceptance.md` (new)

**Intent**: Measure the main risk of the name rule, silent misses, together with wrong matches. It runs on live data, with real catalogue names, and gives PRD question 5 its number.

**Contract**:

1. **The games.** A temporary account, created through `/signup` as in S-03, watches the first 20 distinct games on production `/`, newest first, that the catalogue search finds.
   - Each is added through `/watchlist`, with no pin, by choosing the result that is the same game.
   - Games the catalogue lacks are skipped, and listed.
2. **The expected set.** Every deal of those games on `/`, read from all pages. Editions count as the game; remakes, remasters and sequels do not.
3. **The measurement.** Read every page of `/my-deals`, then compute:
   - recall: matched expected deals ÷ expected deals, which must be ≥ 80%;
   - wrong share: matched deals of other games ÷ all matched deals, which must be ≤ 5%.
4. **The record.**
   - one row per game: its catalogue name, expected deals and matched deals;
   - every miss and every wrong match, with its titles and its cause;
   - the date and the deployment.
5. **Below the threshold.**
   - One tuning round: a migration that replaces `game_match_key` and recomputes the keys, then a re-measurement on the same games.
   - Still outside the threshold: stop, and agree the next step with Tomasz, as S-01's review gate did.

#### 3. Records

**File**: `context/foundation/prd.md`, `context/foundation/roadmap.md`, `context/changes/deals-matched-to-watchlist/change.md`

**Intent**: Put the measured result next to the threshold. Record departures and verification as each phase lands (`context/foundation/lessons.md`).

**Contract**:

- **PRD and roadmap.** PRD open question 5 and roadmap Open Roadmap Question 5 append the measured recall and wrong share, with a pointer to `acceptance.md`.
- **`change.md`** gets dated notes, as S-03's does.
- **Temporary accounts.** Tomasz deletes them in Authentication → Users. Their entries go with them (`on delete cascade`).

### Success Criteria:

#### Automated Verification:

- Production, signed out: `/my-deals` answers 307 to `/login`, `/` answers 200 with cards, and `/kitchen-sink` answers 404

#### Manual Verification:

- `acceptance.md` records the production measurement: at least 80% of the watched games' deals on `/` reach `/my-deals`, and at most 5% of the deals on `/my-deals` are another game
- The temporary account and the demo account each see only their own matches on production, and a signed-in `/my-deals` response carries a `private` or `no-store` `cache-control`
- PRD open question 5 and the roadmap carry the measured result, and Tomasz has deleted the temporary accounts

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

There is no test runner (`CLAUDE.md`, Verification). The rule's unit tests are the cases in `supabase/checks/matching.sql`, executed in PGlite and in the SQL editor. The fold's TypeScript mirror is compared with SQL on the same fold cases (Phase 3).

Fold (`fold_for_matching`):

| Input | Expected |
| --- | --- |
| „Wiedźmin 3: Dziki Gon” | `wiedzmin 3 dziki gon` |
| „ŁOWCY GIER” | `lowcy gier` |
| „Dragon’s Dogma 2” / „Dragon's Dogma” | `dragons dogma 2` / `dragons dogma` |
| „Pokémon Legends: Z-A” | `pokemon legends z a` |
| „Final Fantasy X/X-2 HD Remaster” | `final fantasy x x 2 hd remaster` |
| „Mario & Luigi” | `mario and luigi` |
| „  Watch_Dogs 2 ” | `watch dogs 2` |
| „ゼルダの伝説” / „!!!” | empty / empty |

Game key (`game_match_key`):

| Input | Expected |
| --- | --- |
| „The Witcher 3: Wild Hunt - Game of the Year Edition” / „The Witcher 3: Wild Hunt” | `witcher 3 wild hunt` / `witcher 3 wild hunt` |
| „Silent Hill 2 (2001)” | `silent hill 2` |
| „Xenoblade Chronicles 2 – Nintendo Switch 2 Edition” | `xenoblade chronicles 2` |
| „Little Nightmares Enhanced Complete Edition” | `little nightmares` |
| „Resident Evil 4 Gold Edition” | `resident evil 4` |
| „Battlefield 6 Phantom Edition XBOX Series X” | `battlefield 6` |
| „Gra PS5 Indiana Jones i Wielki Krąg - Okładka PL” | `indiana jones i wielki krag` |
| „Front Mission 3 Remake” | `front mission 3 remake` (kept) |
| „Super Smash Bros. Ultimate” | `super smash bros ultimate` (kept) |
| „Deluxe Edition” | empty |

### Integration Tests:

These run against the view, over fixture deals and two fixture users:

| Entries | Fixture deals | Expected on the view |
| --- | --- | --- |
| A: „Silent Hill 2” pinned to PS5. B: the same game, no pin | „Silent Hill 2” on `ps5`, and on `xbox-series` | A sees the PS5 deal only; B sees both — the PRD's own example |
| A: „The Witcher 3: Wild Hunt” | `english_title` „The Witcher 3: Wild Hunt - Game of the Year Edition” | matched |
| A: „Elden Ring” | „Elden Ring Nightreign” | not matched (sibling) |
| A: „Front Mission 3” | „Front Mission 3 Remake” | not matched (remake) |
| A: „Final Fantasy VII (1997)” | „FINAL FANTASY VII” on `switch` | matched (year) |
| A: „Battlefield 6” | `english_title` „Battlefield 2042 Phantom Edition”, `alternative_titles` [„Battlefield 6 Phantom Edition”] | matched, through the alternative title |
| A: phrase „wiedzmin” | „Wiedźmin 3: Dziki Gon - Edycja Gry Roku” | matched |
| A: phrase „Dragon's Dogma” | „Dragon’s Dogma 2” | matched |
| A: phrase „dziedzictwo” | „Dziedzictwo Hogwartu” in `alternative_titles` only | matched |
| A: phrase „c d” | titles „Abc” and „Def” | not matched (no spanning titles) |
| A: a game pinned to `switch-2` | the same game on `switch` | not matched |
| A: an unpinned game | deals with platform null and with `other` | both matched |
| A: a game pinned to `ps5` | a deal with no platform | not matched |
| A: a game entry and a phrase that both match one deal | that deal | it appears once |
| A: a removed phrase that would match | — | not matched |
| A: phrase „!!!” | any deal | matches nothing |
| A's matching entries | a `digital` deal, and an unpriced one | neither appears |

Roles:
- a deal inserted as `service_role` has `match_keys` and `match_text` filled;
- `anon` selecting the view gets 42501;
- B never sees A's matches.

Duplicates:
- „Wiedźmin” then „wiedzmin” on one platform: 23505;
- „wiedzmin” on `ps5`: accepted;
- „!!!” and „???”: both accepted;
- „!!!” a second time: 23505, from the old index.

### Manual Testing Steps:

1. **Demo account.** `/my-deals` shows only its entries' deals; the Switch 2 pin admits no `switch` deal; no deal appears twice.
2. **Temporary account.**
   1. The empty-list state.
   2. Add a phrase that matches nothing: the no-matches state, with the freshness line.
   3. Add a game that has deals on `/`: its deals appear on `/my-deals`, with no other step.
3. **Phrase pre-check.** With „Wiedźmin” on the list, search „wiedzmin”: „Ta fraza jest już na liście”.
4. **Signed out.** `/my-deals` goes to `/login`. A stale tab, after signing out elsewhere, goes to `/login` on reload.
5. **Production.** The measurement in `acceptance.md`, and the `cache-control` of a signed-in `/my-deals`.

## Performance Considerations

- **Per request.** The view keys the caller's entries once, in a materialised CTE. It then compares stored arrays and strings across the listed deals, with no index: about 1,200 rows today, and growing.
  - That is a few milliseconds in Postgres, and Vercel functions do none of it.
  - Revisit if the read passes about 200 ms, or listed deals pass about 20,000. The options then are a GIN index on `match_keys`, and `pg_trgm` on `match_text`.
- **Per insert.** The generated columns cost one evaluation of the key functions for each deal the extractor inserts. That is negligible next to the model call.
- **Per rule change.** `update public.deals set title = title` recomputes the keys in seconds at this size.

## Migration Notes

- **Additive.**
  - The columns are generated, and the extractor's inserts do not name them.
  - The old phrase index stays, and the view is new.
  - The settle step is the one data change: it marks newer duplicates removed. That is probably zero rows on production, and those rows stay as records.
- **Compatible with the previous deployment.**
  - S-03's deployed code answers a refusal from the folded index with „Ta pozycja jest już na liście.”
  - S-01's `/` selects named columns, so the new columns never reach it.
- **Revert.** Drop, in this order:
  1. the view;
  2. the folded index;
  3. `match_keys` and `match_text`;
  4. `deal_match_text`, `deal_match_keys`, `game_match_key` and `fold_for_matching`.
- **A later rule change.** It is a migration that does three things, followed by a rerun of `supabase/checks/matching.sql`:
  1. replace the function;
  2. recompute the keys with `update public.deals set title = title`;
  3. for the fold, settle newly equal phrases and run `reindex index public.watchlist_entries_active_phrase_folded`.

## References

- Roadmap S-04: `context/foundation/roadmap.md:176-190`; Open Roadmap Question 5: `:210`; Parked: `:216-226`
- PRD: US-01 `context/foundation/prd.md:47-58`; FR-010 `:75`; catalogue identity `:100`; open question 5 `:126`
- S-01: `context/changes/physical-deals-from-real-posts/plan.md:86-87`, `:104-109`; `review.md:46-50`, `:73-78`; `reviews/impl-review.md:37`
- S-03: `context/changes/watchlist-from-catalog/change.md:23`, `:64`, `:76`; `checks/isolation.sql`
- F-03: `context/changes/game-catalog-provider-proven/coverage.md:31-34`, `:129`, `:165-169`
- Code:
  - `src/lib/deals/queries.ts:74-191`
  - `src/lib/deals/page.ts:31-34`
  - `src/components/deals/deals-section.tsx:25-142`
  - `src/lib/watchlist/rules.ts:75-116`
  - `src/lib/auth/access.ts:7-10`
  - `src/app/(app)/layout.tsx:38-62`
  - `scripts/extract/prompt.mts:40-44`, `:63`
- Normaliser precedents: `scripts/catalog/coverage.mts:94`; `scripts/extract/evaluation.mts:200-231`
- Supabase docs: views with `security_invoker` (Row Level Security, "Expose a view safely"); function privileges (Database Functions, "Secure a database function")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Decisions on record and matching in the database

#### Automated

- [x] 1.1 `supabase/checks/matching.sql` passes in a PGlite run over every migration, and reports a failure when the migration is broken on purpose (the `service_role` EXECUTE grant dropped; the view's platform condition removed)
- [x] 1.2 In PGlite, two phrases that fold alike, added before the migration, leave the older active and the newer removed, and the folded index builds
- [x] 1.3 `npx supabase gen types typescript --linked --schema public` lists `deals.match_keys`, `deals.match_text` and the `matched_deals` view (run after Tomasz's push)
- [x] 1.4 `npm run build`, `npm run lint` and `npm run format:check` pass

#### Manual

- [x] 1.5 Tomasz runs `npm run db:push -- --dry-run`, `npm run db:push`, `npm run db:check` and `npm run db:status`: only the new migration is applied, with no error-level finding and no drift
- [x] 1.6 Tomasz runs `supabase/checks/matching.sql` in the Supabase SQL editor and gets "Rolled back on purpose. All checks passed."
- [x] 1.7 Tomasz reads the PRD, roadmap and `CLAUDE.md` changes and accepts them

### Phase 2: `/my-deals` states in the kitchen sink

#### Automated

- [ ] 2.1 `npm run build` passes and still prerenders `/kitchen-sink` as a 404 for production
- [ ] 2.2 `npm run lint` and `npm run format:check` pass
- [ ] 2.3 `package.json`, `components.json` and `src/app/globals.css` are unchanged, and no new view uses the `outline` or `destructive` button variant

#### Manual

- [ ] 2.4 The kitchen sink's „Moje okazje” section, under `npm run dev`, renders every state at 1280 px and at 375 px without horizontal scroll, captured in `context/changes/deals-matched-to-watchlist/screenshots/`
- [ ] 2.5 Tab reaches every link and button of each state in order, each with a visible focus indicator
- [ ] 2.6 Tomasz reads and accepts the Polish copy of every state and of the new phrase rule line

### Phase 3: `/my-deals` end to end in dev

#### Automated

- [ ] 3.1 `npm run build`, `npm run lint` and `npm run format:check` pass
- [ ] 3.2 `foldForMatching` and `public.fold_for_matching` return identical text for every fold case of `supabase/checks/matching.sql`, from a scratch script against PGlite
- [ ] 3.3 Against `npm run dev`, signed out: `/my-deals` and `/my-deals?page=2` answer 307 to `/login`, and `/` still answers 200 with 30 cards

#### Manual

- [ ] 3.4 Signed in as the demo account (Tomasz signs in, the agent drives Chrome DevTools): `/my-deals` lists only deals for its active entries, newest first, none twice, and the Switch 2 pin on Metroid Prime 4: Beyond admits no `switch` deal
- [ ] 3.5 A temporary account goes from the empty-list state, through the no-matches state with its freshness line, to a watched game's deals appearing on `/my-deals` with no step beyond adding it
- [ ] 3.6 With „Wiedźmin” on the temporary account's list, a search for „wiedzmin” shows „Ta fraza jest już na liście”
- [ ] 3.7 `/my-deals?page=999` shows the past-the-end state, and the header shows „Moje okazje” on every view and wraps at 375 px
- [ ] 3.8 A tab left on `/my-deals` after signing out in another tab lands on `/login` when reloaded

### Phase 4: Production acceptance and records

#### Automated

- [ ] 4.1 Production, signed out: `/my-deals` answers 307 to `/login`, `/` answers 200 with cards, and `/kitchen-sink` answers 404

#### Manual

- [ ] 4.2 `acceptance.md` records the production measurement: at least 80% of the watched games' deals on `/` reach `/my-deals`, and at most 5% of the deals on `/my-deals` are another game
- [ ] 4.3 The temporary account and the demo account each see only their own matches on production, and a signed-in `/my-deals` response carries a `private` or `no-store` `cache-control`
- [ ] 4.4 PRD open question 5 and the roadmap carry the measured result, and Tomasz has deleted the temporary accounts
