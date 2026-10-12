<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Deals Matched to the Watchlist

- **Plan**: context/changes/deals-matched-to-watchlist/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Evidence

- Automated criteria were re-run on 2026-10-12, under Node 24.21.0.
  - `npm run build` succeeds (1.4, 2.1, 3.1). It lists `/my-deals` as dynamic and `/kitchen-sink` as prerendered.
  - `npm run lint` and `npm run format:check` exit 0 (1.4, 2.2, 3.1).
  - `package.json`, `package-lock.json`, `components.json` and `src/app/globals.css` are unchanged since `906e072` (2.3).
  - No new view uses an `outline` or `destructive` button variant (2.3). The two `destructive` hits are `Alert`s, as on `/`.
  - Phase 1's PGlite harness was rerun from the earlier session's scratchpad, over every migration, on PostgreSQL 18.3 with datcollate C and datctype C.UTF-8.
    - `supabase/checks/matching.sql` passes 71 of 71 checks (1.1).
    - With `auth.users` refusing inserts, the check takes its fallback and passes 71 of 71. The rollback leaves the 5 real entries active.
    - Of two phrases that fold alike, seeded before the migration, the older stays active and the newer is removed (1.2). A tie on `created_at` goes to the lower id, and the folded index builds.
  - The parity script compares `foldForMatching` with `public.fold_for_matching` (3.2). All 1,238 comparisons are identical: the 15 fold cases and 1,223 probes.
  - `npx supabase gen types typescript --linked --schema public` lists `deals.match_keys`, `deals.match_text`, `matched_deals` and the four functions (1.3).
- On production, signed out (4.1):
  - `/my-deals` and `/my-deals?page=2` answer `307` with `Location: /login`;
  - `/kitchen-sink` answers `404`;
  - `/` answers `200` with 30 cards and a link to `/?page=2`.
- Not re-run:
  - 3.3 (curl against dev): production's 4.1 covers the same rule.
  - The deliberate breaks of 1.1. change.md records 21 and 4 failures, and the drift review found both counts consistent with the check's logic.
  - The manual items (1.5–1.7, 2.4–2.6, 3.4–3.8, 4.2–4.4). Each is ticked, and change.md records its evidence.
- Plan drift:
  - After Phase 1, `plan.md` changed only in its Progress rows.
  - Every departure in code, SQL and copy is recorded in change.md, in the commit that made it.
  - The trailing pattern, the translate table, every Polish string and every Testing Strategy case were compared with the plan by script.
  - F4 lists the only undocumented departure.

## Findings

### F1 — Quadratic regex in `game_match_key`, reachable by any signed-in account

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261012070050_match_deals_to_watchlist.sql:74, :77-81, :172, :202-205
- **Detail**: Two patterns in `game_match_key` take time that grows with the square of the input once the first match attempt fails. Postgres then retries the match from every later start position. Measured in PGlite:
  - The year pattern `\s*\(\d{4}\)\s*$`, on spaces followed by `(2001) (2001)`, took 46 ms, 159 ms, 617 ms and 2.4 s at 5k, 10k, 20k and 40k characters. A 40k-character control that matches at once took 2 ms.
  - The trailing-qualifier pattern, on `pl ` repeated, took 28 ms, 82 ms and 309 ms at 6k, 12k and 24k characters.
  - Run as `authenticated`, 20k characters took 593 ms.

  Any signed-up account reaches the function in two ways.
  - **RPC.** `authenticated` holds EXECUTE on it (:202-205) in the API-exposed `public` schema, so it is an RPC endpoint that takes any text.
  - **A stored game name.** `watchlist_entries.game_name` has no length check (`20261007141021_create_watchlist_entries.sql:13`), and `authenticated` may insert it (:53). The 200-character cap lives only in the Server Action's schema (`src/lib/watchlist/rules.ts:272`). A direct PostgREST insert therefore stores any length, and the view keys it again on every `/my-deals` read (:172).

  The regex engine checks for query cancel only on DFA cache misses (`rege_dfa.c`), so `statement_timeout` may not end a call once the cache is warm. This is source-level reasoning; it was not tested on the hosted project.

  S-03's review accepted the missing `game_name` check as storage growth only (its F2 and F3; `context/foundation/infrastructure.md:136`). This change makes it a lever on database CPU and on the connection pool that `/`, `/watchlist` and the extractor share.
- **Fix**: One additive migration that does five things:
  1. bound the input of `game_match_key` to a few hundred characters;
  2. rewrite the year pattern without the leading `\s*`, and with ASCII classes in place of `\s` and `\d`, which follow the database's ctype;
  3. add the deferred `char_length` checks on `game_name` and `game_slug`, `not valid` and then `validate`;
  4. follow the rule-change steps (`update public.deals set title = title`), and add a long-input case to `supabase/checks/matching.sql`;
  5. update the risk row at `infrastructure.md:136`.
  - Strength: It closes both ways in at the function itself, through the procedure CLAUDE.md already prescribes for a rule change.
  - Tradeoff: A hand-pushed migration and a rerun of the truth table in the SQL editor. It also reverses part of S-03's decision not to add the database checks.
  - Confidence: HIGH — the growth is reproduced in PGlite, as `authenticated`, and the grants and the missing check are read from the migrations.
  - Blind spot: These were not tested against production: native timings, whether `statement_timeout` interrupts the regex there, and the API gateway's body-size limit. The longest stored title is also unknown, and a title past the bound would key differently.
- **Decision**: FIXED — `supabase/migrations/20261012130317_bound_game_match_key.sql` replaces `game_match_key`.
  - A name longer than 1000 characters keys to `''`.
  - The year pattern drops its leading `\s*` and uses ASCII classes.
  - The keys are recomputed.
  - Not as proposed: the `game_name` and `game_slug` length checks stay deferred. The cap closes both ways in, and the risk register had deferred them on purpose; its row now records the cap.
  - Results in PGlite: `matching.sql` passed 74 of 74, the 40,000-character attack fell from 2.4 s to 1 ms, and inputs just under the cap took 3–5 ms.
  - Pending: Tomasz's push and the SQL-editor rerun.

### F2 — The edition slot strips years and the words the rule keeps

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261012070050_match_deals_to_watchlist.sql:78-79
- **Detail**: The `[a-z0-9]+ edition` and `edycja [a-z0-9]+` alternatives take any one word, including numbers and the words the rule keeps. The pattern is the plan's own, character for character (plan.md:312-313). This is therefore a flaw in the plan, not drift. In PGlite:
  - „Just Dance 2024 Edition”, „Just Dance 2025 Edition” and „Just Dance 2026 Edition” all key to `just dance`, so watching one annual release matches the other years;
  - „Dark Souls Remastered Edition” keys to `dark souls`;
  - „Shadow of the Colossus HD Edition” keys to `shadow of the colossus`;
  - „Wiedźmin 3: Dziki Gon - Edycja HD” keys to `wiedzmin 3 dziki gon`.

  The migration's comments say that Remake, Remastered, Remaster and HD stay (:58-60, :233). They also say that a number belonging to the name, as in „Battlefield 2042”, is told apart from a catalogue's year (:52-54). The truth table tests only „Front Mission 3 Remake”, which has no "edition". The production measurement (0 / 39 wrong) watched no such title.
- **Fix**: In F1's migration, make both free-word slots skip a word that is all digits or is `hd`, `remake`, `remastered` or `remaster`, for example with a negative lookahead. A bare "edition" still goes. Add truth-table rows: the three Just Dance editions key apart, and „… HD Edition” keeps `hd`.
  - Strength: The rule then does what its comments and the plan say. The fix rides on the migration and the key recompute that F1 needs anyway.
  - Tradeoff: One more pattern change for the truth table to pin. After the recompute, deals keyed this way leave the views where they matched wrongly; that is the intended effect.
  - Confidence: HIGH — every example was reproduced in PGlite against the migration as applied.
  - Blind spot: How many live deals carry a number or a kept word before "Edition". None appeared among the 43 deals measured.
- **Decision**: FIXED, in the same migration as F1 (`20261012130317_bound_game_match_key.sql`), as a different implementation from the one proposed.
  - A step before the trailing pattern drops only "edition" after a number or after hd, remake, remastered or remaster, and only "edycja" before one.
  - The trailing pattern stays the plan's, character for character. Lookaheads in its free-word slots gave the same keys but cost 106 ms per key at the cap, against 4 ms.
  - Resulting keys: „Just Dance 2025 Edition” → `just dance 2025`, „… HD Edition” → `… hd`, and „… Edycja HD” → `… hd`.
  - `matching.sql` gains six key rows. With F1's rows it passes 80 of 80 in PGlite, directly and through the fallback.

### F3 — CLAUDE.md has no privilege rule for new functions

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md:55
- **Detail**: These are the repository's first SQL functions.
  - Postgres grants EXECUTE on a new function to PUBLIC, and Supabase's default privileges grant it to anon, authenticated and service_role. In the API-exposed `public` schema, that makes a new function an RPC endpoint for anon.
  - The migration revokes and re-grants correctly (:188-211).
  - CLAUDE.md's rule for new objects in `public` (:55) covers tables only.

  The next new function is therefore safe only if its author copies that block.
- **Fix**: Add a CLAUDE.md bullet under Database migrations. It says that every new function in `public` revokes EXECUTE from `public, anon, authenticated, service_role`, then grants it to each role that calls it. That includes a role whose write evaluates the function in a generated column or an index.
- **Decision**: FIXED — CLAUDE.md's Database migrations section has a new bullet after the table rule: every new function in `public` ships locked, with the revoke, the grants back and why.

### F4 — Production records miss two facts, and one alternative's figures do not follow

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/deals-matched-to-watchlist/acceptance.md:72-77, :89-90
- **Detail**: Three gaps in the records:
  - **Miss titles.** Phase 4 asks for every miss "with its titles and its cause" (plan.md:620). The Misses table gives the card title only, and the causes are read from it. Yet :79 shows that a title the card hides decided deal 2833. change.md does not record the departure (lessons.md: record every departure).
  - **One alternative.** The "first game's Dark Arisen" alternative (:89-90) moves deals 2301–2303 out of the expected set, but keeps 2833, which carries the same name. Applied to all four, it gives recall 38 / 39 and a wrong share of 1 / 39, not 39 / 40 and 39 / 39. Both corrected figures are still within the threshold.
  - **The settle step.** It marked production rows removed at push time (migration :141-152). Nothing records how many; the plan expected "probably zero" (plan.md:747).
- **Fix**: Tomasz runs one read-only query in the SQL editor and returns two things:
  - the three title columns and `match_keys` of deals 2301, 2302, 2303, 2829 and 2833;
  - the phrase rows grouped by `removed_at` around the push.

  The results go into acceptance.md and change.md, with the alternative's figures corrected.
- **Decision**: PARTLY FIXED.
  - Done: acceptance.md's Dark Arisen alternative now moves deal 2833 too, giving 38 / 39 and 1 / 39, or 38 / 38 and 1 / 39 with the Fortnite exclusion. A line under the list records the correction.
  - Pending: Tomasz runs the read-only query (dry-run in PGlite). Its report then fills in the misses' full titles in acceptance.md and the settle step's count in change.md.

### F5 — A decomposed accent folds into a word break

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261012070050_match_deals_to_watchlist.sql:38-49, src/lib/watchlist/rules.ts:156
- **Detail**: The translate table holds precomposed letters only. An accent written as a combining mark (NFD) therefore falls outside `[a-z0-9]` and becomes a space.
  - In PGlite, `fold_for_matching(E'Pokémon')` is `poke mon`, while the precomposed form gives `pokemon`.
  - The TypeScript twin does the same, so parity holds.
  - Such a title would miss its game and phrase entries.

  It is unconfirmed whether any feed, the model or RAWG emits NFD.
- **Fix**: The next time the fold changes, normalise to NFC first in both twins (`pg_catalog.normalize(value, NFC)` and `.normalize("NFC")`), following the fold's settle-and-reindex steps.
- **Decision**: SKIPPED — deferred to the next change of the fold. Doing it now would change the fold in the open migration, which would need its own settle step, a reindex, a change to rules.ts and a parity run, for an input no source is known to send.

## Triage summary

- Fixed: F1, F2 (implemented as a pre-step instead of lookaheads), F3
- Partly fixed: F4 (the arithmetic; the full titles and the settle count wait for Tomasz's read-only query)
- Skipped: F5 (deferred to the next change of the fold)
