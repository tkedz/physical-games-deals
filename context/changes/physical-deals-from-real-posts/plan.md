# Physical Deals from Real Posts (physical-deals-from-real-posts) Implementation Plan

## Overview

S-01, the roadmap's north star: a model reads the collected posts, and `/` shows them as a public list of boxed-edition deals.

- **Extraction.** A new step in the existing collection workflow sends every unprocessed post to an OpenRouter model chosen on a labelled set, once per link and newest first. It stores each item the model returns, with its verdicts, and records the run.
- **The page.** It lists only items that are a physical copy of a game with a stated price. Each links to the shop or to the source post. A deal disappears once its stated expiry day ends. The page says when the data was last refreshed.

The one unknown is whether a model can tell a boxed copy from a key or a download in freehand Polish posts.

- It is measured first, on a labelled set of real posts, before any table or pipeline exists.
- The page goes public only after a random sample of the full backlog run has been reviewed.

## Current State Analysis

- **Posts are collected; nothing reads them.**
  - `public.collected_posts` holds about 2,000 rows (1,573 distinct links) from 15 feeds, all with `processed_at` null (research.md, Volume).
  - The collector runs every four hours (`.github/workflows/collect.yml:14`) as the only step of a 15-minute job (`:35`). The job installs with `npm ci --omit=dev` (`:51`) and scopes each secret to its step (`:53-65`).
- **The backlog contract is an age rule.**
  - The `processed_at` comment (`supabase/migrations/20260923094535_add_processed_at_to_collected_posts.sql:6-7`) and F-02's plan (`context/changes/collector-into-repo-and-database/plan.md:39`) treat a post still null after about seven days as stale.
  - On 2026-09-28, 783 of the 2,000 never-attempted rows were already past that age.
  - Decided in this plan: an attempt counter replaces the age rule.
- **Every table is locked.**
  - `collected_posts` has RLS on and no grants for `anon` or `authenticated` (`supabase/migrations/20260921133305_create_collected_posts.sql:16-20`).
  - Vercel holds only the publishable key (`context/foundation/infrastructure.md:146`), so a Server Component reads as `anon` or `authenticated`.
- **The deals view is a placeholder.**
  - `src/app/(app)/page.tsx:3-17` renders a "W budowie" badge.
  - Its layout reads the session (`src/app/(app)/layout.tsx:14-15`), which makes `/` dynamic per request.
  - The kitchen sink already holds placeholder loading, empty and error samples written for this view (`src/app/kitchen-sink/page.tsx:198-233`).
- **An external-API client pattern exists.**
  - `src/lib/catalog/rawg.ts:102-180` takes the key and `fetch` as parameters. It validates the reply with zod (`:84-100`) and returns typed failure reasons that never carry a URL (`src/lib/catalog/types.ts:27-37`).
  - The collector keeps its pure core in a module with no top-level side effects (`scripts/collector/posts.mts:1-11`).
  - Its Supabase client holds the secret key outside `src/` (`scripts/collector/supabase.mts:3-13`).
- **No model account exists.** `.env.example:26-28` carries an `ANTHROPIC_API_KEY` placeholder. There is no OpenRouter account, credit or key yet (research.md, Open Question 2).
- **Verification tooling.**
  - The repository has no test runner (CLAUDE.md, Verification).
  - The agent has no SQL route to the hosted project and does not run scripts that load `.env.local`. The split is the one `context/changes/email-password-accounts/plan.md:157-165` used.

## Desired End State

- **`/` lists deals.**
  - It shows every stored item that is a game, a physical copy, and has a stated price.
  - Order: newest first by the post's publication time, 30 per page.
  - Each card shows:
    - the title;
    - the platform, when the post states one;
    - the price, in the post's currency;
    - the discount, when the post states a percentage;
    - the expiry day, when stated;
    - links: to the shop when that exact URL is in the post, and always to the source post.
  - A deal disappears once its stated expiry day has ended in Warsaw time. One without a date stays reachable through the pages.
  - Above the list, a line states when the last successful run finished. When that is more than six hours ago, a note says processing may have stopped.
  - The list streams under a skeleton. A failed read shows an inline error with a retry.
- **The database keeps rejected items off the page.** A digital, unclear or unpriced item cannot reach the page, even through a query that forgets its filter, because the `deals` select policy admits only listable rows.
- **Every scheduled `collect` run also extracts.**
  - Pending posts go newest first, one model call per link, within a time budget.
  - A post whose reply fails three counted times is given up.
  - An outage (credits, key, rate limit, provider down) fails the run and turns it red, without counting against any post.
  - Two repository variables let Tomasz pause it, or limit it to posts first seen since a chosen moment, without a deploy. Neither is set at first, so the backlog is processed as below (Phase 3, change 6, added 2026-10-05).
- **The records exist.**
  - The backlog of about 1,573 links is processed.
  - The model choice rests on a labelled set recorded in `evaluation.md`.
  - The first real results were reviewed on a random sample in `review.md`, which answered PRD open questions 2 and 3.

End to end:

- the production page lists deals read through the publishable key;
- `pipeline_runs` gains an `ok` row every four hours;
- the pending count drops back to zero after each run.

### Key Discoveries:

- **`collect.yml`:**
  - `:47-51`: `npm ci --omit=dev` means every runtime import must be a dependency. Plain `fetch` and the installed `zod` 4.6.5 need nothing new.
  - `:33-35`: the worst-case collection is about 5 minutes, against a 15-minute timeout.
- **research.md:**
  - "What 'very cheap' costs": `mistralai/mistral-small-3.2-24b-instruct` costs $0.16–0.31 per 1,000 posts. It has structured outputs on 4 of 4 endpoints and no `reasoning` parameter.
  - "Request fields that matter": the `models` fallback list, `response_format` as strict `json_schema`, and `provider.require_parameters: true`. The body can carry `error` even on a 200, and a 402 carries `error.metadata.limit_source`.
  - "The schema from zod": `z.toJSONSchema()` adds `additionalProperties: false`, spells `.nullable()` as `["T", "null"]`, and leaves `.optional()` fields out of `required`. It also adds a `$schema` key and integer bounds, which no endpoint has been tested against.
- **OpenRouter catalogue** (public `GET /api/v1/models` and `/endpoints`, checked 2026-09-28):
  - `qwen/qwen3.8-27b:free` is served by one provider, ModelRun. It lists `structured_outputs` and `reasoning` but not `response_format`. It was created on 2026-08-14 and carries no expiry date.
  - Its paid variant `qwen/qwen3.8-27b` has 16 endpoints, 14 of them with structured outputs. Output costs $1.875–4.40 per million tokens, against Mistral Small's $0.25.
- **Supabase:**
  - Changelog 45329: from 2026-10-30, new `public` tables on existing projects get no automatic grants, for any role including `service_role`. Existing tables keep theirs. The "Leave `service_role` alone" rule in `CLAUDE.md:40` predates this.
  - splinter lint 0010 `security_definer_view` is at ERROR level, so a public view fails `npm run db:check`. A table with a select policy passes: 0024 ignores `using (true)` on SELECT, and 0026/0027 are WARN, and only when pg_graphql is installed.
  - The Data API silently caps a response at 1,000 rows (`@supabase/postgrest-js`, `PostgrestQueryBuilder.ts:124`). Every list query sets `.range()` or `.limit()`.
  - postgrest resolves to `{ data: null, error }` instead of throwing. It retries a GET up to three times, with 1, 2 and 4 s backoff, on a network error or a 503/520 (`node_modules/@supabase/postgrest-js/dist/index.mjs:63-85`, `:186-230`).
- **Next 16 docs** (under `node_modules/next/dist/docs/01-app/`):
  - `03-api-reference/03-file-conventions/loading.md:88-93`: a layout that reads cookies blocks navigation until it has rendered. `loading.tsx` does not cover its own segment's layout, so the list's boundary sits in the page.
  - `02-guides/interactive-apps.md:182`: a navigation that changes only searchParams shows no pending state; `use-link-status.md` supplies one.
  - `03-file-conventions/loading.md:101-122`: `notFound()` called after streaming has started becomes a soft 404 served as 200. `src/app/kitchen-sink/page.tsx:50-54` already records the trap.
  - `03-file-conventions/error.md:117-121`: `retry()`, stable since 16.3.0, re-fetches the segment. `error.tsx` must be a Client Component.
  - `03-file-conventions/page.md:123-140`: `PageProps<"/">` is global. `searchParams` is a Promise (`02-guides/upgrading/version-16.md:281-291`).
- **Prior changes:**
  - `context/changes/game-catalog-provider-proven/coverage.md:155-163`, F-03's handoff to S-01:
    - emit the original English title (alternative titles are S-01's call);
    - classify "is this a game deal";
    - bundles have no catalogue entry.
  - `context/foundation/infrastructure.md:129`: run outcomes belong in a Supabase table, and the "last refreshed" line reads the same data. F-02 narrowed that for the collector alone (`collector plan:37`).

## What We're NOT Doing

- **No catalogue id on deals.**
  - The model emits the original English title and any alternative titles. There is no RAWG call and no `RAWG_API_KEY` in Actions.
  - S-04 resolves ids, or matches by name, when it designs the edition and platform rules.
  - `/` shows no RAWG data, so it needs no rawg.io link.
- **No merging of one deal across aggregators.** Rows that share a link are extracted once, but the same offer on two aggregators stays two cards. PRD question 2 defers the duplicate problem, and the review measures it.
- **No watchlist narrowing.** The S-01 list is every listed deal, public; S-04 narrows it.
- **No free model in production by default.** `qwen/qwen3.8-27b:free` joins the evaluation as a third candidate, with the free-model training setting on for the evaluation only. It reaches production only if it ranks first and Tomasz picks that route (Phase 1, change 10).
- **No Batch API:** its 24-hour window misses the six-hour requirement.
- **No second extraction path.** cenograj's fixed template goes through the model like every other post.
- **No fetching beyond what the collector stored.** That excludes lowcygier's full articles behind their excerpts, and pepper's `pepper:merchant` element.
- **No computed discounts and no price judgement.** A discount appears only when the post states a percentage cut (PRD Non-Goals).
- **No automatic re-extraction** after a prompt or model change. Re-extraction is a deliberate reset of chosen rows (Migration Notes).
- **No change to the collector's code, schedule or feeds.**
- **No alerting** beyond a red workflow run and the page's stale note.
- **No indexes** on the new tables, as F-02 decided for its table at this scale (`collector plan:38`). They can be added later.
- **No SDK.** That rules out `@openrouter/sdk`, whose retries run up to an hour, longer than the job timeout. It also rules out `openai` and `@openrouter/ai-sdk-provider`.
- **No model-expiry watcher.** The `models` fallback absorbs an expired primary, and each extraction records the model that answered.
- **No committed post content.** The labelled set commits its labels, keyed by post id; the post text stays in a gitignored file, as F-02 kept its data file out of version control.
- **No column-level grants.** Hidden data lives in a locked table instead: Supabase advises against column privileges, and `select *` fails under them.
- **No `cacheComponents`, no `use cache`, no segment-config exports.**
- **No fix for the focus indicator on the outline and destructive button variants**, which ui-init deferred. The view avoids those variants.

## Implementation Approach

Measure the unknown first, then build around the result:

1. **Extraction contract and evaluation.**
   - The output schema, the prompt, the OpenRouter client and the pure decisions land together with an evaluation script and a labelled set of about 50 real posts.
   - The model list is chosen on digital leaks before any table exists, from three candidates: two paid, one free.
2. **Tables.** Four additive migrations:
   - attempt columns on `collected_posts`;
   - a locked `post_extractions`;
   - `deals` and `pipeline_runs` with select policies, the repository's first public-read policies.
3. **Pipeline.**
   - The extractor runs as a step after collection.
   - Tomasz proves the key locally, adds the secret and starts the first run.
   - The backlog drains on the schedule, and a random sample of the results is reviewed before anything is public.
4. **View.** Components and their states land in the kitchen sink first, then `/`.

The domain decisions stay pure and take data (`context/foundation/lessons.md`, "Separate logic from I/O"):

- what the reply means, and which links are trusted;
- when a deal expires, and what is listable;
- whether a failure belongs to the post or the service;
- whether a run succeeded, whether the data is fresh, and which page was asked for.

`scripts/extract/openrouter.mts` is the only file that knows OpenRouter, as `rawg.ts` is for RAWG. I/O modules only fetch and write.

## Critical Implementation Details

### Supabase stops granting new tables automatically on 2026-10-30

- From that date the hosted project creates `public` tables with no privileges for any Data API role, `service_role` included (changelog 45329).
- Each new table's migration therefore revokes from `anon, authenticated` as before, and then grants exactly what is needed:
  - `select` to `anon, authenticated` on the two public tables;
  - to `service_role`, only the privileges the extractor uses.
- A missing writer grant shows up as `42501` in the Actions log, not when the migration is pushed.

### The request carries only what the endpoints support

- With `provider.require_parameters: true`, OpenRouter routes only to endpoints that support every parameter in the request. A parameter the model does not list can therefore leave no endpoint at all.
  - Mistral Small and GPT-4.1 nano list no `reasoning`, so their requests never carry it.
  - The Qwen candidate is a reasoning model, and `reasoning` is the parameter that switches its reasoning off. A request that carries `reasoning` therefore names that model alone; it cannot share a `models` list with the other two.
  - The free Qwen entry lists `structured_outputs` but not `response_format`. If `require_parameters` finds no endpoint for it, the evaluation records that and retries once without the flag, leaving zod to judge the replies.
- The `$schema` key and the integer bounds in the zod-generated schema are untested on these endpoints. Phase 1's evaluation makes the first live call, and the response-format builder strips them if an endpoint rejects them.
- Read a reply from its body, never from the status alone: a 200 can carry `error`.

### Write order per link

1. Upsert the link's `post_extractions` row.
2. Replace its `deals` rows: delete, then insert.
3. Only then set `processed_at` on every `collected_posts` row with that link. Close them by link, not by the ids fetched, so rows beyond the fetched window close too.

A crash before step 3 leaves the rows pending, and the next run re-extracts and replaces. Nothing is ever marked processed with its deals missing.

### A failure that hits every post must not spend attempts

- A per-post failure is an invalid or truncated reply, a 400, or a moderation 403. It increments the link's `extraction_attempts` only in a run that also produced at least one successful extraction.
- So a run in which nothing succeeded, because of a schema the endpoint rejects or a broken deploy, leaves every counter untouched.
- Outages stop the run at once and never count.

### Expiry crosses a DST change inside the project window

- Europe/Warsaw leaves summer time on 2026-10-25, before the 2026-11-04 deadline. Both the Actions runner and Vercel run in UTC.
- The exclusive end of a stated day is the next day's local midnight. Resolve it through `Intl` with `timeZone: "Europe/Warsaw"`, never a fixed `+02:00`:
  - "do 30.09" ends at `2026-09-30T22:00:00Z`;
  - "do 25.10" ends at `2026-10-25T23:00:00Z`.
- A stated hour is honoured.

### Pagination under a streaming page

- The page wraps the list in `<Suspense key={page}>`, so the skeleton returns on a page change.
- It adds a `useLinkStatus` hint, because a navigation that changes only searchParams shows no pending state.
- An unreadable `page` clamps to 1. Calling `notFound()` after streaming has started would produce a soft 404 with status 200.
- A failed read renders inline with a retry; `error.tsx` is only the safety net for unexpected throws.

### Who runs what

- **Tomasz** creates the OpenRouter account, buys the credits, creates the key, and puts it into `.env.local` and the Actions secrets. He also switches the free-model training setting on for the evaluation, and back off afterwards unless a free model enters `MODELS`. The key never enters the conversation or the repository (`context/foundation/lessons.md`, "Prove a narrowed credential").
- **Tomasz runs the scripts that load `.env.local`:** `npm run extract`, `npm run extract:eval`, `npm run extract:report`, `npm run dev` and `npm run start`. He shares the printed output; none of these commands prints a key or a request URL.
- **Tomasz runs every SQL check** in the Supabase SQL editor, and every `db:push`, because the agent has no SQL route to the hosted project (as in `context/changes/email-password-accounts/plan.md:157-165`).
- **The agent runs:**
  - `npx supabase gen types typescript --linked --schema public`, its read-back of the table shape;
  - `npm run build`, `npm run lint` and `npm run format:check`;
  - the scripts without an env file (`node scripts/extract/<script>.mts`), for the missing-variable checks;
  - `curl` against a server Tomasz has started, and the screenshots.

---

## Phase 1: Extraction contract and labelled-set evaluation

### Overview

This phase lands everything that decides what a post means, plus the client that asks the model. An evaluation script runs them against about 50 labelled real posts, and its result fixes the `models` list. Nothing is written to the database, and nothing runs on a schedule.

### Changes Required:

#### 1. OpenRouter account and key (Tomasz)

**Intent**: This is the route agreed in planning: one $10 credit purchase, paid models in production unless the evaluation says otherwise, and a key whose credit limit caps a runaway loop. The purchase comes first, because it also lifts the free tier from 50 to 1,000 requests a day, which the free candidate's evaluation needs.

**Contract**:

- An OpenRouter account with $10 of credits bought.
- The free-model training setting switched on for the evaluation, since the free endpoint cannot be reached without it. It goes back off afterwards unless a free model enters `MODELS`.
- A key with a monthly credit limit. $3 covers several times the expected first month, backlog included.
- `OPENROUTER_API_KEY` in `.env.local`.

Tomasz confirms each step without the key being read or pasted anywhere.

#### 2. Shared vocabulary

**File**: `src/lib/deals/types.ts` (new)

**Intent**: One definition of the words both sides use (kinds, editions, platforms), so the extractor that writes them and the view that reads them cannot drift apart. The file holds types only, so Node erases its import from the scripts, as it does for `src/lib/catalog/types.ts`.

**Contract**:

- `DealKind = "game" | "not_game"`
- `Edition = "physical" | "digital" | "unclear"`
- `Platform = "ps5" | "ps4" | "xbox-series" | "xbox-one" | "switch" | "switch-2" | "pc" | "other"`

The scripts import these with a whole-statement `import type` and check their zod enums against them with `satisfies`.

#### 3. Output schema

**File**: `scripts/extract/schema.mts` (new)

**Intent**: The shape the model must return, written once in zod. It generates the `response_format` JSON schema and validates every reply, because strict mode is not guaranteed on every endpoint (research.md, "Two documents disagree").

**Contract**: `{ items: Item[] }`, with zero or more items per post. Every field is required, and nullable where a value can be absent: `.nullable()`, never `.optional()`.

| Field | Meaning |
| --- | --- |
| `kind` | `game` for a copy of a video game in any edition, including collector's editions, pre-orders and used copies. `not_game` for hardware, console bundles, accessories, merchandise, soundtracks, subscriptions, gift cards, DLC and top-ups |
| `edition` | `physical`, `digital` or `unclear`; `unclear` when the post does not settle it |
| `editionEvidence` | a short verbatim quote from the post supporting `edition`, or null |
| `title` | the game or product as the post names it, without price or shop |
| `englishTitle`, `alternativeTitles` | the original title, and the other names the post uses (F-03 handoff) |
| `platform` | a `Platform`, or null when the post names none |
| `price` | `{ amount, currency }` as stated for this item, with an ISO 4217 currency, or null |
| `discountPercent` | a stated percentage cut from an earlier price, or null. A price advantage over another offer ("Przewaga cenowa") is not one |
| `expiresOn`, `expiresAt` | the stated last day (`YYYY-MM-DD`, relative phrases resolved against the publication date) and an optional hour (`HH:MM`), or null |
| `shopUrl`, `shopName` | one URL copied from the post for this item, and the shop's name, or null |

`toResponseFormat()` returns `{ type: "json_schema", json_schema: { name, strict: true, schema } }`. It removes `$schema` and the integer bounds if the first live call shows that an endpoint rejects them.

#### 4. Prompt

**File**: `scripts/extract/prompt.mts` (new)

**Intent**: The instructions and input for one link, as a pure function: a post in, messages out. The edition rules cover the known traps from research.md ("Keyword rules fail on this text"):

- "pudełko" that is not the game's box;
- "kod" meaning a discount code rather than an activation key;
- Game Pass and eShop offers, and key shops;
- digests with several offers;
- cenograj's "Przewaga cenowa".

**Contract**:

- `PROMPT_VERSION`, bumped on any change to the prompt or the schema.
- `buildMessages(group)`: built from the link's representative row plus the feed hints of every row sharing the link. The publication date is given in Warsaw local time.
- `postText(content)`: turns the stored HTML into text that keeps each link target inline.
- `postHrefs(content)`: returns the entity-decoded `href` values.

The text passed on is exactly what the collector stored (`scripts/collector/posts.mts:114-119`).

#### 5. OpenRouter client

**File**: `scripts/extract/openrouter.mts` (new)

**Intent**: The only file that knows OpenRouter's URL, headers, request fields and error shapes. It follows the `rawg.ts` shape: key and `fetch` passed in, no environment read, no top-level side effects, and nothing returned or thrown that carries the key.

**Contract**:

- **`readOpenRouterApiKey(env)`** throws before any request when the key is unset or empty.
- **`createOpenRouterClient({ apiKey, fetch })`** exposes one call. It takes the messages, the model list and the response format, and returns one of:
  - `{ ok: true, output, model, usage, generationId }`, where `model` is the one that answered and `usage` carries tokens, reasoning tokens and `cost`;
  - `{ ok: false, reason, status, scope }`.
- **`classifyOpenRouterFailure(status, body)`** is pure:
  - `scope: "systemic"`: a network error, a timeout, 401, 402 (any `limit_source`), 408, 429, any 5xx, 524 and 529. The transient ones are systemic only after one retry that honours `Retry-After` up to a cap.
  - `scope: "post"`: 400, 403, and a reply that is not valid JSON or fails the schema.
- **The request** sends `models`, `response_format`, `provider: { require_parameters: true }` and a `max_tokens` that fits a digest post. It sends `reasoning` only for a model whose config entry asks for it, and such a request names that model alone (see Critical Implementation Details).

#### 6. Decisions on a reply

**File**: `scripts/extract/deals.mts` (new)

**Intent**: Turns a validated reply and its post into rows, and holds every rule that decides what reaches the page. It is pure, so the evaluation, the pipeline and a future test runner all call the same code.

**Contract**:

- **`toDealRows(output, group)`** maps items to `deals` rows (the columns in Phase 2), with `item_index` in reply order.
- **`verifyShopUrl(url, hrefs, postHost)`** keeps a URL only when all three hold; otherwise it returns null, and the card falls back to the post link:
  - it is one of the post's own `href`s;
  - it uses `http:` or `https:`;
  - it is not on the aggregator's own host.
- **`expiryInstant(expiresOn, expiresAt)`** returns the exclusive end instant in Europe/Warsaw (see Critical Implementation Details).
- **`isListable(row)`**: `kind = "game"`, `edition = "physical"`, and a price. The `deals` select policy in Phase 2 states the same predicate.
- **`decideRunOutcome({ collectSucceeded, systemicFailure })`**: `ok` only when collection succeeded and no systemic failure stopped the run. Per-post failures and leftover backlog do not fail a run.
- **`shouldCountFailures(run)`**: true only once the run has at least one successful extraction.

#### 7. Model list and budgets

**File**: `scripts/extract/config.mts` (new)

**Intent**: The values a model or pace change touches, in one checked-in place, so such a change goes through the evaluation and the review like any other commit.

**Contract**:

- `CANDIDATES`: the models the evaluation runs, each with its request options.
  - `mistralai/mistral-small-3.2-24b-instruct` and `openai/gpt-4.1-nano`, with no `reasoning`.
  - `qwen/qwen3.8-27b:free`, with reasoning switched off where its endpoint allows it.
- `MODELS`: the production list, ordered with the primary first. It starts as the two paid candidates, and ends as whatever `evaluation.md` records.
- `MAX_ATTEMPTS = 3`.
- A per-run time budget (about 8 minutes), a per-run link cap, and a small concurrency (about 4).

Every model in `MODELS` must have passed the labelled set, because the fallback writes deals too.

#### 8. Labelled set

**Files**: `scripts/extract/eval/labels.json` (new, committed), `scripts/extract/eval/posts.json` (new, gitignored), `.gitignore`

**Intent**: A fixed, reusable check of the edition judgement on real posts, weighted towards the known traps. The labels are committed; the post text is not.

**Contract**:

- **The query.** The agent supplies one read-only query, which Tomasz runs in the SQL editor. It returns a single `json_agg` cell with one representative row per link:
  - about 20 pepper, 15 lowcygier and 10 cenograj links, picked at random;
  - plus trap posts found with `ilike`: "pudełko do pizzy", "Game Pass", "eShop", "Przewaga cenowa", a key shop, and a digest with several offers.

  Tomasz saves the cell as `posts.json`.
- **The labels.** The agent drafts `labels.json` from `posts.json`. For each post id, it lists the expected items with `kind`, `edition`, `englishTitle`, `platform`, `price`, `discountPercent`, and `expiresOn` where stated, plus a note on the trap the post covers. Tomasz corrects every label.
- **`.gitignore`** gains `/scripts/extract/eval/posts.json`.

#### 9. Evaluation

**Files**: `scripts/extract/evaluation.mts` (new), `scripts/extract/eval.mts` (new), `package.json`

**Intent**: The measurement the model is chosen on, in the shape of the catalogue probe (`scripts/catalog/probe.mts`): pure scoring in its own module, and a `main()` that prints a Markdown report the record can quote as printed.

**Contract**:

- **`evaluation.mts`** (pure) matches expected and returned items by normalised English title and platform. It then counts, per model:
  - **digital leaks**: listable items that the label says are not a physical game;
  - missed physical deals, and the wrong game;
  - field errors: price, currency, platform, discount, expiry;
  - invalid replies, reasoning tokens, latency, and cost.
- **`eval.mts`:**
  - Reads the key first, then both files, and fails fast on a label whose id has no post.
  - Runs every entry in `CANDIDATES`. It calls each model on its own, as `models: [id]` with no fallback, so every answer is attributable, and checks that the model which answered is the one asked.
  - Keeps the free candidate under its limit of 20 requests a minute. If that endpoint answers that reasoning cannot be switched off, the script reruns the candidate with reasoning on and says so in the report.
  - Prints, per post, the expected items against the returned ones, then the per-model totals, latency included.
  - `--model <id>` limits the run to one candidate.
- **`package.json`** gains `"extract:eval": "node --env-file-if-exists=.env.local scripts/extract/eval.mts"`. Add `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` if any script ends up importing a value from `src/`.

#### 10. Evaluation record

**File**: `context/changes/physical-deals-from-real-posts/evaluation.md` (new)

**Intent**: What the model was chosen on, quoted from the report, the way F-03 recorded its verdict in `coverage.md`.

**Contract**: The record holds:

- the per-model table;
- the rule applied: only models with zero digital leaks are eligible; then the fewest missed physical deals wins, then the fewest field errors, then the lowest cost;
- the resulting `MODELS` order, the prompt version and the cost per post;
- what the first live call settled: whether the request shape was accepted, and whether the paid models' reasoning tokens stayed at zero.

If the free candidate ranks first, Tomasz picks the production route here, on the numbers:

- **The free model first, a paid model as fallback.** Phase 3's extractor then calls the models in order itself, because the free model's request carries `reasoning` and the paid ones cannot. The training setting stays on, and a run's link cap follows the free tier's 20 requests a minute.
- **Its paid variant**, `qwen/qwen3.8-27b`, after its own run on the labelled set.
- **The best paid candidate**, as if the free one had not run.

If no model reaches zero leaks after two prompt iterations, the work stops here and the leaked items go to Tomasz before Phase 2 starts.

#### 11. Key and documentation

**Files**: `.env.example`, `CLAUDE.md`, `context/deployment/alternative-git-integration.md`, `context/foundation/roadmap.md`

**Intent**: The repository states where the new key lives, and what S-01 now does and does not do.

**Contract**:

- **`.env.example`:**
  - The `ANTHROPIC_API_KEY` block (`:26-28`) becomes `OPENROUTER_API_KEY`: server-only and never `NEXT_PUBLIC_`. Its destinations are the GitHub Actions secrets (the extract step) and `.env.local` (the extract scripts). It is created with a credit limit.
  - The RAWG line (`:23`) no longer promises an Actions secret for S-01. S-04 decides whether the pipeline needs RAWG.
- **`CLAUDE.md`** gains a `## Deal extraction` section stating the facts:
  - the provider is OpenRouter, and `scripts/extract/openrouter.mts` is the only file that knows it;
  - `OPENROUTER_API_KEY` is server-only, never `NEXT_PUBLIC_`, and lives in the Actions secrets, scoped to the extract step;
  - the model list is `scripts/extract/config.mts`, and a model enters it only after passing `npm run extract:eval`.

  The sanctioned credential-loading list (`:63`) gains `npm run extract`, `npm run extract:eval` and `npm run extract:report`.
- **`alternative-git-integration.md:110`**: `ANTHROPIC_API_KEY` becomes `OPENROUTER_API_KEY`.
- **`roadmap.md`:**
  - S-01's outcome (`:137`) says "a game named by its original title, with its platform where the post states one" instead of "a recognised game with its platform".
  - The model unknown (`:146`) is answered with the chosen model and the cost per post from `evaluation.md`.
  - S-04 gains an unknown recording that deals carry titles, not catalogue ids.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run format:check` and `npm run build` pass
- `node scripts/extract/eval.mts`, run without an env file, exits non-zero with a message naming `OPENROUTER_API_KEY` before reading any file or sending any request
- `git check-ignore -q scripts/extract/eval/posts.json` succeeds, and `scripts/extract/eval/labels.json` is not ignored

#### Manual Verification:

- Tomasz confirms the OpenRouter account, the $10 purchase, the free-model training setting switched on for the evaluation, the key's monthly credit limit, and `OPENROUTER_API_KEY` in `.env.local`, without the file being read
- Tomasz runs the sample query and saves the cell as `scripts/extract/eval/posts.json`
- Tomasz corrects every drafted label in `scripts/extract/eval/labels.json`
- Tomasz runs `npm run extract:eval`, and its output carries no key and no request URL
- `evaluation.md` records the results for all three candidates and a `MODELS` list whose every model has zero digital leaks and an accepted request shape, with zero reasoning tokens on every paid model and, if the free candidate ranked first, Tomasz's choice of route; Tomasz accepts it
- The free-model training setting is off again, unless `evaluation.md` puts a free model in `MODELS`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Tables for deals, extractions and runs

### Overview

Four additive migrations give the extractor somewhere to write and the page something it may read. Each opens with the two header lines CLAUDE.md requires, and each of the two public tables justifies its policy inside its migration.

### Changes Required:

#### 1. Attempt state on posts

**File**: `supabase/migrations/<timestamp>_add_extraction_attempts_to_collected_posts.sql` (new, via `npm run db:new -- add_extraction_attempts_to_collected_posts`)

**Intent**: Lets a run tell a never-attempted post from a failing one, which `processed_at` alone cannot (research.md, "The backlog marker"). It also retires the seven-day age rule.

**Contract**:

- New columns: `extraction_attempts smallint not null default 0`, with a non-negative check, and `extraction_error text`, the last per-post failure reason.
- The `processed_at` comment is rewritten: a post is pending when `processed_at is null and extraction_attempts < 3`, whatever its age. The collector and the importer still write neither column.
- Backward-compatible: yes. The new columns are nullable or have a default, and both scripts name only their nine columns.

#### 2. Extraction record

**File**: `supabase/migrations/<timestamp>_create_post_extractions.sql` (new)

**Intent**: What was run on each link and what came back: the model that answered, the prompt version, the validated reply, tokens and cost. It covers links that yielded no items too, so a review or a later prompt change can see them.

**Contract**:

- One row per link: `link text primary key`; `post_id text not null references collected_posts(id)`, the representative row; `model`; `prompt_version`; `item_count`; `output jsonb`; token counts; `cost_usd`; `generation_id`; `extracted_at`.
- Locked: RLS on, `revoke all … from anon, authenticated`, and no policy. Then `grant select, insert, update … to service_role`.

#### 3. Deals

**File**: `supabase/migrations/<timestamp>_create_deals.sql` (new)

**Intent**: One row per item the model returned, with its verdicts, so the review can see rejections next to acceptances. A select policy lets the publishable key read only the listable rows.

**Contract**:

- **Columns:**
  - `id bigint generated always as identity primary key`;
  - `link text not null references post_extractions(link) on delete cascade`, and `item_index smallint not null`, unique together;
  - `source`;
  - `published_at timestamptz not null`: the post's own, falling back to `first_seen_at`;
  - `kind`, `edition` and `platform`, with checks that mirror `src/lib/deals/types.ts`;
  - `title`, `english_title` and `alternative_titles text[]`;
  - `price_amount numeric(10,2)` and `currency`, either both null or both set;
  - `discount_percent smallint`, between 1 and 99;
  - `expires_at timestamptz`;
  - `shop_url` and `shop_name`;
  - `edition_evidence`;
  - `extracted_at`.
- **Grants:** `revoke all … from anon, authenticated`, then `grant select … to anon, authenticated`, and `grant select, insert, delete … to service_role`.
- **Policy.** A justification written above it gives four reasons:
  - the S-01 view is public;
  - Vercel holds only the publishable key, so its Server Components read as `anon` or `authenticated`;
  - the rows derive from public RSS posts;
  - the predicate keeps a digital, unclear or unpriced row off the page even if a query forgets its filter.

```sql
create policy "listed deals are public" on public.deals
  for select to anon, authenticated
  using (kind = 'game' and edition = 'physical' and price_amount is not null);
```

#### 4. Runs

**File**: `supabase/migrations/<timestamp>_create_pipeline_runs.sql` (new)

**Intent**: The run outcomes `context/foundation/infrastructure.md:129` asks for, and the source of the page's "last refreshed" line.

**Contract**:

- **Columns:**
  - `id bigint generated always as identity primary key`;
  - `started_at` and `finished_at`;
  - `collect_succeeded boolean`;
  - `outcome text check (outcome in ('ok', 'failed'))` and `failure_reason`;
  - counts of links attempted, extracted and failed, of listed deals written, and of pending links left;
  - `cost_usd`.
- **Access:**
  - RLS on; `revoke all` from `anon, authenticated`, then `grant select` to them, and `grant select, insert` to `service_role`.
  - Policy: `for select to anon, authenticated using (outcome = 'ok')`, justified as the public freshness line.

#### 5. Migration rule

**File**: `CLAUDE.md` (`## Database migrations`)

**Intent**: The rule matches what the platform now requires and what these migrations do.

**Contract**:

- `:40` says a policy is added only when a client holding the publishable key genuinely needs the rows, whether a browser or a Server Component on Vercel.
- `:40` also replaces "Leave `service_role` alone": each new table grants `service_role` exactly what the server-side writer uses, because from 2026-10-30 Supabase grants new tables to no role automatically.
- The row-writes sentence at `:39` names the extractor next to the collector.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run format:check` pass
- After Tomasz's push, `npx supabase gen types typescript --linked --schema public` shows `post_extractions`, `deals` and `pipeline_runs` with the planned columns and nullability, and the two new `collected_posts` columns

#### Manual Verification:

- Tomasz runs `npm run db:push -- --dry-run`, and it lists exactly the four new migrations
- Tomasz runs `npm run db:push`, then `npm run db:check` exits 0
- Tomasz runs `npm run db:status`, and local and remote agree
- Tomasz's grants query on `information_schema.role_table_grants` shows `select` for `anon` and `authenticated` on `deals` and `pipeline_runs` only, and for `service_role` exactly the planned privileges on the three new tables

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Extraction on the cron, backlog run and sample review

### Overview

The extractor runs after every collection. Tomasz proves it with the real key before it goes into CI, and the backlog drains on the schedule. A random sample of the results is reviewed before the page exists.

### Changes Required:

#### 1. Database I/O

**File**: `scripts/extract/store.mts` (new)

**Intent**: Every read and write the extractor makes, in the order that keeps a crash harmless (see Critical Implementation Details). As with `insertPosts` (`scripts/collector/posts.mts:229-250`), no decision lives here.

**Contract**:

- `loadPending(client)`: reads up to 1,000 pending rows, the Data API's cap, newest `first_seen_at` first.
- `saveExtraction(client, group, reply, rows)`: performs the writes for one link, in order.
- `countFailure(client, link, reason)`: increments `extraction_attempts` and sets `extraction_error` on every row of the link.
- `closeWithoutCall(client, ids)`: closes rows that have no link.
- `recordRun(client, run)` and `countPending(client)`.

The client is `createCollectorClient()` from `scripts/collector/supabase.mts`, whose comment is updated to name both callers.

#### 2. The run

**Files**: `scripts/extract/extract.mts` (new), `package.json`

**Intent**: One pass over the pending posts, in the collector's shape: credentials checked before anything is read, a summary printed at the end, and an exit code that turns the workflow red only when the run failed.

**Contract**:

- **Startup.** Reads `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `OPENROUTER_API_KEY` first, and exits naming the first one missing.
- **Grouping.** Groups pending rows by link. Rows without a link are closed without a call, since nothing listable can come of them.
- **Extraction:**
  - Extracts newest first, with the configured concurrency.
  - Sends the `MODELS` list in one request. If `evaluation.md` chose the free model first, the run instead calls the models in order itself: a systemic failure of one model moves the link on to the next, and the run stops only when every model has failed systemically.
  - Stops starting links once the time budget or the link cap is reached, and lets calls already in flight finish.
  - Stops at the first systemic failure, without counting it against any post.
  - Counts per-post failures only in a run with at least one success.
- **Run record.** Writes a `pipeline_runs` row when `COLLECT_OUTCOME` is set, which happens inside the workflow. A local run prints its summary only.
- **Summary.** Prints links extracted, failed and skipped; listed deals; the models that answered; the cost; and the pending links left. It never prints a key or a request URL.
- **Exit code.** 1 on a systemic failure or a crash of the extractor itself; 0 otherwise.
- **Options.** `--limit <n>` caps a local proving run.
- **`package.json`** gains `"extract": "node --env-file-if-exists=.env.local scripts/extract/extract.mts"`.

#### 3. Workflow step

**File**: `.github/workflows/collect.yml`

**Intent**: Extraction runs right after collection on the same cron (`context/foundation/infrastructure.md:43`), with its key scoped to its own step. It still runs when collection failed, so the backlog keeps draining.

**Contract**:

- The collect step gets `id: collect`, and the new step below follows it.
- `timeout-minutes` becomes 20: a worst-case collection of about 5 minutes plus the extraction budget of about 8. (2026-10-05: 25, because a call in flight can now take 180 seconds twice; see `change.md`.)
- The header comment and the `npm ci` comment name the extractor too.

```yaml
      - name: Extract deals
        # Runs after a failed collection too: the backlog can still drain.
        if: ${{ !cancelled() }}
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
          COLLECT_OUTCOME: ${{ steps.collect.outcome }}
        run: npm run extract
```

#### 4. Review report

**Files**: `scripts/extract/report.mts` (new), `package.json`

**Intent**: The first real results in a form Tomasz can judge in one sitting, since the agent cannot query the table.

**Contract**:

- `--sample <n>` reads the processed links in pages of 1,000 and picks n of them at random in the script.
- For each link it prints:
  - the aggregator, and the post's title and link;
  - each item with `kind`, `edition`, the evidence, price and platform, and whether it is listed.
- It ends with counts per aggregator.
- `package.json` gains `"extract:report"`, which loads `.env.local` like the other two.

#### 5. Review record and answers

**Files**: `context/changes/physical-deals-from-real-posts/review.md` (new), `context/foundation/prd.md`, `context/foundation/roadmap.md`

**Intent**: The PRD defers its questions 2 and 3 to the first real results, so this is where they are answered.

**Contract**:

- **`review.md`** quotes the report's counts and records Tomasz's judgements:
  - wrong entries among the listed deals: digital, not a game, wrong game, wrong price;
  - physical deals wrongly rejected, per aggregator;
  - how often one offer appeared on two aggregators;
  - a handoff to S-04: deals carry titles, not ids; the `alternative_titles` column; deals without a platform.
- **`prd.md`:** open questions 2 and 3 (`:121-122`) get Tomasz's answers, in Polish.
- **`roadmap.md`:** open questions 2 and 3 get `Answered <date>: …`, in the form of question 7's answer.

If the share of wrong listed entries is above the threshold Tomasz sets, Phase 4 does not start. The fix, either a prompt iteration with a reset of the affected rows or a narrowing of the sources, is agreed with Tomasz on the review's data.

#### 6. Cut-off and pause (added 2026-10-05)

**Files**: `scripts/extract/pipeline.mts`, `scripts/extract/store.mts`, `scripts/extract/extract.mts`, `.github/workflows/collect.yml`, `CLAUDE.md`

**Intent**: Tomasz can stop and resume extraction, and limit it to posts collected since a chosen moment, from the repository's settings, without a code change or a deploy. The cost of the remaining backlog thereby stays Tomasz's call (`change.md`, 2026-10-05). With neither variable set, nothing changes: the backlog is processed as planned.

**Contract**:

- **Cut-off.** `readCutoff(value)`, pure, reads `EXTRACT_SINCE`:
  - unset or empty: no cut-off, and every pending post is eligible. This is the default;
  - a date, `YYYY-MM-DD`: from the start of that day in Warsaw;
  - an instant with its offset, such as `2026-10-05T12:00:00+02:00`;
  - anything else stops the run before any read, naming the variable, so that a typo never widens a run.
- **Reads.** `loadPending(client, since)` takes only the pending rows first seen at or after the cut-off. `countPending` keeps counting every pending link, those before the cut-off included, as `pipeline_runs.links_pending` is documented. The summary names the cut-off.
- **Pause.** The extract step runs only while the repository variable `EXTRACT_PAUSED` is not `true`; collection runs either way. A paused run records no `pipeline_runs` row, so six hours later the page's stale note appears. Deleting the variable resumes extraction, and everything still pending since the cut-off is processed, the paused period included.
- **Wiring.** In the workflow, `EXTRACT_SINCE` comes from the repository variable of the same name. `CLAUDE.md`'s `## Deal extraction` names both variables.
- **Locally**, `--since <value>` sets the cut-off for one run, ahead of `EXTRACT_SINCE`, and reads the same values. The command is then the same in cmd, PowerShell and Git Bash, which disagree on how to set a variable for one command.
- **Check 3.8.** With a cut-off set, it counts only the posts first seen since the cut-off.

#### 7. Set offers (added 2026-10-06)

**Files**: `scripts/extract/schema.mts`, `scripts/extract/prompt.mts`, `scripts/extract/deals.mts`, `scripts/extract/store.mts`, `scripts/extract/review.mts`, `supabase/migrations/<timestamp>_add_set_with_to_deals.sql` (new)

**Intent**: The review found an offer for two games at one price split into two deals, each at the set's price, with nothing marking them as one offer (`review.md`, #58). Tomasz's rule: a set offer belongs in the results for each game in it, and its card says at once that the price is for the set. This is the smallest version of that rule. Deals already extracted stay as they are.

**Contract**:

- **Schema.** Each item gains `setWith`, the other games sold together with it for the stated price, or an empty list. It is required, like every field.
- **Prompt.** A set of separately titled games at one price gives one item per game, each with the set's price, and the others in `setWith`. A collection sold under a title of its own stays one item with an empty `setWith`. `PROMPT_VERSION` becomes 3.
- **Table.** `deals` gains `set_with text[] not null default '{}'`, in one additive migration. The existing grants and the select policy cover it.
- **Mapping.** `toDealRows` copies the names, cleaned, without repeats and without the item's own title.
- **Report.** The review report shows the set for each item that has one.
- **Order of release.** The migration is pushed before the code reaches `main`, because the extractor writes the new column.
- **Phase 4.** The card shows the set; see Phase 4, changes 3 and 4.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run format:check` and `npm run build` pass
- `node scripts/extract/extract.mts`, run without an env file, exits non-zero naming the first missing variable before any request
- With placeholder credentials and `EXTRACT_SINCE` set to a value that is not a date, `node scripts/extract/extract.mts` exits non-zero naming `EXTRACT_SINCE` before any request (added 2026-10-05)
- `npm run lint`, `npm run format:check` and `npm run build` pass with change 7 (added 2026-10-06)
- After Tomasz's push, `npx supabase gen types typescript --linked --schema public` shows `deals.set_with` as a non-null `string[]` (added 2026-10-06)

#### Manual Verification:

- Tomasz runs `npm run extract -- --limit 3`; the summary reports three links extracted, and no run row is written
- With `OPENROUTER_API_KEY` set to an invalid value in the shell, Tomasz's `npm run extract -- --limit 1` exits non-zero with a systemic failure, and his SQL shows every `extraction_attempts` unchanged
- Tomasz adds `OPENROUTER_API_KEY` to the Actions secrets, and a `workflow_dispatch` run of `collect` is green, its log showing links extracted and cost with no credential or request URL
- That run wrote a `pipeline_runs` row with `outcome = 'ok'` (Tomasz's SQL)
- In the SQL editor, `deals` read as `anon` returns only game, physical, priced rows, while the owner role also sees the rejected ones (Tomasz's SQL)
- Within two days of scheduled runs the pending count (`processed_at is null and extraction_attempts < 3`) reaches 0, and a later run processes the posts it collected (Tomasz's SQL, twice)
- Tomasz reviews `npm run extract:report -- --sample 100`, and `review.md` records the results and his answers to PRD questions 2 and 3
- The PRD's and the roadmap's questions 2 and 3 carry those answers, and the share of wrong listed entries is within Tomasz's threshold
- With `--since` set to a moment in the future, Tomasz's `npm run extract` reads no pending rows, makes no call and exits 0 (added 2026-10-05)
- With the repository variable `EXTRACT_PAUSED` set to `true`, a `workflow_dispatch` run of `collect` has Collect green and Extract deals skipped; with the variable deleted, the next run extracts again (added 2026-10-05)
- Tomasz pushes the `set_with` migration: the dry run lists it alone, and `npm run db:check` exits 0 (added 2026-10-06)
- `npm run extract:eval` at prompt version 3 shows zero digital leaks, and `evaluation.md` records the run (added 2026-10-06)
- Tomasz re-extracts the #58 link from `review.md`, and both of its deals carry the other game in `set_with` (added 2026-10-06)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Public deals view

### Overview

The components, and every state they can be in, land in the kitchen sink first. Then `/` replaces its placeholder with the list, the freshness line, pagination, and loading and error handling. The change is checked in production at the end.

### Changes Required:

#### 1. View logic

**Files**: `src/lib/deals/freshness.ts`, `src/lib/deals/format.ts`, `src/lib/deals/page.ts`, `src/lib/deals/links.ts` (new)

**Intent**: Every decision the view makes, as pure functions that the kitchen sink and a future test runner can call with data.

**Contract**:

- **`decideFreshness(lastOkFinishedAt, now)`** returns `fresh` or `stale` with the time, or `never`. `stale` means strictly more than six hours old.
- **Formatting** in `pl-PL`, with an explicit `timeZone: "Europe/Warsaw"`, called only from Server Components. It covers:
  - the price in its currency;
  - the date, and the date with time;
  - the labels for platforms, and for aggregators (derived from the feed id's prefix).
- **`parsePage(raw)`** returns 1 for anything that is not a positive integer, a repeated key included. `PAGE_SIZE = 30`.
- **`dealLinks(deal)`** returns the primary link and, when the primary is the shop, the post as a secondary link. Each is re-checked for an `http(s)` scheme.
  - The primary link is the shop when `shop_url` is set, else the post.

#### 2. Data functions

**File**: `src/lib/deals/queries.ts` (new, `server-only`)

**Intent**: The two reads the page makes. The Supabase client is passed in and a discriminated result comes out, so a failed read is data rather than a thrown error.

**Contract**:

- **`loadDealsPage(client, page, now)`:**
  - selects the display columns;
  - repeats the policy's predicate, plus `expires_at is null or expires_at > now`;
  - orders by `published_at desc, id desc`;
  - fetches one row past the page, to know whether an older page exists.
- **`loadLastRefresh(client)`** reads the latest `finished_at` from `pipeline_runs`.
- Both validate rows with zod and return `{ ok: true, … } | { ok: false }`, never the raw error.

#### 3. Components

**Files**: `src/components/deals/deal-card.tsx`, `src/components/deals/deal-list.tsx`, `src/components/deals/deal-list-skeleton.tsx`, `src/components/deals/freshness-note.tsx`, `src/components/deals/deals-pagination.tsx`, `src/components/deals/deals-section.tsx`, `src/components/deals/retry-button.tsx` (new)

**Intent**: The design system's pieces for this view, built from the existing `Card`, `Badge`, `Empty`, `Skeleton` and `Alert` components and the tokens in `globals.css`, so the kitchen sink can render every state from sample data.

**Contract**:

- **`DealCard`** shows:
  - the title, the price, the primary link and the source link;
  - the platform badge, discount badge and expiry, each only when set;
  - the shop and aggregator, with the post's date;
  - for a set offer, a note that the price is for the set, naming the other games in `set_with` (added 2026-10-06, Phase 3 change 7).

  External links open in a new tab with `rel="noopener noreferrer nofollow"`, and say so to assistive technology.
- **`DealListSkeleton`**: `role="status"` with visible text, sized like the cards.
- **`FreshnessNote`**: the fresh, stale and never states.
- **`DealsPagination`**: "Nowsze" and "Starsze" as `<Link href="/?page=n">`, with a `useLinkStatus` pending hint.
- **`DealsSection`** (async) calls the data functions in parallel, then renders one of:
  - the list;
  - the empty state with the freshness line (US-01);
  - an inline error with `RetryButton`, which calls `router.refresh()`.
- No outline or destructive button variants.

#### 4. Kitchen sink

**File**: `src/app/kitchen-sink/page.tsx`

**Intent**: The visual gate for every state, before `/` depends on them.

**Contract**:

- A new "Okazje" section renders `DealCard` in these variants:
  - with and without a discount, and with and without an expiry;
  - with a shop link, and with only the post link;
  - without a platform;
  - with a euro price;
  - with a title long enough to wrap at 375 px;
  - as part of a set (added 2026-10-06).
- The same section renders `FreshnessNote` in all three states, the skeleton, and the empty and error states.
- The placeholder samples at `:198-233` give way to the real components.

#### 5. The page

**Files**: `src/app/(app)/page.tsx`, `src/app/(app)/loading.tsx` (new), `src/app/(app)/error.tsx` (new)

**Intent**: `/` becomes the deals view. The heading stays outside any boundary, so it paints at once.

**Contract**:

- **`page.tsx`:**
  - takes `PageProps<"/">`, awaits `searchParams`, and runs `parsePage`;
  - renders the heading and a one-line intro;
  - then renders `<Suspense key={page} fallback={<DealListSkeleton />}>` around `DealsSection`, which calls `createClient()` from `src/utils/supabase/server.ts` fresh for the request;
  - drops the "W budowie" badge.
- **`loading.tsx`** renders the same heading and skeleton for navigations into `/`.
- **`error.tsx`** is a Client Component with fixed Polish copy and a `retry()` button. It never renders `error.message`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run format:check` and `npm run build` pass, with `/` dynamic and `/kitchen-sink` still prerendered as not found
- With a server Tomasz started, the agent's `curl` gets 200 with deal cards for `/`, 200 with page 1 for `/?page=abc`, and 200 with the past-the-end state for `/?page=999`

#### Manual Verification:

- Screenshots of the kitchen sink's "Okazje" section at 1280 px and 375 px, saved to `context/changes/physical-deals-from-real-posts/screenshots/`, show every state with no horizontal scroll
- Screenshots of `/` and `/?page=2` with real data at 1280 px and 375 px show no horizontal scroll, and the skeleton appears on a throttled load
- On sampled cards, the primary link opens the shop URL present in the post or the post itself, and the source link opens the aggregator post
- A deal whose `expires_at` has passed (Tomasz's SQL) is absent from `/`
- Tabbing through cards and pagination shows a visible focus on every link
- After the merge, production `/` lists deals read through the publishable key, and `/kitchen-sink` still returns 404 (the agent's `curl`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

There are none: the repository has no test runner. The pure functions are shaped so that a future runner can cover them, with these cases:

- **`expiryInstant`** (Europe/Warsaw, exclusive end):

  | Stated | Ends at (UTC) |
  | --- | --- |
  | `2026-09-30` | `2026-09-30T22:00:00Z` |
  | `2026-09-30`, `12:00` | `2026-09-30T10:00:00Z` |
  | `2026-10-24` | `2026-10-24T22:00:00Z` |
  | `2026-10-25` (summer time ends that night) | `2026-10-25T23:00:00Z` |
  | `2026-10-31` | `2026-10-31T23:00:00Z` |

- **`isListable`**: game, physical and priced → listed. The same with `unclear`, `digital`, `not_game`, or no price → not listed.
- **`verifyShopUrl`**:
  - an `https` URL among the post's `href`s, on a shop host → kept;
  - a URL not in the post, a `javascript:` URL, or a link to the aggregator's own host → null;
  - a URL whose `href` carries `&amp;` → matched after decoding.
- **`classifyOpenRouterFailure`**:
  - 401 and 402 → systemic;
  - 429, 5xx, 408, 524, 529, a network error and a timeout → systemic after one retry;
  - 400, 403, invalid JSON and a schema mismatch → post;
  - a 200 whose body carries `error` → classified by the embedded code.
- **`shouldCountFailures`**: a run with one success and two failures counts both; a run with no success and five failures counts none.
- **`decideRunOutcome`**:
  - collection succeeded and no systemic failure → `ok`, even with per-post failures and leftover backlog;
  - collection failed → `failed`;
  - a systemic failure → `failed`.
- **`decideFreshness`**, with the last `ok` run finished at 08:07:
  - at 13:00 → fresh, 08:07;
  - at 14:07 → fresh (exactly six hours);
  - at 14:08 → stale;
  - no run at all → never.
- **`parsePage`**: absent → 1; `"2"` → 2; `"0"`, `"-1"`, `"abc"`, `"2.5"` and `["2", "3"]` → 1; `"999"` → 999.
- **Grouping**: two pending rows sharing a link → one call, and both rows closed.
- **Client-side fallback**, only on the free route:
  - a 429 from the free model moves the link on to the paid fallback;
  - every model failing systemically stops the run;
  - a reply that fails validation counts against the post, as before.

### Integration Tests:

There are none. The live checks stand in for them:

- `npm run extract:eval` exercises the prompt, the client and the decisions against the real API.
- The proving runs and the `workflow_dispatch` run exercise the pipeline.
- `curl` and the screenshots exercise the view.

### Manual Testing Steps:

1. Tomasz sets up OpenRouter and the key, and switches the free-model training setting on. The sample is exported and labelled, and `npm run extract:eval` runs all three candidates until `evaluation.md` holds a model list with zero digital leaks. The setting then goes back off, unless a free model made the list.
2. Tomasz pushes the migrations and runs `db:check`; the agent reads the shape back with `gen types`.
3. Tomasz runs the local proving runs, first three links and then an invalid key. He then adds the secret and triggers `workflow_dispatch`.
4. After two days of the schedule, Tomasz confirms the pending count is zero, reviews the 100-link sample, and answers PRD questions 2 and 3.
5. Tomasz starts `npm run dev`; the agent screenshots the kitchen sink and `/`, and runs the `curl` checks.
6. After the merge, the agent checks production `/` with `curl`.

## Performance Considerations

- **Cost.**
  - Research's figures for Mistral Small 3.2 are $0.16–0.31 per 1,000 posts. That is roughly $0.25–0.50 for the backlog and under $1 a month in steady state; the evaluation adds cents.
  - The key's credit limit caps a runaway loop, and `pipeline_runs.cost_usd` shows the actual spend per run.
- **Time.**
  - About 8 minutes of extraction per run, at a concurrency of about 4, clears several hundred links, so the backlog drains in a few scheduled runs.
  - Posts are processed in the run that collects them. The six-hour bound (`prd.md:86`) therefore keeps F-02's margin: roughly two hours, minus the Actions schedule delay (`collector plan:344`).
  - On the free route, 20 requests a minute caps a run at about 160 links. The backlog then takes about ten runs, just under two days.
- **Page reads.**
  - Two Supabase reads per view, in parallel, from `fra1`.
  - A failing read can hold the skeleton for about seven seconds, because postgrest retries GETs.
- **Growth.** Deals without an expiry accumulate by design. Pagination keeps them reachable, and fetching one row past the page avoids a `count` query.

## Migration Notes

- **Order.** Four additive migrations, applied in order: `post_extractions` before `deals`, which references it.
  - Each opens with its `-- Revert:` line and its backward-compatibility line.
  - Nothing deployed reads the new tables before Phase 4, and the collector and the importer do not name the new columns.
- **Rollback.** `vercel rollback` moves traffic only.
  - Reverting Phase 4 restores the placeholder and leaves the tables in place, which is harmless.
  - Reverting the `collect.yml` step stops extraction; the columns and tables stay.
- **Re-extraction** is deliberate. Tomasz sets `processed_at = null, extraction_attempts = 0` on the chosen rows in the SQL editor, and the next run re-extracts them and replaces each link's deals. Without that reset, a prompt or model change affects future extractions only.
- **Given-up posts** keep `processed_at` null with `extraction_attempts = 3`, and `extraction_error` says why. The same reset retries them.

## References

- **This change:**
  - Research: `context/changes/physical-deals-from-real-posts/research.md`
  - Roadmap item: `context/foundation/roadmap.md:135-148`
  - PRD: `context/foundation/prd.md:33`, `:40`, `:51-58`, `:86`, `:94-102`, `:121-122`
- **Prior changes:**
  - F-02 decisions: `context/changes/collector-into-repo-and-database/plan.md:37-39`, `:344`
  - F-03 handoff: `context/changes/game-catalog-provider-proven/coverage.md:155-169`
  - Infrastructure: `context/foundation/infrastructure.md:43`, `:129`, `:146`
  - Who runs what, and the screenshot gate: `context/changes/email-password-accounts/plan.md:157-165`, `:216`
- **Patterns:**
  - `src/lib/catalog/rawg.ts:84-180`, `src/lib/catalog/types.ts:27-37`
  - `scripts/collector/posts.mts:1-11`, `:229-250`, `scripts/collector/supabase.mts`
  - `scripts/catalog/probe.mts`
- **OpenRouter:**
  - catalogue: `https://openrouter.ai/api/v1/models` and `https://openrouter.ai/api/v1/models/qwen/qwen3.8-27b:free/endpoints`, checked 2026-09-28
- **Supabase:**
  - changelog 45329 (grants on new tables)
  - splinter lints 0010, 0024 and 0026–0029
  - `https://supabase.com/docs/guides/database/postgres/column-level-security`
- **Next 16:**
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`, `error.md`, `page.md`
  - `node_modules/next/dist/docs/01-app/02-guides/streaming.md`, `interactive-apps.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extraction contract and labelled-set evaluation

#### Automated

- [x] 1.1 `npm run lint`, `npm run format:check` and `npm run build` pass — 0a43bb1
- [x] 1.2 `node scripts/extract/eval.mts`, run without an env file, exits non-zero with a message naming `OPENROUTER_API_KEY` before reading any file or sending any request — 0a43bb1
- [x] 1.3 `git check-ignore -q scripts/extract/eval/posts.json` succeeds, and `scripts/extract/eval/labels.json` is not ignored — 0a43bb1

#### Manual

- [x] 1.4 Tomasz confirms the OpenRouter account, the $10 purchase, the free-model training setting switched on for the evaluation, the key's monthly credit limit, and `OPENROUTER_API_KEY` in `.env.local`, without the file being read — 0a43bb1
- [x] 1.5 Tomasz runs the sample query and saves the cell as `scripts/extract/eval/posts.json` — 0a43bb1
- [x] 1.6 Tomasz corrects every drafted label in `scripts/extract/eval/labels.json` — 0a43bb1
- [x] 1.7 Tomasz runs `npm run extract:eval`, and its output carries no key and no request URL — 0a43bb1
- [x] 1.8 `evaluation.md` records the results for all three candidates and a `MODELS` list whose every model has zero digital leaks and an accepted request shape, with zero reasoning tokens on every paid model and, if the free candidate ranked first, Tomasz's choice of route; Tomasz accepts it — 0a43bb1
- [x] 1.9 The free-model training setting is off again, unless `evaluation.md` puts a free model in `MODELS` — 0a43bb1

### Phase 2: Tables for deals, extractions and runs

#### Automated

- [x] 2.1 `npm run lint` and `npm run format:check` pass — 02532fe
- [x] 2.2 After Tomasz's push, `npx supabase gen types typescript --linked --schema public` shows `post_extractions`, `deals` and `pipeline_runs` with the planned columns and nullability, and the two new `collected_posts` columns — 02532fe

#### Manual

- [x] 2.3 Tomasz runs `npm run db:push -- --dry-run`, and it lists exactly the four new migrations — 02532fe
- [x] 2.4 Tomasz runs `npm run db:push`, then `npm run db:check` exits 0 — 02532fe
- [x] 2.5 Tomasz runs `npm run db:status`, and local and remote agree — 02532fe
- [x] 2.6 Tomasz's grants query on `information_schema.role_table_grants` shows `select` for `anon` and `authenticated` on `deals` and `pipeline_runs` only, and for `service_role` exactly the planned privileges on the three new tables — 02532fe

### Phase 3: Extraction on the cron, backlog run and sample review

#### Automated

- [x] 3.1 `npm run lint`, `npm run format:check` and `npm run build` pass — ec2bbb5
- [x] 3.2 `node scripts/extract/extract.mts`, run without an env file, exits non-zero naming the first missing variable before any request — ec2bbb5
- [x] 3.11 With placeholder credentials and `EXTRACT_SINCE` set to a value that is not a date, `node scripts/extract/extract.mts` exits non-zero naming `EXTRACT_SINCE` before any request — 2041a48
- [x] 3.14 `npm run lint`, `npm run format:check` and `npm run build` pass with change 7 — 4ccc5ed
- [x] 3.15 After Tomasz's push, `npx supabase gen types typescript --linked --schema public` shows `deals.set_with` as a non-null `string[]` — 4ccc5ed

#### Manual

- [x] 3.3 Tomasz runs `npm run extract -- --limit 3`; the summary reports three links extracted, and no run row is written — ec2bbb5
- [x] 3.4 With `OPENROUTER_API_KEY` set to an invalid value in the shell, Tomasz's `npm run extract -- --limit 1` exits non-zero with a systemic failure, and his SQL shows every `extraction_attempts` unchanged — ec2bbb5
- [x] 3.5 Tomasz adds `OPENROUTER_API_KEY` to the Actions secrets, and a `workflow_dispatch` run of `collect` is green, its log showing links extracted and cost with no credential or request URL — 4ccc5ed
- [x] 3.6 That run wrote a `pipeline_runs` row with `outcome = 'ok'` (Tomasz's SQL) — 4ccc5ed
- [x] 3.7 In the SQL editor, `deals` read as `anon` returns only game, physical, priced rows, while the owner role also sees the rejected ones (Tomasz's SQL) — 4ccc5ed
- [x] 3.8 Within two days of scheduled runs the pending count (`processed_at is null and extraction_attempts < 3`) reaches 0, and a later run processes the posts it collected (Tomasz's SQL, twice) — 4ccc5ed
- [x] 3.9 Tomasz reviews `npm run extract:report -- --sample 100`, and `review.md` records the results and his answers to PRD questions 2 and 3 — 4ccc5ed
- [x] 3.10 The PRD's and the roadmap's questions 2 and 3 carry those answers, and the share of wrong listed entries is within Tomasz's threshold — 4ccc5ed
- [x] 3.12 With `--since` set to a moment in the future, Tomasz's `npm run extract` reads no pending rows, makes no call and exits 0 — 2041a48
- [x] 3.13 With the repository variable `EXTRACT_PAUSED` set to `true`, a `workflow_dispatch` run of `collect` has Collect green and Extract deals skipped; with the variable deleted, the next run extracts again — 0b0e837
- [x] 3.16 Tomasz pushes the `set_with` migration: the dry run lists it alone, and `npm run db:check` exits 0 — 4ccc5ed
- [x] 3.17 `npm run extract:eval` at prompt version 3 shows zero digital leaks, and `evaluation.md` records the run — 4ccc5ed
- [x] 3.18 Tomasz re-extracts the #58 link from `review.md`, and both of its deals carry the other game in `set_with` — 4ccc5ed

### Phase 4: Public deals view

#### Automated

- [x] 4.1 `npm run lint`, `npm run format:check` and `npm run build` pass, with `/` dynamic and `/kitchen-sink` still prerendered as not found
- [x] 4.2 With a server Tomasz started, the agent's `curl` gets 200 with deal cards for `/`, 200 with page 1 for `/?page=abc`, and 200 with the past-the-end state for `/?page=999`

#### Manual

- [x] 4.3 Screenshots of the kitchen sink's "Okazje" section at 1280 px and 375 px, saved to `context/changes/physical-deals-from-real-posts/screenshots/`, show every state with no horizontal scroll
- [x] 4.4 Screenshots of `/` and `/?page=2` with real data at 1280 px and 375 px show no horizontal scroll, and the skeleton appears on a throttled load
- [x] 4.5 On sampled cards, the primary link opens the shop URL present in the post or the post itself, and the source link opens the aggregator post
- [x] 4.6 A deal whose `expires_at` has passed (Tomasz's SQL) is absent from `/`
- [x] 4.7 Tabbing through cards and pagination shows a visible focus on every link
- [ ] 4.8 After the merge, production `/` lists deals read through the publishable key, and `/kitchen-sink` still returns 404 (the agent's `curl`)
