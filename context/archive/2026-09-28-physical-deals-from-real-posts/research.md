---
date: 2026-09-28T14:28:43+02:00
researcher: tkedz
git_commit: 2449d5a9b11fb8264d054ed2bc90d3bc36552cd8
branch: main
repository: 10x-physical-games-deals
topic: "Running S-01's deal extraction on OpenRouter for free or very cheaply"
tags: [research, openrouter, llm, extraction, cost, collector, github-actions, supabase]
status: complete
last_updated: 2026-09-28
last_updated_by: tkedz
last_updated_note: "Database figures added from the user's three queries; open questions 1, 2 and 11 answered (initial pass ignores the seven-day cut-off)"
---

# Research: Running S-01's deal extraction on OpenRouter for free or very cheaply

**Date**: 2026-09-28T14:28:43+02:00 (Europe/Warsaw)
**Researcher**: tkedz
**Git Commit**: 2449d5a9b11fb8264d054ed2bc90d3bc36552cd8
**Branch**: main
**Repository**: 10x-physical-games-deals

## Research Question

> chciałbym skorzystać z openroutera i w miarę możliwości żeby było to darmo lub bardzo tanio

For change `physical-deals-from-real-posts` (roadmap S-01), this document asks three things:

- Can extracting deals from collected posts run through OpenRouter at no cost or at very low cost?
- What does each option require and risk?
- What does the repository already settle about wiring it in?

The roadmap left the model open: "Which model does the extraction and at what cost per post — `.env.example` records that the choice was postponed to this point" (`context/foundation/roadmap.md:146`, `.env.example:26-28`). The user narrowed it on 2026-09-28 to OpenRouter, free or very cheap.

## Summary

**Free fits this load only after a one-time purchase of $10 in credits. The same credits then pay for cheap paid models, which cost almost nothing at this volume. The choice between free and paid therefore turns on quality and reliability, not on money.**

1. **Free without buying credits does not fit.**
   - OpenRouter caps free models at 20 requests a minute for every account.
   - The daily cap is 50 requests for an account that has bought less than $10 of credits all-time, and 1,000 requests once it has bought $10 or more ([limits](https://openrouter.ai/docs/api_reference/limits)).
   - Failed attempts count toward the daily cap ([pricing FAQ](https://openrouter.ai/pricing)).
   - The measured load is 91 distinct links (115 rows) a day on average and 49–153 links on individual days, plus a backlog of 2,000 rows (1,573 distinct links) (see [Volume](#volume)). At one post per request that exceeds 50 on 9 of the 10 days measured, before any backlog.
2. **Very cheap really is very cheap.**
   - Five paid candidates with structured-output support cost $0.10–0.60 per 1,000 posts in the central token scenario and $0.17–1.08 in the heavy one, at 2026-09-28 prices.
   - At a conservative 4,500 calls a month that is $0.45–4.84 a month. The measured steady state is lower: about 2,700 distinct links, or 3,400 rows, a month.
   - A $10 purchase (card fee 5.5%, $0.80 minimum) lasts 2–22 months depending on model and scenario. Credits may expire 365 days after purchase ([terms](https://openrouter.ai/terms), last updated 2026-08-31).
3. **Free models carry costs of their own.**
   - Of the 21 free catalogue entries on 2026-09-28, 5 support structured outputs.
   - Each of the five free models whose endpoints were inspected is served by exactly one provider.
   - Free endpoints may train on prompts, and using them requires an account privacy toggle.
   - `openrouter/free` picks a free model at random, so accuracy on the digital-edition guardrail cannot be measured reproducibly through it.
4. **Two cost traps apply to cheap models specifically.**
   - **Reasoning tokens are billed as output tokens.** 8 of the 11 paid models checked accept a `reasoning` parameter. Turning reasoning off works per model and per endpoint, not everywhere.
   - **Models expire.** 27 of the 458 catalogue entries carry an `expiration_date`, among them Gemini 2.5 Flash-Lite on 2026-10-20 — before the course deadline of 2026-11-04 (`context/foundation/prd.md:14`).
5. **The repository already fixes most of the wiring.**
   - Extraction runs on the GitHub Actions cron after collection (`context/foundation/infrastructure.md:43`).
   - `processed_at` is the backlog marker, with a seven-day staleness cut-off (`supabase/migrations/20260923094535_add_processed_at_to_collected_posts.sql`, `context/changes/collector-into-repo-and-database/plan.md:39`).
   - The RAWG client is a ready pattern to copy: injected `fetch`, pure zod parsing, typed failure reasons (`src/lib/catalog/rawg.ts:84-108`).
   - The installed zod 4.6.5 turns a schema into JSON Schema in the shape `response_format` expects. Whether each endpoint accepts it is untested.
   - The user adjusted one inherited rule on 2026-09-28. The seven-day staleness cut-off cannot tell a post that was never attempted from one that failed. Applied as written, it would skip 783 of the 2,000 backlog rows, which were already older than seven days that day.
   - So the initial pass ignores the cut-off, and the cut-off starts to apply only once the backlog is processed.
6. **The posts are short and uneven** (live sample of 470 items, 2026-09-28).
   - After HTML is stripped, the median body is 237 characters on cenograj, 402 on lowcygier and 605 on pepper.
   - No sampled lowcygier or cenograj post links to a shop, and 23.3% of pepper posts do. The PRD's fallback to the aggregator link is therefore the common case, not the exception.
   - All 80 cenograj items in the sample follow a fixed template stating `Typ: Pudełko`. In 8 of them the percentage in the title is a price advantage over the next-cheapest offer, not a discount.
   - The full table agrees on size (median bodies of 240, 409 and 654 characters) but not on the mix. cenograj supplies 942 of its 2,000 rows (47.1%), against 80 of 470 items (17.0%) in the live sample.

**Recommendation for the plan (the choice is the user's):**

- Buy $10 of credits once. That lifts the free cap to 1,000 a day and pays for paid use.
- Start from `mistralai/mistral-small-3.2-24b-instruct`. Of the six paid models whose endpoints were inspected, it is the only one that combines three things: structured outputs on every provider (4 of 4), no `reasoning` parameter to inflate output cost, and Polish in the vendor's own language list.
- Keep the model id in configuration, with a `models` fallback list.
- Let a labelled sample of real posts decide, and include one free structured-output model in that comparison. On current prices the trial costs almost nothing: 50 labelled posts cost at most about $0.05 per model in the heavy scenario. Even the 2,000-row backlog plus a conservative month of 4,500 calls — about 6,500 posts — costs $0.65–3.90 across the five costed models in the central scenario.

**Status:** complete.

- The inflow, backlog and size figures come from three read-only queries the user ran against `public.collected_posts` on 2026-09-28. The two earlier estimates stay in as cross-checks.
- What remains open is open by design: accuracy on real posts, and the checks only a live call can make.

## Detailed Findings

### What "free" means on OpenRouter today

**Rate limits for free models** ([limits](https://openrouter.ai/docs/api_reference/limits), built from the page constants `FREE_MODEL_RATE_LIMIT_RPM = 20`, `FREE_MODEL_NO_CREDITS_RPD = 50`, `FREE_MODEL_HAS_CREDITS_RPD = 1000`, `FREE_MODEL_CREDITS_THRESHOLD = 10`):

| Credits purchased (all time) | Requests per minute | Requests per day |
| --- | --- | --- |
| under $10 | 20 | 50 |
| $10 or more | 20 | 1,000 |

- **The tier follows all-time purchases, not the current balance.** "The `limit` tier is selected by all-time credits purchased, independently of `is_free_tier`"; the higher ceiling is granted "starting one credit below the table's threshold" (same page).
- **Extra keys or accounts add nothing.** "Making additional accounts or API keys will not affect your rate limits" (same page).
- **The daily counter can be read, the per-minute one cannot.** `GET /api/v1/key` returns `free_model_daily_requests {used, limit, remaining}` per UTC day; "The per-minute limit is not reported there" (same page).
- **Failed attempts count.** "Failed attempts count toward that daily cap, and a negative balance blocks free models until you add credits" ([pricing FAQ](https://openrouter.ai/pricing)). The limits page itself says nothing about failed attempts.

**Privacy prerequisite.**

- Paid and free models have separate account settings ([provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)).
- "Providers that do log, or where we have been unable to confirm their policy, will not be routed to unless the model training toggle is switched on" ([FAQ](https://openrouter.ai/docs/faq)).
- OpenRouter's post of 2026-09-23 says the free routes "are served by providers whose data policy may allow training on your prompts". With the free-model switch off, a request to one of them "returns a 404 error that names the free model training setting" ([blog](https://openrouter.ai/blog/insights/best-embedding-models-2026/)).
- OpenRouter's own prompt retention "is always opt-in" ([data collection](https://openrouter.ai/docs/guides/privacy/data-collection)).
- The posts come from public RSS feeds (`scripts/collector/feeds.json`), but the toggle applies to the whole account, not to one project.

**The free router.**

- `openrouter/free` "automatically selects a free model at random", filtered to models that support what the request needs, "such as … structured outputs". "You cannot control which specific model is selected" ([free router](https://openrouter.ai/docs/guides/routing/routers/free-router)).
- Its `/endpoints` response is an empty list, because the router has no endpoint of its own.

**Free entries that support structured outputs** — 5 of 21 on the catalogue snapshot taken 2026-09-28T11:52:13Z (`GET https://openrouter.ai/api/v1/models`, 458 models, `data[i].supported_parameters`; endpoints from `GET /api/v1/models/<id>/endpoints`):

| id | Providers (`status`) | Polish evidence (weak) |
| --- | --- | --- |
| `qwen/qwen3.8-27b:free` | ModelRun (0) | a count only: "201 languages and dialects", no itemised list found |
| `dots-studio/dots-3-note-preview:free` | AtlasCloud (0) | third-party ad-hoc test only |
| `liquid/lfm-2.5-2.6b:free` | Liquid (0) | named on the model card ([HF](https://huggingface.co/LiquidAI/LFM2.5-2.6B)); a 2.6B-parameter model |
| `nvidia/nemotron-3-super-120b-a12b:free` | Nvidia (−2) | absent from NVIDIA's seven-language list |
| `openrouter/free` | router, no endpoints | not applicable |

- `google/gemma-4-31b-it:free` lists `response_format` but not `structured_outputs`.
- Endpoint `status`: OpenRouter's docs, found through search, say only that 0 means operational. What −2 and −5 mean is not documented.
- Of the 21 free entries, 20 were created on or after 2026-03-01 (`data[i].created`); `openrouter/free` is the only exception. No free entry carries an `expiration_date` in this snapshot.

**What the caps mean for this job.**

- A run has about ten minutes left after a worst-case collection (`.github/workflows/collect.yml:33-35`: roughly 5 minutes of feeds against a 15-minute timeout). At 20 requests a minute, that is at most about 200 requests per run.
- Six runs a day (`collect.yml:14`) therefore allow about 1,200 requests, so with purchased credits the 1,000-a-day cap binds first.
- With purchased credits, the 1,573-link backlog clears in about two days.
- Without purchased credits, 50 a day is below the measured mean of 91 distinct links a day. Only 1 of the 10 complete days measured (49 links) stayed under it.
- At one post per request, 50 a day cannot keep up. Staying inside it means sending several posts per request — five per request would need about 18 requests a day on average, 10–31 on individual days — or skipping the model for some posts (see Architecture Insights). The price of batching is that one malformed or failed response loses the whole batch, and the failure still counts toward the cap.

### What "very cheap" costs

**Pricing model.**

- **No markup on tokens.** Provider prices pass through: "there is no markup on inference pricing" ([FAQ](https://openrouter.ai/docs/faq)).
- **Purchase fee.** "OpenRouter charges a 5.5% ($0.80 minimum) fee when you purchase credits", or 5% by crypto (same page). For a $10 purchase the minimum applies, so the fee is $0.80.
- **Purchase size.** $5 minimum and $25,000 maximum per transaction ([terms](https://openrouter.ai/terms)).
- **Expiry and refunds.** Unused credits may expire 365 days after purchase. They can be refunded within 24 hours, but the fees cannot (same page).
- **Failed requests.** "An attempt that errors is not charged for its model tokens" ([pricing](https://openrouter.ai/pricing)).
- **Batch API.** It bills about 50% of the per-token price, but its 24-hour completion window does not fit steady-state operation against the six-hour visibility requirement (`context/foundation/prd.md:86`) ([batch](https://openrouter.ai/docs/batch-quickstart)).

**Post sizes** (live snapshot of all 15 feeds, 2026-09-28 11:52 UTC; the collector's own content rule, `scripts/collector/posts.mts:114-119`; tokens estimated at 3.0 characters per token, not counted with a tokenizer):

| Aggregator | Items | Title median (chars) | Body after stripping HTML, median / p90 (chars) | ≈ tokens, median / p90 | Items at the 4,000-char cap |
| --- | --- | --- | --- | --- | --- |
| pepper | 270 | 57 | 605 / 1,910 | 202 / 637 | 7 (2.6%) |
| lowcygier | 120 | 92 | 402 / 633 | 134 / 211 | 0 |
| cenograj | 80 | 44 | 237 / 263 | 79 / 88 | 0 |

The whole table agrees on size. This is query 3 over all 2,000 rows; tags are stripped by regex and entities are not decoded:

| Aggregator | Rows | Body median / p90 (chars) | Rows at the 4,000-char cap |
| --- | --- | --- | --- |
| pepper | 775 | 654 / 2,042 | 20 (2.6%) |
| lowcygier | 283 | 409 / 638 | 0 |
| cenograj | 942 | 240 / 269 | 0 |

**Token scenarios.**

- Nothing in the repository fixes the instruction-and-schema part of the prompt yet, so the costing uses two assumed budgets: **A** = 1,200 input + 200 output tokens per post (central) and **B** = 2,500 input + 300 output (heavy).
- At 3.0 characters per token, body plus title comes to about 95–240 tokens at the median and about 710 at pepper's p90 (full-table bodies, live-sample titles).
- Scenario A therefore leaves roughly 950 tokens for instructions and schema on a median post, and B leaves roughly 1,800 on pepper's p90.

**Cost** (`cost = input × pricing.prompt + output × pricing.completion` from the catalogue snapshot; month = 4,500 calls):

| Model | $/M in | $/M out | Scenario A, per 1,000 posts | Scenario B, per 1,000 posts | Per month (A / B) | $10 lasts (A / B) |
| --- | --- | --- | --- | --- | --- | --- |
| `deepseek/deepseek-v4.1-flash` | 0.035 | 0.29 | $0.10 | $0.17 | $0.45 / $0.79 | 22 / 13 months |
| `openai/gpt-5-nano` | 0.05 | 0.40 | $0.14 | $0.25 | $0.63 / $1.10 | 16 / 9 months |
| `mistralai/mistral-small-3.2-24b-instruct` | 0.0938 | 0.25 | $0.16 | $0.31 | $0.73 / $1.39 | 14 / 7 months |
| `openai/gpt-4.1-nano` | 0.10 | 0.40 | $0.20 | $0.37 | $0.90 / $1.67 | 11 / 6 months |
| `google/gemini-3.1-flash-lite` | 0.25 | 1.50 | $0.60 | $1.08 | $2.70 / $4.84 | 4 / 2 months |

**Reasoning adds output that the table leaves out.**

- "Reasoning tokens are counted as output tokens for billing purposes", and with `"exclude": true` "the tokens are still billed" ([reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), via Context7 `/openrouterteam/docs`).
- Switching reasoning off (`reasoning: { effort: "none" }`, or `{ enabled: false }`) depends on the model and the endpoint.
- OpenRouter's post of 2026-09-28 on Qwen 3.8 reports HTTP 400 "Reasoning is mandatory for this endpoint and cannot be disabled" on two models. On `qwen/qwen3.8-27b`, turning reasoning off cut completion tokens from 216 to 61 on average — roughly 70% less.
- For `gpt-5-nano`, every 500 reasoning tokens per post adds $0.20 per 1,000 posts.
- Whether reasoning actually stayed off shows in `usage.completion_tokens_details.reasoning_tokens` ([usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)).

<a id="volume"></a>**Volume (measured).** These figures come from three read-only queries the user ran in the Supabase SQL editor against `public.collected_posts` on 2026-09-28; the results were pasted into the conversation as JSON.

- **Backlog.** 2,000 rows and 1,573 distinct links, first seen between 2026-09-16 10:22 UTC and 2026-09-28 05:13 UTC. All 2,000 have `processed_at` null. The three queries agree: the daily rows add up to 2,000, and so do the rows per aggregator.
- **Daily inflow.** Two days are left out: 2026-09-16, the day the table opens, and 2026-09-23, the cutover. Over the ten complete days that remain, the table gained 57–202 rows and 49–153 distinct links a day, averaging 114.7 rows and 91.3 links.
- **Deduplicating by link.** Extracting once per link saves 427 of 2,000 calls (21.4%), more than either sample suggested (11.7% live, 16.5% in F-02's snapshot).
- **The mix.** cenograj 942 rows (47.1%), pepper 775 (38.8%), lowcygier 283 (14.2%).
- **The last seven days** (1,217 rows, 991 links) include 2026-09-23's 533 rows, so they overstate the steady state.
- **What the 2026-09-23 spike probably is.** Most likely the cutover, not a burst of deals. This is an inference; the aggregates cannot prove it.
  - F-02's plan let the new collector write before the imports ran, and expected an import to insert "659 minus whatever Phase 2's live runs already collected" (`context/changes/collector-into-repo-and-database/plan.md:236`).
  - An entry still on its feed page when the new collector first ran therefore keeps the new collector's `first_seen_at`, not the old collector's.
  - The table has only 306 rows on 2026-09-16, against a 471-row first bucket in F-02's snapshot (`context/changes/collector-into-repo-and-database/research.md:90`). That fits the same reading.
- **The costing keeps 150 calls a day (4,500 a month) as a conservative figure.** That is 31% above the measured mean of rows and 64% above the mean of distinct links. Before the queries, two estimates put it at 85–118 calls a day: 141 rows a day from F-02's snapshot, deduplicated by that snapshot's 16.5%, and 85 distinct links published in the 24 hours before the live fetch.

### What separates the cheap candidates

**Structured-output support is decided per endpoint, not per model.** "Support is determined per endpoint, not just per model" ([structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)). Measured on `/endpoints`, 2026-09-28:

- `mistralai/mistral-small-3.2-24b-instruct`: 4 of 4 endpoints (DeepInfra, Parasail, Venice, Mistral), all `status` 0.
- `openai/gpt-5-nano`: 4 of 4 (OpenAI ×2, Azure ×2), all `status` 0.
- `google/gemini-2.5-flash-lite`: 5 of 5, all Google, all `status` 0.
- `deepseek/deepseek-v3.2`: 10 of 14. GMICloud, Novita, DigitalOcean and SambaNova list neither `structured_outputs` nor `response_format`. By `status`: 9 endpoints at 0, 4 at −2, and 1 (Baidu) at −5.
- Not inspected: the endpoints of `deepseek/deepseek-v4.1-flash`, `openai/gpt-4.1-nano` and `google/gemini-3.1-flash-lite`.

**Two documents disagree on what happens when a provider cannot honour `response_format`.**

- The structured-outputs page says the request "will fail with an error indicating lack of support".
- Provider selection says it is routed anyway "and the parameter is ignored" ([provider selection](https://openrouter.ai/docs/guides/routing/provider-selection)).
- With `provider.require_parameters: true`, "the request won't even be routed to that provider" (same page), which removes the ambiguity.
- Even strict mode is enforced differently by different providers: "exact compliance is not guaranteed on every endpoint" (structured outputs page).

**Expiry.** 27 of 458 entries carry an `expiration_date`. Those in the model families considered here:

- Gemini 2.5 Flash, Flash-Lite and Pro, including their `:batch` variants, on 2026-10-20.
- 14 Qwen entries on 2026-10-09: the Qwen 3 family, a Qwen 3.6 Max preview and a dated Qwen-Plus snapshot.
- `deepseek/deepseek-v3.2-exp`, `deepseek/deepseek-v3.1-terminus` and `deepseek/deepseek-r1-distill-llama-70b` on 2026-09-28.

None of the five costed models carries one.

**The `reasoning` parameter** appears in `supported_parameters` for 8 of the 11 paid ids checked. It is absent for `mistralai/mistral-small-3.2-24b-instruct`, `mistralai/mistral-nemo` and `openai/gpt-4.1-nano`. Of the six paid models whose endpoints were inspected, `qwen/qwen-plus` is the only other one without it.

**Polish-language evidence** (weak: a vendor's language list is a prior, not a benchmark):

- **Named by the vendor:**
  - Mistral Small 3.2: Polish is in [docs.mistral.ai/resources/languages](https://docs.mistral.ai/resources/languages), re-fetched and confirmed 2026-09-28.
  - LFM 2.5: Polish is on the model card.
- **From search snippets only, not re-fetched:** the Gemini family and Cohere Command A+.
- **Not named:**
  - GPT-5 nano: no source found names Polish. The 13 translated-MMLU languages cited for GPT-5 do not include it; that citation comes from a secondary arXiv copy, not re-fetched.
  - Qwen Plus: the named languages stop short of Polish.
  - Gemma 4: "35+ languages", no list.
  - Nemotron 3 Super: seven languages, not Polish.
- **Nothing found:** DeepSeek V3.2's model card has no language section.
- **Not checked:** DeepSeek V4.1 Flash, GPT-4.1 nano and Gemini 3.1 Flash-Lite.

**Accuracy on these posts is unmeasured for every model.** The PRD defers the acceptable share of wrong entries to "after the first extraction run on real posts" (`context/foundation/prd.md:122`, `context/foundation/roadmap.md:145`). Only a trial run on real posts can supply that number.

### Wiring it into this repository

**Where it runs.**

- "Collection *and* LLM extraction run sequentially on a GitHub Actions cron, outside the hosting platform" (`context/foundation/infrastructure.md:43`).
- `collect.yml` has a single job with a 15-minute timeout (`:35`). It installs with `npm ci --omit=dev` (`:51`), so anything the extractor imports at runtime has to be a `dependency`, not a `devDependency`. It scopes each secret to the step that needs it (`:53-65`).
- The six-hour visibility requirement leaves roughly two hours after four-hourly collection (`context/changes/collector-into-repo-and-database/plan.md:344`). Extraction in the same run adds minutes.

**The backlog marker.**

- `processed_at` null means "not yet processed", and neither the collector nor the importer writes the column (`supabase/migrations/20260923094535_add_processed_at_to_collected_posts.sql`).
- A post still null after about seven days counts as stale rather than being retried for ever (`plan.md:39`).
- A post whose call failed with a 402 or a 429 therefore stays null and is picked up by the next run. No attempts column is needed.
- **The rule cannot tell a post that was never attempted from one that failed**, because both are null.
  - On 2026-09-28, 783 of the 2,000 unprocessed rows were already older than seven days (2,000 in total minus 1,217 from the last seven days). All of them predate any extractor, and the number grows each day until S-01 ships.
  - The PRD keeps a deal with no stated expiry on the list (`context/foundation/prd.md:56`), so these posts are not obviously worthless.
  - **Decided by the user on 2026-09-28:** the initial pass ignores the cut-off. The cut-off starts to apply only once the existing backlog has been processed and extraction is keeping up with the inflow.
  - F-02 left this query to S-01 ("That is S-01's query", `context/changes/collector-into-repo-and-database/plan.md:39`), so the decision sits within this change.
  - **Still open for the plan:** turning "caught up" into something a run can check. `processed_at` alone cannot record that a post was attempted.

**Client.**

- Plain `fetch` to `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <key>` is documented ([quickstart](https://openrouter.ai/docs/quickstart)).
- It is also the repository's existing pattern: `createRawgCatalog({ apiKey, fetch })` takes the key and `fetch` as parameters (`src/lib/catalog/rawg.ts:102-108`).
- Optional attribution headers: `X-OpenRouter-Title` (`X-Title` "is still supported for backwards compatibility") and `HTTP-Referer` ([app attribution](https://openrouter.ai/docs/app-attribution)).

**Documented alternatives, each adding a dependency** (npm registry, 2026-09-28):

- `@openrouter/sdk` 1.3.33, ESM-only. In its published source, retries use exponential backoff on 5XX with `maxElapsedTime: 3600000` (one hour), longer than the job's 15-minute timeout. Its README and its types show different call shapes.
- The OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"` (`openai` 7.23.0).
- `@openrouter/ai-sdk-provider` 3.1.0, which requires `ai` ^7.

Several OpenRouter docs pages, the authentication and app-attribution pages among them, carry a block addressed to AI assistants: "use OpenRouter SDKs by default". That is page content, not an engineering reason, and is recorded here only so the plan does not treat it as one.

**Request fields that matter** ([chat completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)):

- `models: [...]`: fallbacks tried in order. "By default, any error can trigger the use of a fallback model, including … Rate-limiting", and requests are "priced using the model that was ultimately used" ([fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)).
- `response_format: { type: "json_schema", json_schema: { name, strict, schema } }`. `name` allows a-z, A-Z, 0-9, underscores and dashes, up to 64 characters.
- `provider: { require_parameters: true }`.
- `reasoning: { effort: "none" }` where the endpoint allows it.
- `plugins: [{ id: "response-healing" }]`: works for non-streaming requests only and cannot repair output truncated by `max_tokens` ([response healing](https://openrouter.ai/docs/guides/features/plugins/response-healing)). It is free according to a 2025-12-18 announcement; the docs do not say.

**The schema from zod** (verified on the installed 4.6.5 on 2026-09-28 by running `z.toJSONSchema()` on a sample deal schema):

- Objects get `additionalProperties: false`.
- `.nullable()` becomes `type: ["T", "null"]`.
- `.optional()` fields are left out of `required`. Strict JSON-schema modes commonly require every property to be listed, so `.nullable()` is the safer spelling for an optional value. This was not verified against any OpenRouter endpoint.
- `.int()` adds `minimum`/`maximum` of ±9007199254740991.
- The output starts with a `"$schema": "https://json-schema.org/draft/2020-12/schema"` key.

Whether every chosen endpoint accepts the `$schema` key and the integer bounds is untested. Because strict compliance is not guaranteed, the same zod schema can validate every response, as `parseRawgSearchResponse` does for RAWG (`rawg.ts:84-100`).

**Responses and errors.**

- `usage` carries `cost` without any opt-in: `usage: { include: true }` "is deprecated and has no effect" ([usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)).
- The generation id "is returned in the `X-Generation-Id` response header for all endpoints" ([streaming](https://openrouter.ai/docs/api_reference/streaming)).
- "Check the body for an `error` field even on a `200`, rather than relying on the status alone" ([errors](https://openrouter.ai/docs/api_reference/errors-and-debugging)).
- 402 carries `error.metadata.limit_source`, one of `openrouter_credits`, `openrouter_key_limit` or `openrouter_in_flight_budget`. The docs say to "branch on `limit_source`, not on the hint text" ([limits](https://openrouter.ai/docs/api_reference/limits)).
- 403 covers moderation and guardrail blocks.
- 429 may carry `Retry-After`, and OpenRouter's own 429s carry `X-RateLimit-*`.
- The list also includes 408, 502, 503, 524 and 529.
- These map onto the repository's existing shape of typed failure reasons (`src/lib/catalog/types.ts:27-37`).

**Spend control.**

- A key can be created with a USD credit limit and `limit_reset` set to `daily`, `weekly` or `monthly`; resets happen at midnight UTC ([create key](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key)). "We recommend setting a credit limit on every key" ([authentication](https://openrouter.ai/docs/api_reference/authentication)).
- `GET /api/v1/key` reads `limit`, `limit_remaining`, `usage_daily`/`_weekly`/`_monthly` and `free_model_daily_requests`.
- Unresolved: the pricing page's Free column lists "Budgets & Spend Controls: No", so it is not clear whether an account that has bought nothing can set a key limit.

**The key.**

- `OPENROUTER_API_KEY` belongs in GitHub Actions secrets, scoped to the extraction step as `collect.yml:53-65` scopes `SUPABASE_SECRET_KEY`, and never with a `NEXT_PUBLIC_` prefix.
- It replaces the `ANTHROPIC_API_KEY` placeholder (`.env.example:26-28`), which is also named in `context/deployment/alternative-git-integration.md:110`.
- The lessons register asks for the pipeline's own command to be run against a new credential locally before it goes into CI (`context/foundation/lessons.md:16`). `GET /api/v1/key` is a read-only check that returns limits and usage, not the key. Per `CLAUDE.md:62-64`, the user runs it.

**RAWG.** The F-03 handoff for S-01 (`context/changes/game-catalog-provider-proven/coverage.md:155-163`) asks for five things:

- Emit the original English title.
- Classify "is this a game deal" before resolving; a soundtrack post resolved to the game GTA VI.
- Remember that bundles have no catalogue entry.
- Plan for about one request per deal, against a free tier of 20,000 requests a month.
- Put the key into GitHub Actions secrets (`.env.example:23`).

**Reading deals in the app.**

- The S-01 view is public: "A visitor sees…" (`context/foundation/roadmap.md:44`, `:135`), and "Every path is public" (`src/lib/auth/access.ts:9-14`).
- Vercel holds only Supabase's publishable key; `SUPABASE_SECRET_KEY` is deliberately absent there (`context/foundation/infrastructure.md:146`).
- A Server Component reading deals therefore reads as `anon` or `authenticated`, the same roles a browser client uses, and needs a grant plus a select policy on whatever it reads.
- The rule's wording does not cover this case directly: `CLAUDE.md:40` allows a policy "only when a browser client genuinely needs the rows" and requires a justification in the migration. The plan has to make that justification for a server-rendered public view that reads through the publishable key.
- `collected_posts` has no policy and no grants for those roles (`supabase/migrations/20260921133305_create_collected_posts.sql:19-20`).

**Freshness.**

- S-01's outcome includes "The view states when the data was last refreshed" (`context/foundation/roadmap.md:137`).
- `collected_posts` is unreadable to the view's role, and F-02 deliberately built no run table (`context/changes/collector-into-repo-and-database/plan.md:37`). The freshness signal therefore needs a source the view can read; that is still undecided.
- The deals view today is a placeholder (`src/app/(app)/page.tsx:3-17`).

### What the posts give the extractor

This section rests on one live snapshot of all 15 feeds: 2026-09-28, 11:52:38–11:52:44 UTC, every feed HTTP 200, 470 items. Cue counts come from regular expressions and are directional.

**Feed format.**

- **Page sizes.** pepper serves 9 feeds × 30 items, lowcygier 4 × 30, and cenograj 2 × 40 as Atom.
- **Where the stored `content` comes from.** None of the 15 feeds contains a `content:encoded` element (0 across all files). The stored `content` is therefore `<description>` for RSS and `<content>` for Atom (`scripts/collector/posts.mts:114-119`).
- **A page is a fixed item count, not a time window.** One page covered 20.2 hours (`pepper-gry-wideo`); another covered 14,770 hours (`pepper-xbox-series-s`).

**Cues:**

| Cue | pepper (270) | lowcygier (120) | cenograj (80) |
| --- | --- | --- | --- |
| Price in the title | 40 (14.8%) | 102 (85.0%) | 80 (100%) |
| Percentage discount stated | 18 (6.7%) | 7 (5.8%) | 80 (100%) by regex; 72 are discounts and 8 a price advantage |
| Expiry phrase | 6 (2.2%) | 2 (1.7%) | 0 |
| Outbound shop link inside `content` | 63 (23.3%) | 0 | 0 |
| RSS `link` domain | pepper.pl (all) | lowcygier.pl (all) | cenograj.pl (all) |
| Categories present | 270 | 120 | 0 |

**pepper.**

- 265 of 270 bodies open with `<price>zł - <shop>`.
- All 270 items carry a `<pepper:merchant>` element (namespace `http://www.pepper.com/rss`); 268 of them have a `price` attribute and 267 a `name`. The collector's parser does not request the element (`scripts/collector/collect.mts:63`, `customFields: { item: ["content:encoded"] }`).
- Because the body already carries the price-and-shop pair, capturing the element gives the model nothing new. It matters mainly if price and shop are to be parsed without a model.

**cenograj.**

- Items follow a fixed template. `Platforma`, `Typ: Pudełko`, `Sklep` and `Aktualna cena` appear in 80 of 80, and `Poprzednia cena` and `Rabat` in 72 of 80.
- **In the other 8, the percentage in the title is not a discount.** It is `Przewaga cenowa` (price advantage) over `Kolejna najtańsza oferta` (next-cheapest offer), e.g. "Beholder 2 za 75 zł (34%)". The PRD shows the discount "jeśli wpis źródłowy ją podaje" (`context/foundation/prd.md:77`), so the extraction has to tell the two apart. This also qualifies the regex count of 80 of 80 cenograj discounts in the cue table.
- Each item covers one game, and there are no categories.

**lowcygier.** `content` is a short excerpt ending in a "read more" link (858–1,822 raw characters). The shop is named in plain text ("w Amazon PL"), and the price is in the title for 85.0% of items.

**Keyword rules fail on this text.**

- The pepper Silent Hill 2 Deluxe post is a digital Xbox Store purchase, yet it contains "pudełko" — the pack includes a cosmetic item described as "pudełko do pizzy".
- "kod" fires on both discount codes and activation keys.
- Non-game or digital items also sit in these feeds: a Game Pass trial (`lowcygier-polecane`), an eShop game (`pepper-gry-nintendo-switch`), refurbished consoles (`pepper-xbox-series-s`) and a weekly Steam digest (`lowcygier-polecane`).

**One post can hold several deals.** By a heuristic count, roughly 22 of 270 pepper posts and 13 of 120 lowcygier posts cover several items (weekly digests, key-shop roundups, store-opening hauls). No cenograj post does. The output therefore has to allow zero, one or many deals per post.

**Duplicates.**

- The 470 items carried 415 distinct links, and 52 links appeared in more than one feed, always within one aggregator.
- Extracting once per link would have saved 55 of 470 calls (11.7%).
- The same deal on two aggregators has two different links and cannot be matched by link (PRD open question 2, `context/foundation/prd.md:121`).

## Code References

- `.github/workflows/collect.yml:14` — `cron: "7 */4 * * *"`, six runs a day
- `.github/workflows/collect.yml:33-35` — ~5-minute worst-case collection, 15-minute job timeout
- `.github/workflows/collect.yml:51` — `npm ci --omit=dev`: runtime imports must be dependencies
- `.github/workflows/collect.yml:53-65` — step-scoped secrets, the pattern for `OPENROUTER_API_KEY`
- `.env.example:23` — "S-01 to GitHub Actions secrets" for `RAWG_API_KEY`
- `.env.example:26-28` — `ANTHROPIC_API_KEY` placeholder, "We will pick the model when we build the extractor"
- `scripts/collector/collect.mts:63` — `customFields: { item: ["content:encoded"] }`; `pepper:merchant` not captured
- `scripts/collector/posts.mts:20` — `CONTENT_LIMIT = 4000`
- `scripts/collector/posts.mts:114-119` — `pickContent()`: `content:encoded ?? content ?? contentSnippet`
- `supabase/migrations/20260921133305_create_collected_posts.sql:4-14` — the nine columns
- `supabase/migrations/20260921133305_create_collected_posts.sql:19-20` — RLS on, no grants to `anon`/`authenticated`
- `supabase/migrations/20260923094535_add_processed_at_to_collected_posts.sql` — `processed_at` and the backlog contract in its comment
- `src/lib/catalog/rawg.ts:84-100` — zod validation of a provider response, the pattern for the model's reply
- `src/lib/catalog/rawg.ts:102-108` — key and `fetch` injected, no environment read
- `src/lib/catalog/types.ts:27-37` — typed failure reasons without URLs or bodies
- `src/lib/auth/access.ts:9-14` — every path public
- `src/app/(app)/page.tsx:3-17` — placeholder deals view
- `CLAUDE.md:40` — new tables ship locked; a policy only when a browser client needs the rows
- `CLAUDE.md:62-64` — `.env.local` is off-limits; the user runs credential checks
- `context/foundation/lessons.md:9` — domain decisions in pure functions, I/O injected
- `context/foundation/lessons.md:16` — prove a credential against the pipeline's own command before CI

## Architecture Insights

- **At this scale, money is not the constraint.** Among the five costed models, the monthly bill differs by at most about $4 (heavy scenario: $0.79–4.84). What decides whether S-01 works is one judgement — physical or digital — on pepper and lowcygier prose, and whether each call returns a valid object. The model should be chosen on those two things.
- **The cost guardrail (`context/foundation/prd.md:43`) is enforced mostly by structure, not by the model's price.** `processed_at` makes extraction once-per-post, and inflow is bounded by feed page sizes: at most 470 new rows per run, the sum of the 15 pages. Even a deliberate re-run of all 2,000 rows would cost $0.20–2.15 on the costed models. So a model or prompt change is affordable, provided each result records the model and prompt that produced it; a re-run then happens on purpose, not by accident.
- **Retries cost differently on the two tiers.** On the free tier, failed attempts count against the daily cap. On paid models, an errored attempt is not charged. A retry loop that is harmless on paid can exhaust the free quota.
- **Model ids churn, so they belong in configuration.** 27 of 458 catalogue entries carry an expiry date, several of them within the next three weeks. A `models` fallback list plus the catalogue's `expiration_date` field make this visible before it breaks a run.
- **Not every post needs the model.** cenograj items are fully templated, and pepper bodies open with a price and a shop. The model is needed mainly for game identity, the edition judgement on pepper and lowcygier, and splitting multi-deal posts. cenograj supplies 942 of the table's 2,000 rows (47.1%), so skipping the model for it would remove almost half of all rows from the model's workload. That matters most under the 50-a-day free cap.
- **Keeping rejections widens what the first review can see.** PRD open question 3 (`context/foundation/prd.md:122`) — the share of wrong entries on the list — can be answered by reviewing the accepted deals alone.
  - Storing the classification of rejected posts (digital, not a game) next to them also lets the same review find physical deals rejected by mistake.
  - It lets a new model be compared on the same posts without calling the old one again.

## Historical Context (from prior changes)

**Prior decisions this research builds on:**

- `context/foundation/infrastructure.md:43` — extraction runs sequentially with collection on the Actions cron. Consistent with the current `collect.yml`.
- `context/foundation/infrastructure.md:129` — asked for run outcomes in a Supabase table. F-02 narrowed that for the collector (`context/changes/collector-into-repo-and-database/plan.md:37`). S-01's public freshness line reopens the question for the view.
- `context/changes/collector-into-repo-and-database/plan.md:39` — the seven-day staleness rule for `processed_at`.
- `context/changes/collector-into-repo-and-database/plan.md:344` — roughly two hours of margin against the six-hour requirement.
- `context/changes/game-catalog-provider-proven/coverage.md:155-163` — F-03's handoff to S-01 (English title, classify before resolving, one RAWG request per deal).
- `context/foundation/roadmap.md:146` — the model choice was deferred to S-01. The user narrowed it on 2026-09-28 to OpenRouter, free or very cheap.

**Historical claims, each with its own verdict:**

- **Supported.** `context/foundation/roadmap.md:147` — "the feeds overlap and the collector deduplicates per feed by design, so the same deal arrives several times under different sources". In the live snapshot, 52 links appear in more than one feed.
- **Partly contradicted.** `context/foundation/roadmap.md:116` — "RSS feeds here retain roughly two days".
  - The feeds return a fixed page of 30 or 40 items.
  - On the two busiest feeds (`pepper-gry-wideo`, `cenograj-pudelkowe-nowe`) that page spanned 20.2 and 23.0 hours; on others it spanned weeks to months.
  - The conclusion the claim supported still holds, and sooner: a collection gap loses entries permanently, and on the busiest feeds within about a day.
- **Current but superseded.** `.env.example:27` — "We will pick the model when we build the extractor". The remark is still accurate, but the placeholder name `ANTHROPIC_API_KEY` is overtaken by the OpenRouter choice.
- **Partly supported.** `context/changes/collector-into-repo-and-database/research.md:90` — about 141 rows a day, from a proxy. The table's ten complete, undisturbed days average 114.7 rows a day (57–202), so the proxy overstated the steady state by about 23%.
- **Supported, and exceeded.** `context/changes/collector-into-repo-and-database/research.md:173` — 100 of 550 distinct links repeated across feeds, 109 surplus rows of 659 (16.5%). In the full table the surplus is 427 of 2,000 rows (21.4%).
- **Qualified.** `context/changes/collector-into-repo-and-database/plan.md:269` — running the new workflow alongside the old cron "costs nothing and loses nothing".
  - It lost no rows.
  - Inferred from the 2026-09-16 and 2026-09-23 day counts (see [Volume](#volume)), it did move `first_seen_at` to the new collector's first sighting for entries both collectors saw.
- **Refined for S-01 by the user, 2026-09-28.** `context/changes/collector-into-repo-and-database/plan.md:39` — posts null for more than about seven days "are treated as stale rather than retried forever". That fits poison posts, but it also covered the 783 never-attempted backlog rows that were older than seven days that day. The rule now applies only after the initial pass has processed the backlog.
- **Not re-checked here.** `context/changes/game-catalog-provider-proven/coverage.md:161` — RAWG's free tier of 20,000 requests a month.

## Related Research

- `context/changes/collector-into-repo-and-database/research.md` — the collector, the table and the growth proxy this document reuses.
- `context/changes/game-catalog-provider-proven/coverage.md` — not a research document, but the RAWG verdict and the S-01 handoff.
- `context/changes/ui-init/research.md` — not applicable (design tokens).

## Open Questions

1. **Exact inflow and backlog.** Answered 2026-09-28 by three queries the user ran; the figures are in [Volume](#volume).
2. **Has the OpenRouter account bought $10 or more of credits all-time?** Answered 2026-09-28: there is no account yet (user).
   - A new account has bought nothing, so its free cap is 50 requests a day until it buys $10 or more.
   - New users get "a small free allowance to test out OpenRouter" ([FAQ](https://openrouter.ai/docs/faq)). Its size is not stated.
   - Creating the account, any purchase and the key are human steps, needed before the first live call rather than before planning.
3. **Free route or paid route.** The user's decision; the recommendation is in the Summary.
4. **If free: turn on the account's free-model training toggle?** It applies to the whole account. Owner: user.
5. **Can this account set a key credit limit?** The pricing page's Free column and the authentication page disagree. To be checked when the key is created.
6. **How accurate is each candidate on real posts?** Unmeasured. It needs a labelled sample of real posts (the user offered the data), and it answers PRD open question 3 at the same time.
7. **Does OpenRouter's own free-tier 429 trigger the `models` fallback?** Not documented.
8. **Three things only a first live call can settle:**
   - Does the chosen endpoint accept the `$schema` key and the integer bounds from zod?
   - Does `reasoning: { effort: "none" }` give zero reasoning tokens there?
   - Does `openrouter/free` share the daily counter with `:free` models?
9. **Where does the view read deals and freshness from, and under which select policy?** A plan decision, bounded by `CLAUDE.md:40`.
10. **Does S-01 resolve RAWG ids, or leave that to S-04?** Prior documents assume S-01 does (`.env.example:23`, `context/changes/game-catalog-provider-proven/coverage.md:155-163`).
11. **Does the first extraction pass take the whole backlog?** Answered 2026-09-28 (user): yes.
    - The initial pass ignores the seven-day cut-off, which starts to apply once the backlog is processed and extraction is keeping up.
    - The plan still has to define "caught up" as a condition a run can check (see "The backlog marker").
12. **Does the cenograj template hold across all 942 rows?** It was checked on 80 live items only. It matters if the plan parses cenograj without the model. A read-only query for the user:

    ```sql
    select count(*) as cenograj_rows,
           count(*) filter (where content ilike '%Typ:%Pude%ko%') as typ_pudelko,
           count(*) filter (where content ilike '%Platforma:%') as platforma,
           count(*) filter (where content ilike '%Sklep:%') as sklep,
           count(*) filter (where content ilike '%Rabat:%') as rabat,
           count(*) filter (where content ilike '%Przewaga cenowa%') as przewaga
    from public.collected_posts
    where source like 'cenograj-%';
    ```

**Evidence deliberately not gathered:**

- No API key was used and no model was called.
- The agent ran no SQL, because this machine has no agent path to the hosted database. The user ran the three volume queries.
- Token counts are character-based estimates, not tokenizer counts.
- Polish quality was not benchmarked. The attempt to read the Open PL LLM Leaderboard returned only a loading page.
