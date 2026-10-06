# Extraction review: the first real results

The review record for `physical-deals-from-real-posts` (roadmap `S-01`), Phase 3, change 5. It judges the first real extraction run on a random sample and answers PRD open questions 2 and 3.

> The classification below is the agent's reading of the report. Tomasz accepted it on 2026-10-06, with one correction (#18).

## Sample

- **Report:** `npm run extract:report -- --sample 100`, run by Tomasz on 2026-10-06. The file `scripts/extract/review/sample-2026-10-06T061853Z.md` stays local and gitignored, because it quotes the posts.
- **Drawn from:** 100 of 1,891 extracted links, picked at random in the script.
- **Model and prompt:** `mistralai/mistral-small-3.2-24b-instruct`, prompt version 2, as `evaluation.md` chose.
- **What the extracted links cover:** the backlog was drained with manual runs between 2026-10-05 and 2026-10-06, newest first. The last ~400 pending rows, all first seen more than three weeks earlier, were skipped rather than extracted (`change.md`, 2026-10-06). The sample therefore covers posts first seen from mid-September onwards.

## Counts, as the report prints them

| Aggregator | Links | No items | Items | Listed | Hidden: not a game | Hidden: digital | Hidden: unclear | Hidden: no price |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cenograj | 47 | 0 | 47 | 47 | 0 | 0 | 0 | 0 |
| lowcygier | 15 | 1 | 34 | 12 | 6 | 16 | 0 | 0 |
| pepper | 38 | 1 | 63 | 9 | 7 | 42 | 2 | 3 |
| total | 100 | 2 | 144 | 68 | 13 | 58 | 2 | 3 |

## Wrong entries among the 68 listed deals

| Kind of error | Count | Cases |
| --- | --- | --- |
| Digital | 0 | — |
| Not a game | 0 | #18 cenograj, "Colors Live + Pióro (Aplikacja do Rysowania)", a boxed drawing application with a stylus, counts as a game: Tomasz, 2026-10-06, because it has a physical Nintendo Switch release. |
| Wrong game | 0 | — |
| Wrong price | 2 | #58 lowcygier, "Splatoon Raiders" and "Star Fox" at 354.78 zł each. The post states 354.78 zł for the two together in a "taniej o VAT" set. |

- **Share of wrong listed entries:** 2 of 68 (2.9%).
- **By aggregator:** cenograj 0 of 47, lowcygier 2 of 12, pepper 0 of 9.
- **How #58 should behave** (Tomasz, 2026-10-06): a set offer belongs in the results for each game in it, Star Fox and Splatoon Raiders alike, but its card must say at once that the price is for the set of both. The extraction has no notion of a set today: the model splits it into one item per game at the set's price, and nothing marks them as one offer.

## Physical deals wrongly rejected

| Aggregator | Count | Cases |
| --- | --- | --- |
| cenograj | 0 | — |
| lowcygier | 0 | — |
| pepper | 1 | #77, Switch Sports Resort for Switch 2 at MediaMarkt, 189.99 zł: a preorder at a boxed-game retailer, returned `unclear`. |

The 58 digital and 13 non-game rejections read as correct: Steam, GOG, Epic, eShop and Xbox Store offers, key shops, consoles, accessories, a phone, board games, and a collector's box sold without the game.

## Field problems that do not make an entry wrong

- **Noisy titles on pepper and lowcygier.** The card shows `title`, and several keep the post's platform and wrapping: "Gra PS5 Indiana Jones i Wielki Krąg - Okładka PL", "Gra Final Fantasy X X-2 HD Remaster na PS4 Płyta Blu-ray", "Avatar Frontiers of Pandora From The Ashes Edition na PS5", "[…] | Pudełkowa". cenograj's template gives clean titles.
- **`english_title` naming another game.** "Red Dead Redemption" became "Red Dead Redemption 2" (#32), "Battlefield 6 Phantom Edition" became "Battlefield 2042 Phantom Edition" (#66), and "Splatoon Raiders" became "Splatoon 3: Splatoon Raiders" (#58). This repeats `evaluation.md`'s Pokopia finding.
- **Junk `alternative_titles`.** The post's joke ("Indiana Jones iii... Wielkiii Krąąąg!", #75) and the post's whole headline (#51) were kept as alternative titles.
- **A discount never stated.** #59 carries -23% for a "taniej o VAT" set; the post states no percentage.
- **Title price over body price.** #51, #53 and #61 took the headline's price where the body names a slightly different one, which is within the noise of a post edited after publication.

## One offer on two aggregators

A random sample of 100 links rarely draws both copies of an offer, so this rests on a query over all listed deals, run by Tomasz on 2026-10-06. It groups the listed deals by lower-cased `english_title` and platform, and counts the groups that come from more than one aggregator:

- **48 of 868** listed games (5.5%) appear on more than one aggregator.

The figure is approximate in both directions: `english_title` sometimes names another game, which splits a group or merges two.

## Answers to the PRD's open questions

- **Question 2, the pipeline's scope in v1: normalise all three aggregators** (Tomasz, 2026-10-06). The evidence:
  - cenograj supplies 47 of the 68 listed deals, all clean;
  - lowcygier yields 12 listed of 34 items, with the only price errors;
  - pepper yields 9 listed of 63 items, mostly digital, with the noisiest titles, but no wrong listed entry.

  Duplicates across aggregators (5.5% of listed games) stay separate cards. No later roadmap slice merges them.
- **Question 3, the threshold for wrong listed entries: up to 5%** (Tomasz, 2026-10-06). The sample measures 2.9%, within it, so Phase 4 may start.
- **Set offers.** Tomasz asked for the smallest version of the set rule inside S-01. It is recorded as Phase 3, change 7 of the plan, and covers new extractions only.

## Handoff to S-04 (`deals-matched-to-watchlist`)

- **Titles, not ids.** Deals carry titles, not catalogue ids. Matching has to tolerate edition words and platform noise in `title`, and must not trust `english_title` alone.
- **`alternative_titles` needs filtering** before it is matched on, because it sometimes holds a headline or a joke.
- **Set offers** (Tomasz, 2026-10-06). An offer for several games together belongs in the results for each of them, and its card says the price is for the set. From prompt version 3, `deals.set_with` names the other games of a set (plan, Phase 3, change 7). Each game of a set is its own row, so matching per game needs nothing more. Deals extracted earlier carry an empty `set_with`.
- **Missing platforms.** Every listed deal in the sample has a platform. Deals without one are rare, and they show up among the hidden items only.
