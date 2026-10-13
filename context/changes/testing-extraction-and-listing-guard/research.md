---
date: 2026-10-13T14:44:04+02:00
researcher: tkedz
git_commit: 18ae715dc6845def7a8fecba93ff667edc7f7c06
branch: main
repository: 10x-physical-games-deals
topic: "Grounding rollout Phase 2 of the test plan: extraction and listing guard (Risks #2 and #5), the eval gate and the post-edit hook"
tags: [research, testing, extraction, eval, listing, expiry, links, hooks, vitest]
status: complete
last_updated: 2026-10-13
last_updated_by: tkedz
---

# Research: Grounding rollout Phase 2 — extraction and listing guard

**Date**: 2026-10-13T14:44:04+02:00 (Europe/Warsaw)
**Researcher**: tkedz
**Git Commit**: 18ae715dc6845def7a8fecba93ff667edc7f7c06 (`context/foundation/test-plan.md` and this change folder are uncommitted)
**Branch**: main
**Repository**: 10x-physical-games-deals

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` ("Extraction and listing guard", Risks #2 and #5). Verify rather than accept the response guidance.

- **#2:** on the labelled set, a prompt or model change keeps digital or key offers among listed deals at zero and wrong entries at or below 5%, without newly dropping physical deals. The deterministic listing rules hide a deal after its stated expiry in Warsaw time, across the 2026-10-25 DST change, keep undated deals, and never list a set's price as one game's.
- **#5:** for posts with and without a shop link, and for adversarial ones (`javascript:`/`data:` links, aggregator self-links, URLs absent from the post), the stored link is one of the post's own http(s) shop links or the aggregator post itself.

Also ground, for the gates this phase wires:
- which decisions the model makes and which deterministic code makes;
- the labelled set: its composition, where its post texts live and who can run the eval;
- how the eval scores through the pipeline's own row mapping, and what a run costs;
- what could make a human-run eval a required gate;
- which Claude Code hook event and matcher fit a post-edit hook, and how long the fast suites take.

## Summary

1. **The model makes every judgement listed below; code only cleans, converts, checks one URL and gates listing.**
   - The model decides which items exist, `kind`, `edition`, platform, `setWith`, price, discount, the expiry day and hour, and which link is the `shopUrl` (`scripts/extract/prompt.mts:36,53,65,71,73,77`).
   - Deterministic code decides price and currency cleaning, the expiry instant in Warsaw time, whether the shop URL is kept, and listability (`scripts/extract/deals.mts:88-99,133-150,208-245,300-308`). It also decides the read-time expiry filter (`src/lib/deals/queries.ts:165`) and the render-time scheme check (`src/lib/deals/links.ts:25-36`).
   - In the inspected extraction path (`deals.mts`, `pipeline.mts`), no code cross-checks the model's `edition`: it is compared to `"physical"` and nothing else (`deals.mts:304-306`). `edition_evidence` is only stored, cut to 300 characters (`deals.mts:290-291`).
2. **The eval scores through the pipeline's own row mapping, but it is a report, not a gate.**
   - It scores through the production `toDealRows` and `isListable` (`scripts/extract/evaluation.mts:19,541-549`; production calls them at `pipeline.mts:444`), and sends the production prompt (`buildMessages`, `eval.mts:184-190`). One exception: expiry is compared on the model's raw string, so `expiryInstant` is never exercised (`evaluation.mts:334`).
   - It exits 1 only when the evaluation itself aborts. Leaks or regressions exit 0 (`eval.mts:529-535`). `rankModels` only prints eligibility (`evaluation.mts:694-722`).
   - It measures `CANDIDATES`, while production sends `MODELS`, and nothing checks that `MODELS ⊆ CANDIDATES` (`config.mts:8-22`; `eval.mts:449-450`).
   - It computes no "wrong entries %".
3. **The labelled set cannot see three of the decisions Risk #2 names.**
   - **Composition:** 55 posts with 55 expected items: 23 `game/physical` (all listable), 21 `game/digital`, 10 `not_game/physical` and 1 `game/unclear` without a price. Six posts expect nothing, and 5 posts expect more than one item (`scripts/extract/eval/labels.json`, counted in this research).
   - **Expiry:** 0 labels carry `expiresOn`.
   - **Sets:** no physical set. The one set, #42, is digital and labelled as one item, because its label predates the set rule (`context/changes/physical-deals-from-real-posts/evaluation.md:106`).
   - **Links:** the label schema has no `setWith` and no `shopUrl` field, and it is strict (`evaluation.mts:51-73`).
   - So model-side expiry reading, set recognition and link choice are unmeasured.
4. **The post texts live only in a local, gitignored file, and its export cannot be reproduced.**
   - `posts.json` is gitignored (`.gitignore`: `/scripts/extract/eval/*` with only `labels.json` re-included).
   - It was exported by hand with a query that orders by `random()` (`evaluation.md:151-216`), and `loadCases` throws when a labelled post is missing (`eval.mts:139-145`).
   - Running the eval needs that file plus `OPENROUTER_API_KEY`, which in practice means Tomasz.
   - **Cost:** about $0.024–0.027 for a full run of 2 models × 55 calls; Mistral alone costs $0.0147 at v3. Wall time is about 5–8 min, estimated from latencies and not recorded (`report-v3.md:627-628`; `evaluation.md:100-101`).
5. **In the inspected read paths and migrations, expiry is hidden by one PostgREST filter and nothing else.**
   - The only predicate is `.or("expires_at.is.null,expires_at.gt.<now>")` (`queries.ts:165`), inside an unexported function in a `server-only` module (`queries.ts:21`). Both `/` and `/my-deals` go through it (`queries.ts:181-201`).
   - The RLS policy and the `matched_deals` view carry no expiry term (`20260930061813_create_deals.sql:50`; `20261012070050_match_deals_to_watchlist.sql:180`).
   - The write side handles the DST change correctly in every case run here (probe table below).
   - **Two paths fail open, so a deal stays listed past its stated end.** An expiry date the model writes in another format becomes `null`, which means "undated", so the deal is listed indefinitely. A one-digit hour ("7:00") becomes end of day.
6. **Sets: the code never hides a set or divides its price.** Each game's row carries the whole set's price, and the card labels it "Cena za cały zestaw razem z: …" whenever `set_with` is non-empty (`src/components/deals/deal-card.tsx:108-112`).
   - The label shows only if the model filled `setWith` with names other than the item's own: `distinctNames` drops own titles, so a `setWith` naming only the item itself becomes empty (probe below).
   - Rows extracted before prompt v3 have an empty `set_with` (`20261006065758_add_set_with_to_deals.sql:13-14`).
7. **The link rule holds against every adversarial scheme tried, and it has no notion of "shop".**
   - `verifyShopUrl` keeps a URL only when three things hold: it is character-for-character one of the post's hrefs, its scheme is http(s), and it is not on the post's own site (`deals.mts:133-150`). In the probe, 6 non-web forms and 2 relative forms were all rejected.
   - It still keeps any other off-site http(s) href of the post: another aggregator's link, a lookalike host, a userinfo URL.
   - Which of a post's links belongs to which item is the model's choice. Code cannot check it and the eval does not label it.
   - At render, React (Next's vendored copy) blocks `javascript:` but passes `data:` unchanged (`node_modules/next/dist/compiled/react-dom/cjs/react-dom-server.node.production.js:285-291`). `links.ts` is therefore the only render-time barrier for `data:`.
8. **The cheapest layer for every deterministic rule is unit, and it works today.**
   - In this research, a scratch Vitest config proved that a test can import `scripts/extract/deals.mts`, `pipeline.mts`, `schema.mts` and `@/lib/deals/links` (1 file passed, 1.04 s).
   - `queries.ts` cannot be imported, because `import "server-only"` throws outside Next.
9. **Post-edit hook:** use the `PostToolUse` event with matcher `Edit|Write`. The command reads `tool_input.file_path` from stdin and filters by path itself. Exit 2 shows stderr to Claude without blocking.
   - Timings measured here: the unit project takes 1.32 s (4.3 s wall) and the db project 14.31 s (16.4 s wall).
10. **The hot-spot churn is mostly elsewhere.** `verifyShopUrl`, `expiryInstant` and `postHrefs` have each been changed only in the commit that created them (0a43bb1), and the read-side expiry filter only in 67aa4b3.
    - The 6 and 5 commits in 14 days fell on pipeline, store, cron, eval, review and page code. Two of the 6 `scripts/extract/` commits touched the prompt or schema.

## Detailed Findings

### Who decides what

| Decision | Model (prompt) | Deterministic code | Failure path if it goes wrong |
|---|---|---|---|
| Physical vs digital/key | `edition` ∈ physical/digital/unclear; "Choose "unclear" over a guess" (`prompt.mts:53`) | `isListable`: `kind === "game" && edition === "physical" && price_amount !== null` (`deals.mts:300-308`), restated by the RLS policy (`create_deals.sql:50`), the view (`match_deals_to_watchlist.sql:180`) and the query (`queries.ts:160-162`) | A model "physical" on a key-shop offer is listed; no code compares `edition` with `edition_evidence` or the shop host |
| Non-deal (news, comparison price) | Empty `items` or no price (`prompt.mts:34`) | No price → `price_amount` null → stored, not listed | A model price on a comparison figure is listed |
| Price | Which figure, currency code (`prompt.mts:67`) | `toPrice`: rounds to 2 dp, aliases `ZŁ`/`ZL`/`€`, rejects ≤0, > 99,999,999.99 or a non-3-letter code (`deals.mts:88-99`) | A wrong figure that is well-formed passes |
| Set | One item per game, the set's price, others in `setWith` (`prompt.mts:36,65`) | `set_with: distinctNames(item.setWith, ownTitles)` (`deals.mts:283`); `isListable` ignores it; the card labels the price (`deal-card.tsx:108-112`) | A set returned as one item with empty `setWith`, or a `setWith` naming only the item itself, shows the set price unlabelled |
| Expiry | `expiresOn` YYYY-MM-DD, `expiresAt` HH:MM, relative phrases resolved by the model (`prompt.mts:71,73`) | `expiryInstant` → exclusive end instant in Europe/Warsaw (`deals.mts:208-245`); read filter `expires_at > now` or null (`queries.ts:165`) | A model date in another format is treated as undated, and the deal is listed indefinitely |
| Shop link | `shopUrl` "copied character for character … Never a link to the aggregator" (`prompt.mts:77`) | `verifyShopUrl` (`deals.mts:133-150`); render `webUrl` (`links.ts:25-36`) | A link to another item's offer in the same post passes |

`schema.mts` validates only the reply's shape: enums, `z.number()` for the price, `z.string().nullable()` for both expiry fields (`schema.mts:46-49,60-68`). An enum value outside the vocabulary fails the whole reply as `invalid_reply`.

### Risk #2 (model side): the labelled set and the eval

**Composition.** Recounted with Node from `labels.json` in this research:

| Measure | Count |
|---|---|
| Posts / expected items | 55 / 55 |
| `game/physical` (all with a price, so all listable) | 23 |
| `game/digital` | 21 |
| `not_game/physical` | 10 |
| `game/unclear`, no price (#53) | 1 |
| Posts expecting nothing | 6 |
| Posts expecting more than one item | 5 |
| Items with `expiresOn` | 0 |
| Physical sets | 0 (the only set, #42, is digital and labelled as one item) |

A count over the gitignored `posts.json` in this research, which printed no post text, found:
- 11 of 55 posts carry at least one off-aggregator http(s) href, 4 of them among the 23 physical-deal posts (a heuristic, not `verifyShopUrl`'s exact decision);
- pepper has 27 posts, lowcygier 16 and cenograj 12;
- `first_seen` dates run from 2026-09-16 to 2026-09-29.

`evaluation.md:32-36` tallies 23/21/10 and leaves out the one `unclear` item.

**Where the post texts live, and who can run it.**
- **Committed:** only `labels.json` (`.gitignore`, the `scripts/extract/eval/*` block). It holds ids, English titles, prices and short trap notes, but no post bodies.
- **Post texts:** they live only in the local `scripts/extract/eval/posts.json`. Tomasz exported it on 2026-09-29 with a SQL-editor query over `public.collected_posts` that orders by `random()` (`evaluation.md:151-216`). No npm command produces it (`eval.mts:125` tells the user to save the query result there).
- **Recovery:** a rerun of that query draws other posts. If the file is lost, it can be rebuilt only by exporting the 55 ids in `labels.json`, which needs those rows still in `collected_posts` (not verified).
- **Who can run it:** whoever holds `OPENROUTER_API_KEY` (checked first, `eval.mts:442-444`) and `posts.json`. CI has neither, and the key's Actions secret is scoped to the extract step (CLAUDE.md, Deal extraction).

**How it scores.**
- It sends the production prompt and request: `buildMessages(group)`, `TEMPERATURE`, `MAX_TOKENS` and `toResponseFormat()` (`eval.mts:184-190,459`). Production sends the same at `extract.mts:114-119,253`.
- `measureCall` maps each reply with `toDealRows(result.output, group)` (`evaluation.mts:541-549`) and judges listability with the production `isListable`.
- Each returned item is marked listed, leak, extra offer, wrong game, missed or rejected (`evaluation.mts:284-285,374-461`). "Leak" covers anything listed that the label says is not a physical game, so non-games and `unclear` items count too.
- Field errors (price, currency, platform, discount, expiry) are counted on listed items. Expiry compares `expected.expiresOn` with the reply's raw `item.expiresOn` (`evaluation.mts:334`), not with the row's `expires_at`.
- **Not scored:**
  - links: the report prints "shop link kept/dropped" (`eval.mts:269-271`), but there is no label to compare against;
  - `set_with`: printed only (`eval.mts:257-261`);
  - a share of wrong entries.
- **Exit code:** 1 only for an aborted evaluation, such as a missing key, an unreadable file, a rejected key or exhausted credit (`eval.mts:529-535`). `rankModels` marks a model ineligible for leaks or unmeasured posts and prints the ranking (`evaluation.mts:694-722`); it changes no exit code.
- **Models:** the eval runs `CANDIDATES` (`eval.mts:449-450`), which today are Mistral Small 3.2 and gpt-4.1-nano (`config.mts:8-11`). Production sends `MODELS`, Mistral only (`config.mts:20-22`). The comment at `config.mts:14-18` says every model in `MODELS` "must have passed the labelled set", but no code checks that `MODELS ⊆ CANDIDATES`.
- **What a report records:** it is named `report-v${PROMPT_VERSION}` and records the prompt version and the models (`eval.mts:113-117,493`). It does not record the commit or a hash of the prompt.

**Cost and nondeterminism.**

| Run | Mistral | gpt-4.1-nano | Total | Wall time (estimated from per-call latencies; models run in parallel, calls in series — `eval.mts:464-466`) |
|---|---|---|---|---|
| v1 (`eval-report.md:624-625`) | $0.0110 | $0.0148 | ≈$0.026 | ≈5.0 min |
| v2 (`report-v2.md:625-626`) | $0.0111 | $0.0155 | ≈$0.027 | ≈4.9 min |
| v3 (`report-v3.md:627-628`) | $0.0147 | $0.0097 | ≈$0.024 | ≈7.9 min |

- The request uses temperature 0 and sends no seed (`config.mts:28`; `eval.mts:190`).
- **Run-to-run variation is recorded.** gpt-4.1-nano leaked 3, then 1, then 0 digital offers across v1–v3 (`evaluation.md:108`). Mistral re-broke #3's "Przewaga cenowa: 30%" discount at v3, although the rule was unchanged (`evaluation.md:103`).
- **So "it passed once" is not evidence of safety.** Money does not stop a repeat: one Mistral-only run costs about $0.015. Time and the one-machine inputs do.

**The 5% threshold does not belong to the labelled set.**
- With 23 listable items, one wrong entry is 4.3% and two are 8.7%.
- The record says the 55 posts "are a check on the traps, not an estimate of the error share on the real inflow", and that the share is the sample review's job (`evaluation.md:134-135`).
- The 5% threshold was settled on that sample review: 100 random production links, 2 of 68 listed deals wrong, 2.9% (`review.md:30-34,70`).
- The sample review reads stored extractions and calls no model (`scripts/extract/report.mts:1-15`). It therefore measures a prompt only after that prompt has run in production.

### Risk #2 (deterministic side): expiry, undated deals, sets

**Write side: `expiryInstant`.**
- It is exported and pure (`deals.mts:208-245`). The Warsaw offset is resolved through `Intl` at a guess, then at the corrected instant (`deals.mts:186-196`).
- In this research it was run under Node 24.21.0 on the working tree:

| Stated (`expiresOn`, `expiresAt`) | Stored exclusive end (UTC) | Note |
|---|---|---|
| `2026-10-24`, — | `2026-10-24T22:00:00Z` | CEST midnight |
| `2026-10-25`, — | `2026-10-25T23:00:00Z` | CET midnight after the switch |
| `2026-10-26`, — | `2026-10-26T23:00:00Z` | |
| `2026-10-25`, `02:30` | `2026-10-25T01:30:00Z` | ambiguous wall time → the later (CET) occurrence |
| `2026-10-25`, `03:30` | `2026-10-25T02:30:00Z` | |
| `2026-10-25`, `23:59` | `2026-10-25T22:59:00Z` | |
| `2026-03-29`, `02:30` | `2026-03-29T01:30:00Z` | spring gap → 03:30 CEST |
| `2026-03-28`, — | `2026-03-28T23:00:00Z` | |
| `2026-12-31`, — | `2026-12-31T23:00:00Z` | year rollover |
| `2026-10-25`, `24:00` | `2026-10-25T23:00:00Z` | end of day |
| `2026-10-25`, `7:00` | `2026-10-25T23:00:00Z` | **one-digit hour fails `TIME` (`deals.mts:199`) → end of day, ~16 h later than stated** |
| `2026-02-30`, — | `null` | not a calendar date |
| `30.10.2026`, — | `null` | **another format → null → treated as undated** |
| ` 2026-10-25 `, ` 12:00 ` | `2026-10-25T11:00:00Z` | trimmed |
| —, `12:00` | `null` | |

- The plan's Testing Strategy table (`physical-deals-from-real-posts/plan.md:853-860`, five rows) agrees with every row of this run that it covers.
- The implementation review says 66 such cases "pass" in a scratch script outside the repository (`physical-deals-from-real-posts/reviews/impl-review.md:36`). That script is not in the repository, and no `tests/` file calls `expiryInstant`.

**Read side: the hide.**
- The one predicate is `.or(\`expires_at.is.null,expires_at.gt."${now.toISOString()}"\`)` in `loadListedDealsPage` (`queries.ts:148-178`). It is unexported, takes a `SupabaseClient`, and sits in a module that opens with `import "server-only"` (`queries.ts:21`).
- `now` is `new Date()` per request (`src/components/deals/deals-section.tsx:38`, `my-deals-section.tsx:61`). Both pages read through it: `loadDealsPage` reads `deals` and `loadMatchedDealsPage` reads `matched_deals` (`queries.ts:181-201`).
- The column is `timestamptz`, nullable (`create_deals.sql:20`). Its comment says "Null when the post states no end, and the deal stays" (`:76-77`).
- **The database has no expiry term:**
  - the select policy is `using (kind = 'game' and edition = 'physical' and price_amount is not null)` (`create_deals.sql:50`);
  - the view states the same predicate (`match_deals_to_watchlist.sql:180`);
  - Phase 1's truth table therefore has no expiry case.
- Consequence: any reader other than this function lists expired deals. The PGlite harness has no PostgREST layer, so it cannot run this filter as written (test plan §6.2, Known gaps).
- **Display:** `formatExpiry` shows a Warsaw midnight as the day before, across the offset change (`src/lib/deals/format.ts:95-104`).

**Undated deals.**
- A null `expires_at` stays listed on both pages (`queries.ts:165`).
- An unreadable model date is also null (the probe above). After mapping, "the post states no end" and "the model wrote the date wrongly" cannot be told apart.
- Production evidence suggests dated deals are rare: a crawl of all 39 pages of `/` found 1,162 listed deals, of which 2 showed an expiry (`impl-review.md:37`).

**Sets.**
- `set_with text[] not null default '{}'` (`20261006065758_add_set_with_to_deals.sql:6`). Its comment: "Empty … for every row extracted before prompt version 3, set or not" (`:13-14`).
- The probe ran `toDealRows` on one post with three items that differ only in `setWith`:
  - `setWith: ["Game B"]` stored `["Game B"]`;
  - `setWith: ["Gra A", "GAME A"]`, the item's own titles in two cases, stored `[]`;
  - `setWith: []` stored `[]`.
  - All three kept the price 199.99 PLN, so the second shows a set price with no set note.
- The card note appears only when `set_with.length > 0` (`deal-card.tsx:108-112`), on both pages through `deal-list.tsx`.
- The failure the PRD records — "dwie okazje z ceną zestawu dwóch gier" (`prd.md:124`; `review.md:30-34`, #58) — happened under prompt v2, before the rule.

### Risk #5: where the link is chosen, stored and rendered

**Chosen.**
- The model returns `shopUrl` (`prompt.mts:77`).
- `toDealRows` passes `verifyShopUrl(clean(item.shopUrl), postHrefs(post.content), hostOf(post.link))` (`deals.mts:258-259,288`).
- `postHrefs` takes every `<a href>`, whether double-quoted, single-quoted or bare, entity-decodes it once and trims it (`prompt.mts:165,223-233`). `postText` shows the model the same decoded targets as `[label](href)` (`prompt.mts:193-220`).
- A post's `content` is `content:encoded ?? content ?? contentSnippet`, cut to 4,000 characters (`scripts/collector/posts.mts:20,114-119`). A plain-text snippet, or a link past the cut, yields no shop URL. That fails safe: the deal falls back to the post.

**Stored.**
- `deals.shop_url text` is nullable, and `deals.link text not null references post_extractions(link)` (`create_deals.sql:7,21`).
- No migration puts a `CHECK` on either column's scheme; the scheme rule lives only in the column comment (`create_deals.sql:79-80`).
- The post link comes from the feed unchecked: `link: item.link ?? null` (`scripts/collector/posts.mts:141`).

**Rendered.**
- `dealLinks` re-checks both URLs with `webUrl` (http/https only, normalised `href`) and falls back to the post. When the post URL fails too, the card has no link (`links.ts:25-55`).
- The only href built from deal data is `deal-card.tsx:49`, a plain `<a target="_blank" rel="noopener noreferrer nofollow">`. It always receives a `dealLinks` result (`deal-card.tsx:72`). In a grep of `src/**/*.tsx` for `href=`, every other value is a static path, a `pageHref()` result or the fixed `https://rawg.io` (`src/components/watchlist/rawg-attribution.tsx:18`).
- **React's own protection.** Next aliases `react-dom` to its vendored copy (`node_modules/next/dist/build/create-compiler-aliases.js:293`). That copy's `sanitizeURL` replaces a `javascript:` URL with `javascript:throw new Error('React has blocked a javascript: URL …')` (`next/dist/compiled/react-dom/cjs/react-dom-server.node.production.js:285-291`; client at `react-dom-client.production.js:1546`).
- Its regex matches only `javascript:`, so `data:`, `vbscript:`, `blob:` and `file:` pass through React unchanged. Rendering does not neutralise `data:`; `links.ts` does.

**The probe.** In this research, `verifyShopUrl` was run on the hrefs `postHrefs` extracted from an adversarial HTML fragment, with post host `www.pepper.pl`:

| Candidate | Kept? | Why |
|---|---|---|
| `https://shop.pl/a?x=1&y=2` (from `&amp;` in the href) | kept | in the post, https, off-site |
| `javascript:alert(1)` (single-quoted href) | null | scheme |
| `data:text/html,hi` (bare href) | null | scheme |
| `JAVASCRIPT:alert(2)` (upper case, padded) | null | scheme, after `URL` lowercases it |
| `javascript:alert(3)` (from `&#106;avascript:`) | null | scheme, after entity decoding |
| `java\tscript:alert(4)` (from `java&#x09;script:`) | null | scheme, as `URL` strips the tab |
| `mailto:a@b.pl` | null | scheme |
| `//shop.pl/rel`, `/relative` | null | `new URL` fails without a base |
| `https://www.pepper.pl/promocje/x` | null | the aggregator's own site |
| `https://shop.pl/not-in-post` | null | not among the post's hrefs |
| `https://shop.pl/a?x=1&amp;y=2` (model kept the entity) | null | no exact match; falls back to the post |
| `https://SHOP.pl/a?x=1&y=2` (model changed the case) | null | no exact match |
| any candidate with post host unknown | null | `deals.mts:138` |
| `https://lowcygier.pl/x` in a pepper post | **kept** | another aggregator is "off-site" |
| `https://pepper.pl.evil.example/x` | **kept** | a lookalike host is not a subdomain of the post's |
| `https://user@shop.pl` | **kept** | userinfo is allowed |

At render, `dealLinks` was run on stored values in the same probe. A stored `shop_url` of `javascript:alert(1)`, ` JAVASCRIPT:alert(1)` or `data:text/html,hi` fell back to the post as the only link. A post `link` of `javascript:alert(1)` gave no link at all. `https://shop.pl/a b` was kept as `https://shop.pl/a%20b`.

**What deterministic code cannot decide.**
- `verifyShopUrl` checks that the URL belongs to the post, not that it belongs to the item.
- A pepper digest with two shops (#43 Final Fantasy X/X-2 at a second shop on Allegro, `evaluation.md:129`) lets the model attach shop B's link to shop A's offer, and the check passes.
- PRD Guardrails say the link "nigdy [nie prowadzi] do innej oferty" (`prd.md:42`). That half of Risk #5 is model-side, and the eval does not label links.

### Existing tests and the scratch cases

- **Under `tests/`:** 2 unit files (`tests/unit/watchlist/fold.test.ts`, `phrase-on-list.test.ts`) and 4 db files (`harness`, `matching`, `fold-parity`, `rule-change`). None calls `verifyShopUrl`, `toDealRows`, `expiryInstant`, `isListable`, `dealLinks` or `formatExpiry`, or reads `set_with`.
- **Adjacent coverage:** `matching.sql` checks that a digital and an unpriced deal never show in `matched_deals` (`supabase/checks/matching.sql:480-481,503`). It has no expiry case.
- **Scratch cases** (inputs only, not oracles):
  - `physical-deals-from-real-posts/plan.md:853-860`: `expiryInstant`, 5 rows;
  - `plan.md:862-867`: `isListable`, and `verifyShopUrl` with in-post https kept; not-in-post, `javascript:` and aggregator host null; `&amp;` matched after decoding;
  - `impl-review.md:36`: the 66-case scratch script, not in the repository.
  - No `data:` case exists anywhere.

### The cheapest useful layer, per item

| Item | Layer | Importable today? | Expected values from |
|---|---|---|---|
| `verifyShopUrl` over adversarial hrefs, through `postHrefs` from HTML strings | unit | yes, proven in this research | PRD Business Logic (`prd.md:104`: shop link, else the aggregator post) and Guardrails (`:42`); `plan.md:864-867` |
| `toDealRows`: shop URL, set_with, price cleaning, expiry, all from a hand-written `ExtractionOutput` (a fixed model output, not a recorded reply) | unit | yes | prompt rules (`prompt.mts:36,65,67`), table comments, PRD |
| `isListable` (the four-way predicate) | unit | yes | PRD (`prd.md:57`), `plan.md:862` |
| `expiryInstant` across the 2026-10-25 and 2026-03-29 changes | unit | yes | PRD AC3 (`prd.md:56`), `plan.md:853-860`, the Europe/Warsaw rule |
| `dealLinks` (render barrier, `data:` included) | unit | yes (`@/lib/deals/links`) | `links.ts` contract comment; PRD Guardrails |
| `formatExpiry` around the switch | unit | yes (`format.ts` has no `server-only`) | its docstring examples (`format.ts:89-93`) |
| The read-side hide (`expires_at > now`, null stays) | **no cheap layer as written** | no: `server-only`, unexported, PostgREST string | — see Open Questions |
| The set note on the card | rendering a Server Component in Vitest is unproven here; §7 excludes look, not behaviour | unverified | `review.md` #58 |
| `MODELS ⊆ CANDIDATES` | unit | yes (`config.mts` has no imports) | `config.mts:14-18` |
| Model-side physical/digital, price, missed deals | the eval (AI-native, human-run) | n/a | labels |

How to import: `vitest.config.mts` aliases only `@` → `src`. Tests reach `scripts/` by a relative path with the explicit `.mts` extension, as in `../../../scripts/extract/deals.mts`; a scratch config ran exactly such an import. Of the modules involved:
- `deals.mts`, `prompt.mts`, `pipeline.mts`, `schema.mts` and `store.mts` have no top-level side effects or Node/Supabase value imports;
- `extract.mts` calls `main()` at load and must not be imported.

The anti-patterns the test plan names apply as follows:
- **"Mocking the model and calling it an extraction test":** a `toDealRows` test with a fixed output tests the row mapping, and should be named that way.
- **"Asserting the model's current replies":** fixtures must not be copied from `report-v3.md`. That report is gitignored, and its #42 reply contradicts its own label (`evaluation.md:106`).

### Making the eval a required gate

Facts that constrain the design:
1. **It is not a gate today.** A leak exits 0 (`eval.mts:529-535`). Lesson "A gate that exits 0 on warnings is not a gate" (`context/foundation/lessons.md`) applies verbatim.
2. **No committed baseline exists to compare against.** Everything in `scripts/extract/eval/` except `labels.json` is gitignored, and the per-post outcomes of v3 live only in the local `report-v3.md`.
3. **Nothing ties a passing run to the prompt it ran on.** `PROMPT_VERSION` is a manual bump ("Bump it on any change to the instructions or to schema.mts", `prompt.mts:16-18`), and reports record no hash or commit.
4. **The eval runs `CANDIDATES`, production runs `MODELS`,** and nothing links the two (above).
5. **A CI-only check cannot stop a merged prompt from going live.**
   - `collect.yml` runs on its schedule (`cron: "7 */4 * * *"`, `.github/workflows/collect.yml:10-16`) from the default branch and does not wait for `ci.yml`.
   - `ci.yml` blocks only the Vercel deploy (`ci.yml`, `deploy: needs: verify`).
   - A prompt pushed to `main` is used by the next extract run, within about 4 h, whatever `verify` says.
6. **The collect job installs with `--omit=dev`** (`collect.yml:57`). Any check that runs there may use only dependencies and Node built-ins.

Options, settled versus genuine choice:
- **(A) Needed in every variant:** the eval exits non-zero on a threshold breach. Thresholds with sources:
  - digital leaks in a `MODELS` model = 0 (PRD Guardrails `prd.md:40,57`; `rankModels` eligibility);
  - no post newly missed against the baseline (v3: 1 of 23, #49 — `evaluation.md:100,126`);
  - no new wrong game or wrong price against the baseline (v3 Mistral: 0 and 0).
  - The ≤5% share stays with the sample review.
- **(B) A committed eval record checked by `npm test`.**
  - The eval writes counts and per-post outcomes, but no post text, together with a fingerprint: a sha256 over `INSTRUCTIONS`, `toResponseFormat()`, `MODELS`, `TEMPERATURE`, `PROMPT_VERSION` and `labels.json`.
  - A unit test recomputes the fingerprint from the imported modules and fails when it differs from the record or when the record's verdict is not a pass.
  - This makes CI's `verify` refuse a prompt or model change that lacks a matching passing run, without CI running the eval.
  - It needs a new `!` exception in `.gitignore`.
  - It is a speed bump, not proof: the record can be hand-edited.
- **(C) The same fingerprint check at extractor start.** The collect job would refuse to extract with an unrecorded prompt or model and fail the run loudly. This is the only option that stops a merged prompt from going live, but it couples production to the record: a mismatch stalls extraction, which is Risk #3's surface. `EXTRACT_PAUSED` already exists as the operational escape. This is a genuine product choice for `/10x-plan`.
- **(D) A unit test asserting `MODELS ⊆ CANDIDATES`:** cheap, deterministic, independent of the rest.
- **(E) Process only (today's state):** the CLAUDE.md rule "A model enters it only after passing `npm run extract:eval`" plus a checklist. It enforces nothing.

Recommendation for `/10x-plan`: take A + B + D as the minimum. Put C to Tomasz as an explicit decision. Repeat the eval k ≥ 2 times on a prompt or model change; at about $0.015 per Mistral-only run, the cost is time, not money. Separately, make `posts.json` reproducible by exporting it by the 55 label ids rather than `random()`.

### Post-edit hook

Sources: Claude Code hooks reference (`https://code.claude.com/docs/en/hooks`, sections PostToolUse, Matchers, command hook fields), consulted 2026-10-13. The reference page was read partly through excerpts; items marked *unverified* need a smoke test.

- **Event:** `PostToolUse`, which runs after a tool completes successfully. A failed call fires `PostToolUseFailure` instead.
- **Matcher:** `"Edit|Write"`. A value of letters, digits, `_`, `-`, spaces, `,` and `|` is an exact name list; any other character makes it an unanchored regex. In this session the file-editing tools are `Edit`, `Write` and `NotebookEdit`; `MultiEdit` is not offered (*unverified* beyond this session).
- **Coverage gap:** an `Edit|Write` hook does not fire when a Bash command or an outside process rewrites the file. A human's edits are outside it too.
- **Input:** JSON on stdin, carrying `tool_input.file_path` (absolute, native separators: backslashes on Windows), `cwd` and `tool_response`. The matcher has no path filter, so the command must parse stdin and decide by path itself, exiting 0 at once for paths outside its areas.
- **Feedback to Claude:**
  - exit 2 shows stderr to Claude but does not block, because the edit already happened;
  - other non-zero codes show a "hook error" notice;
  - JSON `decision: "block"` with `reason` attaches the reason to the tool result;
  - plain stdout on exit 0 is not shown.
  - `timeout` is in seconds; the default for command hooks is 600.
  - `"async": true` runs in the background, and `"asyncRewake": true` wakes Claude on exit 2.
- **Paths and shell:**
  - use `${CLAUDE_PROJECT_DIR}`, double-quoted in shell form;
  - the default shell is bash, which is Git Bash on this machine, and PowerShell only when Git Bash is absent;
  - the exec form needs a real `.exe`, so use `node "<script>.mjs"`, never an `npm.cmd` shim in exec form.
- **Where it lives:** hooks from user, project (`.claude/settings.json`, committed) and local settings are merged. `.claude/settings.json` holds no hooks today, and `.claude/hooks/` does not exist. `ci.yml` ignores `.claude/**`, so a hook change triggers no CI. Whether settings-file hooks fire under `claude -p` or the Agent SDK is *unverified*.
- **Measured suite times** (this machine, Node 24.21.0, one run each, 2026-10-13, through `npm test` as CLAUDE.md requires):

| Command | Files / tests | Vitest duration | Wall time |
|---|---|---|---|
| `npm test -- --project unit` | 2 / 48 | 1.32 s | 4.3 s |
| `npm test -- --project db` | 4 / 23 | 14.31 s | 16.4 s |
| `npm test -- --project db tests/db/matching.test.ts` | 1 / 1 | 5.02 s | 7.7 s |

- **A path map that fits "the fast suites for the matching rule and the listing rules":**
  - `scripts/extract/**`, `src/lib/deals/**` and `tests/unit/**` → the unit project (≈4 s);
  - `supabase/migrations/**`, `supabase/checks/**`, `tests/db/**` and `src/lib/watchlist/**` → the db project (≈16 s), with `src/lib/watchlist/**` also running the unit project;
  - an edit to `prompt.mts`, `schema.mts` or `config.mts` also gets a reminder that the eval gate applies. The hook never runs the eval and never reads `.env.local`.
  - Whether the 16 s db run should be synchronous or `asyncRewake` is a plan choice. Every edit in a burst re-runs it.
- `scripts/test.mts` already normalises the drive-letter case. The hook's `cwd` may arrive as `c:\…` or `C:\…`; both spellings appeared in this session.

### Hot-spot evidence check

| Hot spot (test plan) | What the 14-day commits touched | Bearing |
|---|---|---|
| `scripts/extract/` — 6 commits/14d | `0a43bb1` created everything; `4ccc5ed` prompt v3, schema, `deals.mts` (set_with), review; the other four were cron, pause/cut-off, long-reply timeouts and review fixes (pipeline, store, config, eval) | For #2, 2 of 6 touched the prompt or schema. For #5, `verifyShopUrl` and `postHrefs` were changed only in `0a43bb1` (`git log -L`) |
| `src/lib/deals/` — 5 commits/14d | `queries.ts` in 3 (67aa4b3, 4a1b32e, ce9438b), `page.ts` in 2, `links.ts`/`format.ts`/`freshness.ts` created in 67aa4b3, `types.ts` in 0a43bb1 | The expiry filter line has changed once (67aa4b3); `links.ts` never since creation |

No commit has touched `scripts/extract/` since 2026-10-06. Risk #5's likelihood rests on untrusted post content: pepper posts are written by users, the model copies the links, and the rule was tested only in a scratch script. It does not rest on churn. Risk #2's likelihood rests on the prompt history (v1→v3, with a regression at v3) and on interview Q3.

## Code References

- `scripts/extract/deals.mts:88-99` — `toPrice` cleaning
- `scripts/extract/deals.mts:118-150` — `isSameSite`, `verifyShopUrl`
- `scripts/extract/deals.mts:186-245` — `warsawToUtc`, `expiryInstant`
- `scripts/extract/deals.mts:253-294` — `toDealRows` (`set_with` at 283, shop URL at 288)
- `scripts/extract/deals.mts:300-308` — `isListable`
- `scripts/extract/prompt.mts:19` — `PROMPT_VERSION = 3`
- `scripts/extract/prompt.mts:36,53,65,67,71,73,77` — the set, edition, price, expiry and link instructions
- `scripts/extract/prompt.mts:165,193-233` — `HREF`, `postText`, `postHrefs`
- `scripts/extract/pipeline.mts:424-449` — `toExtractionRecord` (pure, calls `toDealRows`)
- `scripts/extract/config.mts:8-22,28` — `CANDIDATES`, `MODELS`, `TEMPERATURE`
- `scripts/extract/evaluation.mts:51-73` — strict label schema (no `setWith`, no `shopUrl`)
- `scripts/extract/evaluation.mts:334` — expiry scored on the raw string
- `scripts/extract/evaluation.mts:541-549` — `measureCall` through `toDealRows`
- `scripts/extract/evaluation.mts:694-722` — `rankModels` (eligibility printed, no exit code)
- `scripts/extract/eval.mts:449-450,529-535` — runs `CANDIDATES`; exit 1 only on abort
- `src/lib/deals/queries.ts:21,148-178,181-201` — `server-only`, the listed-deals query with the expiry filter at 165, both page readers
- `src/lib/deals/links.ts:25-55` — `webUrl`, `dealLinks`
- `src/lib/deals/format.ts:95-104` — `formatExpiry`
- `src/components/deals/deal-card.tsx:49,72,108-112` — the outbound `<a>`, `dealLinks`, the set note
- `supabase/migrations/20260930061813_create_deals.sql:7,20,21,50,76-80` — `link`, `expires_at`, `shop_url`, select policy, comments
- `supabase/migrations/20261006065758_add_set_with_to_deals.sql:6,13-14` — `set_with` and its pre-v3 caveat
- `supabase/migrations/20261012070050_match_deals_to_watchlist.sql:180` — view predicate without expiry
- `scripts/collector/posts.mts:20,114-119,141` — content pick and cut, the raw post link
- `.github/workflows/collect.yml:10-16,57` — schedule from the default branch, `--omit=dev`
- `node_modules/next/dist/build/create-compiler-aliases.js:293` — `react-dom` aliased to the vendored copy
- `node_modules/next/dist/compiled/react-dom/cjs/react-dom-server.node.production.js:285-291` — `sanitizeURL`, `javascript:` only

## Architecture Insights

- The extraction modules already follow lessons.md ("Separate logic from I/O"): `deals.mts`, `prompt.mts` and `pipeline.mts` are pure and importable, and the eval and the pipeline share `toDealRows`. The test seam exists. Only the read side (`queries.ts`) keeps a domain decision, expiry, inside an I/O call.
- The listability predicate is stated four times: `isListable`, the RLS policy, the view and the query. The expiry predicate is stated once, in the query. These are opposite risks: the first is drift between copies, the second a reader that bypasses the one copy.
- The link check runs at both ends: at write time (membership, scheme, off-site) and at render (scheme only). The render check is the one that covers rows written by any other path, including the unchecked post link.

## Historical Context (from prior changes)

- `context/changes/physical-deals-from-real-posts/evaluation.md:95-108`: prompt v3 regression (discount on #3), gpt-4.1-nano's leaks, #42 set vs its pre-rule label. **Supported** by the reports' totals.
- `evaluation.md:134`: "Expiry … not tested; the zero in that column measures nothing." **Supported**: 0 of 55 labels carry `expiresOn`.
- `context/changes/physical-deals-from-real-posts/review.md:30-34,70`: 2.9% wrong on 100 random links (prompt v2), 5% threshold. **Supported**. It is the instrument for the share, not the eval.
- `physical-deals-from-real-posts/reviews/impl-review.md:36`: "All 66 pass, the DST rows of `expiryInstant` included." **Partial**: the DST rows reproduce in this research's probe. The 66-case script is not in the repository, so its inputs cannot be checked.
- Test plan §4 "LLM regression … 55 labelled posts": the count is **supported**. Omitted there: the post texts are not only uncommitted but also not reproducible from the recorded query.

## Related Research

- `context/changes/testing-matching-rule-protection/research.md` — Phase 1. The runner, PGlite harness and `npm test` wrapper that this phase reuses; its table already flagged expiry as Risk #2's.
- `context/changes/physical-deals-from-real-posts/research.md` — the extraction slice's own research (link-rule measurements per aggregator, cited by `evaluation.md:130`).

## Open Questions

1. **The read-side hide has no cheap test as written.** Options for `/10x-plan`:
   - (a) add the expiry term to the view and the select policy, which is additive and DB-tested in PGlite with rows relative to `now()`, keeping the query's filter as a second copy;
   - (b) extract the predicate into a pure function the page applies after the query, which changes what the query returns;
   - (c) accept the gap and leave the read side to the Phase 5 e2e test.
   - Asserting the `.or()` string through a fake client would be an implementation mirror.
2. **Should an unreadable model expiry still fail open?** An unreadable date is treated as undated, and an hour like `7:00` as end of day. A stricter rule would accept `H:MM` and leave the deal listed but flagged. This is a product choice about the PRD's "Okazje bez podanej daty pozostają na liście" (`prd.md:56`).
3. **Is "off-site" enough, or is a shop meant literally?** Today another aggregator's link counts as a shop link. An aggregator list (pepper, lowcygier, cenograj — `prompt.mts:77` already names them) would close that. This is a product choice.
4. **Should the labelled set grow** so that the eval can see expiry, a physical set and link choice? That needs new posts exported, label schema fields (`setWith`, `shopUrl`) and Tomasz's labelling. It is not cheap, and it is the only way those model decisions get measured.
5. **Does `public.collected_posts` still hold the 55 labelled rows?** If it does, `posts.json` can be re-exported by id. Not checked; the agent has no SQL path.
6. **Option C for the eval gate:** stop the extractor on an unrecorded prompt or model. This is Tomasz's decision.
7. **Should the db-project hook run synchronously or in the background (`asyncRewake`)?** It takes about 16 s per edit.

## Corrections to context/foundation/test-plan.md section 2

1. **#2, "wrong entries at or below 5%" on the labelled set:** the eval computes no such share. The set has 23 listable items, so one wrong entry is 4.3%. Its own record calls it a trap check, not an error-share estimate (`evaluation.md:134-135`). Reword the proof to: on the labelled set, zero leaks, no post newly missed, and no new wrong game or price against a committed baseline. The ≤5% share is proven by the sample review on random production links (`review.md:70`), after the change runs.
2. **#2, "the labels still match the rules": confirmed, and wider than sets.** Labels carry no `setWith`, no `shopUrl` and no expiry (0 of 55), and contain no physical set. The eval therefore cannot protect set recognition, expiry reading or link choice. Add to the guidance: those model decisions are unmeasured until the labelled set grows.
3. **#2, "the deterministic listing rules hide a deal after its stated expiry":** the hide is one PostgREST filter in a server-only query. The RLS policy and `/my-deals`' view carry no expiry term. A unit test on the listing rules covers the stated-expiry instant, not the hide. Add the hide's layer as an open choice (DB term vs pure post-filter vs e2e).
4. **#2, "keep undated deals":** an expiry the model writes in any other format is stored as undated, so it is listed indefinitely. "A deal stays listed past its stated expiry" therefore has a deterministic fail-open path besides the model's reading. Name it in the risk or the guidance.
5. **#2, "never list a set's price as one game's":** the code lists every set row at the whole set's price and labels it on the card. The deterministic guarantee is "a non-empty `set_with` is labelled", and it breaks when `setWith` names only the item itself. Whether a set is recognised at all is the model's decision, and it is unmeasured (correction 2).
6. **#2, the eval as a gate:** today it exits 0 on leaks, measures `CANDIDATES` rather than `MODELS`, and records no fingerprint. Because the extractor runs from `main` on its schedule without waiting for CI, a CI-only check cannot keep a merged prompt from going live. Add to "must challenge": "the eval gates the change" — it reports and does not stop.
7. **#5, "a different offer":** deterministic code checks only that a URL is one of the post's own. Which of a post's links goes with which item is the model's choice, and the eval does not label links. Narrow the proof to what code can guarantee, or mark that half model-side and unmeasured.
8. **#5, "the post's own http(s) shop links":** the code has no notion of a shop. Any off-site http(s) href of the post is kept, including another aggregator's link, a lookalike host and a userinfo URL. Reword to "off-site http(s) links", or record a shop/aggregator rule as a product choice.
9. **#5, "whether rendering neutralises unsafe schemes": resolved.** React (Next's vendored copy) blocks `javascript:` and passes `data:`, so `links.ts` is the only render-time barrier for `data:`. The post's own link is stored unchecked from the feed and checked only at render. Replace the open note with this fact.
10. **Source column, hot-spot evidence:** for #5, the 6 commits/14d and 5 commits/14d did not touch the link code, which has been changed only in the commits that created it. #5's likelihood rests on untrusted post content and on scratch-only testing. For #2, 2 of the 6 `scripts/extract/` commits touched the prompt or schema. Cite them as such rather than as raw directory churn.

Outside §2, for a later refresh:
- §4's eval row should add that `posts.json` is not reproducible from its recorded query.
- §5's eval gate row should name the exit-code and fingerprint work this phase needs before "required" is true.
