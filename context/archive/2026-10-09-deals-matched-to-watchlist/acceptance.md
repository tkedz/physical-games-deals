# Acceptance: deals matched to the watchlist, on production

Measured on 2026-10-12, for PRD open question 5 and Phase 4 of `plan.md`.

## Threshold and result

The threshold:

- at least 80% of the watched games' deals on `/` reach `/my-deals`;
- at most 5% of the deals on `/my-deals` are another game.

The result passes both, so no tuning round was needed:

| Measure | Value | Threshold |
| --- | --- | --- |
| Recall: expected deals that reach `/my-deals` | **39 / 43 = 90.7%** | ≥ 80% |
| Wrong share: deals on `/my-deals` of another game | **0 / 39 = 0%** | ≤ 5% |

## Setup

- **Deployment.** `physical-games-deals-ipkndymyu-tkedz.vercel.app` (`dpl_FWg4o4NGfrAc2qesUkeNe3y4q8Nj`), Ready at 2026-10-12 11:35 CEST. It was built from `main` at `ce9438b`.
- **Account.** A temporary account, `pomiar-s04@przyklad22.pl`, created through `/signup` on production.
- **Games.** The account watches the first 20 distinct games on `/`, newest first, that the catalogue search finds.
  - Each game was added through `/watchlist` with no platform pin, by choosing the catalogue result that is the same game.
  - The catalogue found all 20, so none was skipped.
- **Snapshot.** Both lists were read between 09:41:55 and 09:42:12 UTC.
  - `/my-deals` was read twice, before and after `/`, and gave the same 39 deals both times.
  - `/` held 1,524 listed deals on 51 pages.
  - The freshness line read „12 października 2026 07:47” throughout, so no pipeline run landed in between.
- **The expected set.** Every deal on `/` whose card title is one of the 20 games.
  - Editions and bundles count as the game.
  - Sequels, remakes, remasters and other games of a series do not.
  - Candidates were found by a loose search of every title on `/` for each game's distinctive words, then judged one by one.

## Per game

| # | Catalogue name (RAWG, year) | Deals on `/` | On `/my-deals` |
| --- | --- | --- | --- |
| 1 | Dragon’s Dogma 2 (2024) | 4 | 1 |
| 2 | Little Nightmares (2017) | 2 | 2 |
| 3 | The Last Faith (2023) | 1 | 1 |
| 4 | Fortnite Battle Royale (2017) | 1 | 0 |
| 5 | Mighty Morphin Power Rangers: Rita's Rewind (2024) | 2 | 2 |
| 6 | Assassin’s Creed The Ezio Collection (2016) | 1 | 1 |
| 7 | PGA TOUR 2K25 (2025) | 3 | 3 |
| 8 | Daemon X Machina: Titanic Scion (2025) | 1 | 1 |
| 9 | Astro Bot (2024) | 5 | 5 |
| 10 | Yoshi and the Mysterious Book (2026) | 4 | 4 |
| 11 | Borderlands Legendary Collection (2020) | 1 | 1 |
| 12 | Saints Row (2022) | 2 | 2 |
| 13 | Orbitals (2026) | 1 | 1 |
| 14 | HELLDIVERS 2 (2024) | 1 | 1 |
| 15 | Worms Armageddon (1999) | 3 | 3 |
| 16 | Final Fantasy VII Rebirth (2024) | 1 | 1 |
| 17 | The Blood Of Dawnwalker (2026) | 7 | 7 |
| 18 | Atari Mania (2022) | 1 | 1 |
| 19 | Pokkén Tournament DX (2017) | 1 | 1 |
| 20 | Kamiwaza: Way of the Thief (2022) | 1 | 1 |
| | **Total** | **43** | **39** |

The view kept these titles apart from the watched game, rightly:

- Little Nightmares II and Little Nightmares III Mirror Edition (6 deals);
- Daemon X Machina (2019);
- Borderlands 3 and Borderlands 4 (4 deals);
- Final Fantasy VII Remake Intergrade, Crisis Core Final Fantasy VII Reunion and FINAL FANTASY VII (5 deals);
- Atari 50 (2 deals);
- Dragon's Dogma: Dark Arisen, the first game (2 deals).

## Misses

| Deal | Platform | Titles | Cause |
| --- | --- | --- | --- |
| 2301 | PS5 | „Dragon’s Dogma 2 Dark Arisen”, `english_title` „Dragon's Dogma 2 Dark Arisen”, no alternative titles | "Dark Arisen" names an edition the qualifier list does not know, so both titles key to `dragons dogma 2 dark arisen`. |
| 2302 | Xbox Series X\|S | As 2301 | As 2301. |
| 2303 | Switch 2 | As 2301 | As 2301. |
| 2829 | Switch | „Fortnite Darkfire & Ice Bundle”, the same `english_title`, no alternative titles | A content bundle named after its items. Neither "bundle" nor the pack's name is a qualifier, and the catalogue names the game "Fortnite Battle Royale", which no deal title contains. Both titles key to `fortnite darkfire and ice bundle`. |

Deal 2833, „Dragon's Dogma II 2 Dark Arisen I PS5 I PlayStation 5 I PL”, did reach the view.
- It matched through its alternative title „Dragon's Dogma 2”, which keys to `dragons dogma 2`.
- Its card title keys to `dragons dogma ii 2 dark arisen i ps5 i playstation 5 i`.
- Its `english_title`, „Dragon's Dogma II”, keys to `dragons dogma ii`, which the rule keeps apart: it has no numeral equivalence.

The titles in this section were read from `public.deals` on 2026-10-12, during the implementation review (F4).

## Wrong matches

None. Each of the 39 deals on `/my-deals` is one of the 20 games.

## Judgement calls

These calls decide the expected set. The result holds under each alternative.

- **Dragon’s Dogma 2 Dark Arisen counts as Dragon's Dogma 2.** The titles say "2", and the platforms are PS5, Xbox Series and Switch 2, where the second game is sold, not the first. If they are the first game's Dark Arisen instead, so is deal 2833, which carries the same name and reached the view: recall is 38 / 39 = 97.4%, and the wrong share 1 / 39 = 2.6%.
- **The Fortnite bundle counts as Fortnite.** Without it, recall is 39 / 42 = 92.9%. With both of these exclusions, recall is 38 / 38 = 100%, and the wrong share stays 1 / 39 = 2.6%.
- **Two catalogue choices were corrected.** For „Saints Row” and „Fortnite”, the first result with the exact name was the 2006 game and a 2021 Android entry. They were replaced by „Saints Row (2022)” and „Fortnite Battle Royale” (2017), the games the deals are of. The replaced entries stay on the account as removed rows.
  - Saints Row's key is `saints row` either way.
  - Neither Fortnite key matches the bundle.

The implementation review corrected the alternatives' figures (F4): the first version moved 2301–2303 but not 2833.

## Notes for a later tuning round

Neither change was needed for the threshold, and neither was applied.

- **"Dark Arisen" as a trailing qualifier.** It would key all three missed deals to `dragons dogma 2`. It would also key the first game's „Dragon's Dogma: Dark Arisen” to `dragons dogma`, its own game.
- **Bundles named after their contents.** They cannot be reached by a qualifier list. A phrase on the watchlist covers them: „Fortnite”, for example.

The catalogue timed out on 2 of 24 searches while the games were added, both for The Blood of Dawnwalker. The third search answered.
