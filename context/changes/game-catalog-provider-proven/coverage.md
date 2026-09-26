# Catalogue coverage: RAWG

The coverage record for `game-catalog-provider-proven` (roadmap `F-03`). It answers PRD open question 7 and roadmap question 7: does this catalogue know the games this product is for?

## Run

- **Date:** 2026-09-26, run by Tomasz with `npm run catalog:probe`.
- **Provider:** RAWG, `GET /api/games` with `search`, `limit: 10`.
- **Modes:** every query twice, first with all results (`all`), then with `exclude_additions=true` (`exclude additions`).
- **Pacing:** one request at a time. 23 entries, 50 search requests, plus 1 failure-path call.
- **Secrets:** checked before pasting. The output contains neither the key nor a request URL.

### Probe set

- **12 `own`:** the two Silent Hill 2 seeds (2024 remake and 2001 original) and 10 titles from Tomasz's own list. Silent Hill 2 (2024) is on his list and is covered by the seed. Hades is pinned to 2020, so Hades II does not count as a hit. "Metal Gear Solid Snake Eater" means Metal Gear Solid Delta (2025), per Tomasz.
- **0 `polish-only`:** Tomasz knows of no Polish-only releases and judged the category unimportant (his decision, 2026-09-26). The plan asked for 1–2. The category comes from the cost the PRD already accepts (`prd.md:98`).
- **11 `post`:** deal titles Tomasz copied from `public.collected_posts`, queried exactly as the posts wrote them. One post named two Witcher games, so it became two entries.

## Predicate

> The verdict predicate, fixed before the run (Tomasz, 2026-09-26): a title is **found** when the intended catalogue entry is among the first 5 results for its Polish or its English name. RAWG **passes** when every title from Tomasz's list that has an international release is found. Misses among Polish-only releases are recorded and do not fail it — the PRD already accepts that cost (`prd.md:98`). Titles taken from collected posts are informational and never fail it.

## Results

### As printed

Probe: 23 entries, 50 requests, limit 10, one at a time.

| Entry | Query | Mode | Rank | Found | First results | Latency |
| --- | --- | --- | --- | --- | --- | --- |
| Silent Hill 2 (2024 remake) | Silent Hill 2 | all | 1 | yes | Silent Hill 2 (2024) [pc, playstation5, xbox-series-x]; Silent Hill 2 (2001) (2001) [pc, xbox-old, playstation2]; Silent Hill (1999) [playstation1]; Silent Hill: Origins (2007) [playstation2, psp]; Silent Hill Homecoming (2008) [pc, xbox360, playstation3] | 389 ms |
| Silent Hill 2 (2024 remake) | Silent Hill 2 | exclude additions | — | no | Silent Hill 2 (2001) (2001) [pc, xbox-old, playstation2]; Silent Hill (1999) [playstation1]; Silent Hill: Origins (2007) [playstation2, psp]; Silent Hill Homecoming (2008) [pc, xbox360, playstation3]; Silent Hill: Downpour (2012) [xbox360, playstation3] | 294 ms |
| Silent Hill 2 (2001 original) | Silent Hill 2 | all | 2 | yes | Silent Hill 2 (2024) [pc, playstation5, xbox-series-x]; Silent Hill 2 (2001) (2001) [pc, xbox-old, playstation2]; Silent Hill (1999) [playstation1]; Silent Hill: Origins (2007) [playstation2, psp]; Silent Hill Homecoming (2008) [pc, xbox360, playstation3] | 359 ms |
| Silent Hill 2 (2001 original) | Silent Hill 2 | exclude additions | 1 | yes | Silent Hill 2 (2001) (2001) [pc, xbox-old, playstation2]; Silent Hill (1999) [playstation1]; Silent Hill: Origins (2007) [playstation2, psp]; Silent Hill Homecoming (2008) [pc, xbox360, playstation3]; Silent Hill: Downpour (2012) [xbox360, playstation3] | 306 ms |
| The Witcher 3: Wild Hunt | Wiedźmin 3: Dziki Gon | all | 1 | yes | The Witcher 3: Wild Hunt (2015) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch, macos]; Gon' E-Choo! (2015) [pc, ios, macos, linux]; Sarcopha-gon! (2022) [pc, macos, linux]; Tree-A-Gon (2023) [pc, web]; n-gon (itch) (2019) [web] | 239 ms |
| The Witcher 3: Wild Hunt | Wiedźmin 3: Dziki Gon | exclude additions | 1 | yes | The Witcher 3: Wild Hunt (2015) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch, macos]; Gon' E-Choo! (2015) [pc, ios, macos, linux]; Sarcopha-gon! (2022) [pc, macos, linux]; Tree-A-Gon (2023) [pc, web]; n-gon (itch) (2019) [web] | 876 ms |
| The Witcher 3: Wild Hunt | The Witcher 3: Wild Hunt | all | 1 | yes | The Witcher 3: Wild Hunt (2015) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch, macos]; The Witcher 3: Wild Hunt – Hearts of Stone (2015) [pc, xbox-one, playstation4]; The Witcher 3: Wild Hunt – Blood and Wine (2016) [pc, xbox-one, playstation4]; The Witcher 3 Wild Hunt - Complete Edition (2016) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; The Glitcher - the wild bug hunt (2020) [pc, web] | 342 ms |
| The Witcher 3: Wild Hunt | The Witcher 3: Wild Hunt | exclude additions | 1 | yes | The Witcher 3: Wild Hunt (2015) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch, macos]; The Glitcher - the wild bug hunt (2020) [pc, web]; The Hunt - Rebuilt (2017) [pc]; The Wild Eight (2016) [pc, xbox-one, playstation4]; Wild hunt: Minigames! (2023) [pc] | 383 ms |
| Hogwarts Legacy | Dziedzictwo Hogwartu | all | 1 | yes | Hogwarts Legacy (2023) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Harry Potter: Hogwarts Mystery (2018) [ios, android]; Hogwarts Legacy 200.0 (2023) [web]; Harry Potter: Hogwarts Defender (2018) [web]; Mystery Hogwarts - Secret Room (2018) [web] | 265 ms |
| Hogwarts Legacy | Dziedzictwo Hogwartu | exclude additions | 1 | yes | Hogwarts Legacy (2023) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Hogwarts Legacy 200.0 (2023) [web]; Harry Potter: Hogwarts Defender (2018) [web]; Mystery Hogwarts - Secret Room (2018) [web]; Sims Hogwarts (Shai-la) (2019) [pc] | 310 ms |
| Hogwarts Legacy | Hogwarts Legacy | all | 1 | yes | Hogwarts Legacy (2023) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Hogwarts Legacy 200.0 (2023) [web]; Hogwarts Legacy Demake (2023) [web]; Harry Potter: Hogwarts Mystery (2018) [ios, android]; Hunter's Legacy (2016) [pc, xbox-one, playstation4, macos] | 346 ms |
| Hogwarts Legacy | Hogwarts Legacy | exclude additions | 1 | yes | Hogwarts Legacy (2023) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Hogwarts Legacy 200.0 (2023) [web]; Hogwarts Legacy Demake (2023) [web]; Hunter's Legacy (2016) [pc, xbox-one, playstation4, macos]; Alwa's Legacy (2020) [pc, macos, linux] | 340 ms |
| Onimusha: Way of the Sword | Onimusha Way of The Sword | all | 1 | yes | Onimusha: Way Of The Sword (2026) [pc, playstation5, xbox-series-x]; Onimusha: Warlords (2001) [pc, xbox-one, playstation4, nintendo-switch, xbox-old, playstation2]; Onimusha: Dawn of Dreams (2006) [playstation2]; Ash of Gods: The Way (2023) [pc]; Onimusha 3: Demon Siege (2004) [pc, playstation2] | 585 ms |
| Onimusha: Way of the Sword | Onimusha Way of The Sword | exclude additions | 1 | yes | Onimusha: Way Of The Sword (2026) [pc, playstation5, xbox-series-x]; Onimusha: Warlords (2001) [pc, xbox-one, playstation4, nintendo-switch, xbox-old, playstation2]; Onimusha: Dawn of Dreams (2006) [playstation2]; Ash of Gods: The Way (2023) [pc]; Onimusha 3: Demon Siege (2004) [pc, playstation2] | 423 ms |
| The Blood of Dawnwalker | Blood of Dawnwalker | all | 1 | yes | The Blood Of Dawnwalker (2026) [pc, playstation5, xbox-series-x]; Blood (1997) [pc, linux]; Eisenwald: Blood of November (2016) [pc]; Blood 2: The Blood Group (1998) [pc]; Captain Blood (2025) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch] | 231 ms |
| The Blood of Dawnwalker | Blood of Dawnwalker | exclude additions | 1 | yes | The Blood Of Dawnwalker (2026) [pc, playstation5, xbox-series-x]; Blood (1997) [pc, linux]; Eisenwald: Blood of November (2016) [pc]; Captain Blood (2025) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Alder's Blood (2020) [pc, nintendo-switch] | 368 ms |
| The Alters | The Alters | all | 1 | yes | The Alters (2025) [pc, playstation5, xbox-series-x]; Alder's Blood Prologue (2020) [pc]; The Alters: Last Variable (2026) [pc, playstation5, xbox-series-x]; Alder's Blood (2020) [pc, nintendo-switch]; Altered Beast (2005) (2005) [playstation2] | 317 ms |
| The Alters | The Alters | exclude additions | 1 | yes | The Alters (2025) [pc, playstation5, xbox-series-x]; Alder's Blood Prologue (2020) [pc]; The Alters: Last Variable (2026) [pc, playstation5, xbox-series-x]; Alder's Blood (2020) [pc, nintendo-switch]; Altered Beast (2005) (2005) [playstation2] | 322 ms |
| Hades (2020) | Hades | all | 1 | yes | Hades (2020) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Hades (2016) (2016) [pc]; Hades' Star (2017) [pc, ios, android, macos]; Hades II (2025) [pc, xbox-series-x, nintendo-switch]; Hades 2 (2001) (2001) [pc] | 128 ms |
| Hades (2020) | Hades | exclude additions | 1 | yes | Hades (2020) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Hades (2016) (2016) [pc]; Hades' Star (2017) [pc, ios, android, macos]; Hades II (2025) [pc, xbox-series-x, nintendo-switch]; Hades 2 (2001) (2001) [pc] | 259 ms |
| Metal Gear Solid Delta: Snake Eater | Metal Gear Solid Snake Eater | all | 1 | yes | Metal Gear Solid Delta: Snake Eater (2025) [pc, playstation5, xbox-series-x]; Metal Gear Solid 3: Snake Eater (2004) [nintendo-3ds, xbox360, playstation3, playstation2, ps-vita]; METAL GEAR & METAL GEAR 2: Solid Snake (no date) [pc]; Metal Gear 2: Solid Snake (1990) [pc, xbox360, playstation3, playstation2, wii]; Metal Gear Solid (1998) [pc, playstation3, playstation1, game-boy-color] | 371 ms |
| Metal Gear Solid Delta: Snake Eater | Metal Gear Solid Snake Eater | exclude additions | 1 | yes | Metal Gear Solid Delta: Snake Eater (2025) [pc, playstation5, xbox-series-x]; Metal Gear Solid 3: Snake Eater (2004) [nintendo-3ds, xbox360, playstation3, playstation2, ps-vita]; METAL GEAR & METAL GEAR 2: Solid Snake (no date) [pc]; Metal Gear 2: Solid Snake (1990) [pc, xbox360, playstation3, playstation2, wii]; Metal Gear Solid (1998) [pc, playstation3, playstation1, game-boy-color] | 256 ms |
| Bloodborne | Bloodborne | all | 1 | yes | Bloodborne (2015) [playstation4]; Bloodborne: Game of the Year Edition (2015) [playstation4]; Bloodborne: The Old Hunters (2015) [playstation4]; Bloodborne PSX Demake (2022) [pc]; Bloodforge (2012) [xbox360] | 399 ms |
| Bloodborne | Bloodborne | exclude additions | 1 | yes | Bloodborne: Game of the Year Edition (2015) [playstation4]; Bloodborne PSX Demake (2022) [pc]; Bloodforge (2012) [xbox360]; Project: B1oodborne (2021) [pc]; BloodBound (itch) (2021) [pc] | 303 ms |
| Control Resonant | Control RESONANT | all | 1 | yes | Control Resonant (2026) [pc, playstation5, xbox-series-x]; Control: AWE (2020) [pc, xbox-one, playstation4]; Control: The Foundation (2020) [pc, xbox-one, playstation4]; Flight Control HD (2010) [pc, ios, android, nintendo-ds, macos, playstation3, wii]; Mission Control: NanoMech (2014) [pc, macos] | 332 ms |
| Control Resonant | Control RESONANT | exclude additions | 1 | yes | Control Resonant (2026) [pc, playstation5, xbox-series-x]; Flight Control HD (2010) [pc, ios, android, nintendo-ds, macos, playstation3, wii]; Mission Control: NanoMech (2014) [pc, macos]; Resonance (2012) [pc, macos, linux]; Star Control: Origins (2018) [pc] | 386 ms |
| Final Fantasy VII Rebirth | Final Fantasy VII Rebirth | all | 1 | yes | Final Fantasy VII Rebirth (2024) [pc, playstation5]; Final Fantasy VII (2020) [pc, playstation5, playstation4]; Final Fantasy VII (1997) (1997) [pc, xbox-one, playstation4, nintendo-switch, ios, android, playstation1]; Crisis Core: Final Fantasy VII (2007) [psp]; Final Fantasy IX (2000) [pc, xbox-one, playstation4, nintendo-switch, ios, android, playstation1] | 410 ms |
| Final Fantasy VII Rebirth | Final Fantasy VII Rebirth | exclude additions | 1 | yes | Final Fantasy VII Rebirth (2024) [pc, playstation5]; Final Fantasy VII (1997) (1997) [pc, xbox-one, playstation4, nintendo-switch, ios, android, playstation1]; Final Fantasy IX (2000) [pc, xbox-one, playstation4, nintendo-switch, ios, android, playstation1]; FINAL FANTASY VI (1994) [pc, ios, android, game-boy-advance, snes]; Dissidia: Final Fantasy (2008) [psp] | 322 ms |
| Fire Emblem: Fortune's Weave (post) | Fire Emblem: Fortune's Weave Dagdan Collection | all | — | no | Fire Emblem Fates: Birthright (2016) [nintendo-3ds]; Fire Emblem: Thracia 776 (2000) [snes]; Fire Emblem: New Mystery of the Emblem (2010) [nintendo-ds]; Fire Emblem: Shadow Dragon (2009) [nintendo-ds, wii-u]; Fire Emblem Fates: Revelation (2016) [nintendo-3ds] | 394 ms |
| Fire Emblem: Fortune's Weave (post) | Fire Emblem: Fortune's Weave Dagdan Collection | exclude additions | — | no | Fire Emblem Fates: Birthright (2016) [nintendo-3ds]; Fire Emblem: Thracia 776 (2000) [snes]; Fire Emblem: New Mystery of the Emblem (2010) [nintendo-ds]; Fire Emblem: Shadow Dragon (2009) [nintendo-ds, wii-u]; Fire Emblem Fates: Revelation (2016) [nintendo-3ds] | 417 ms |
| Need for Speed Ultimate (post) | Gry Need for Speed Ultimate Bundle na PS4/PS5 | all | — | no | Need for Speed (2015) [pc, xbox-one, playstation4]; Need for Speed World (2010) [pc]; Need for Speed: Shift (2009) [pc, android, xbox360, playstation3, psp]; Need For Speed Undercover (2008) [pc, nintendo-ds, xbox360, playstation3, playstation2, psp, wii]; Need for Speed: Underground (2003) [pc, xbox-old, playstation2, gamecube] | 228 ms |
| Need for Speed Ultimate (post) | Gry Need for Speed Ultimate Bundle na PS4/PS5 | exclude additions | — | no | Need for Speed (2015) [pc, xbox-one, playstation4]; Need for Speed World (2010) [pc]; Need for Speed: Shift (2009) [pc, android, xbox360, playstation3, psp]; Need For Speed Undercover (2008) [pc, nintendo-ds, xbox360, playstation3, playstation2, psp, wii]; Need for Speed: Underground (2003) [pc, xbox-old, playstation2, gamecube] | 289 ms |
| Hades II (post) | Gra Hades II za 81,90 zł | all | 5 | yes | Hades 2 (2001) (2001) [pc]; Gra-Birby (2021) [pc, macos]; Hades (2020) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Jade's Journey 2 (2017) [pc]; Hades II (2025) [pc, xbox-series-x, nintendo-switch] | 2034 ms |
| Hades II (post) | Gra Hades II za 81,90 zł | exclude additions | 5 | yes | Hades 2 (2001) (2001) [pc]; Gra-Birby (2021) [pc, macos]; Hades (2020) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Jade's Journey 2 (2017) [pc]; Hades II (2025) [pc, xbox-series-x, nintendo-switch] | 311 ms |
| The Witcher: Enhanced Edition Director's Cut (post) | The Witcher: Enhanced Edition Director's Cut za 4,49 zł i The Witcher 2: Assassins of Kings Enhanced Edition za 5,99 zł @ Steam | all | 1 | yes | The Witcher: Enhanced Edition Director's Cut (2008) [pc, macos]; The Witcher 2: Assassins of Kings Enhanced Edition (2012) [pc, macos, xbox360]; Assassin's Creed: Director's Cut Edition (2008) [pc]; The Witcher 2: Assassins of Kings (2011) [pc, xbox-one, xbox360]; Interplanetary: Enhanced Edition (2017) [pc, macos, linux] | 814 ms |
| The Witcher: Enhanced Edition Director's Cut (post) | The Witcher: Enhanced Edition Director's Cut za 4,49 zł i The Witcher 2: Assassins of Kings Enhanced Edition za 5,99 zł @ Steam | exclude additions | — | no | The Witcher 2: Assassins of Kings (2011) [pc, xbox-one, xbox360]; Interplanetary: Enhanced Edition (2017) [pc, macos, linux]; Seven: Enhanced Edition (2017) [pc]; Downward: Enhanced Edition (2017) [pc, playstation5, xbox-series-x, nintendo-switch, linux]; Sword of the Stars II: Enhanced Edition (2012) [pc] | 921 ms |
| The Witcher 2: Assassins of Kings Enhanced Edition (post) | The Witcher: Enhanced Edition Director's Cut za 4,49 zł i The Witcher 2: Assassins of Kings Enhanced Edition za 5,99 zł @ Steam | all | 2 | yes | The Witcher: Enhanced Edition Director's Cut (2008) [pc, macos]; The Witcher 2: Assassins of Kings Enhanced Edition (2012) [pc, macos, xbox360]; Assassin's Creed: Director's Cut Edition (2008) [pc]; The Witcher 2: Assassins of Kings (2011) [pc, xbox-one, xbox360]; Interplanetary: Enhanced Edition (2017) [pc, macos, linux] | 711 ms |
| The Witcher 2: Assassins of Kings Enhanced Edition (post) | The Witcher: Enhanced Edition Director's Cut za 4,49 zł i The Witcher 2: Assassins of Kings Enhanced Edition za 5,99 zł @ Steam | exclude additions | — | no | The Witcher 2: Assassins of Kings (2011) [pc, xbox-one, xbox360]; Interplanetary: Enhanced Edition (2017) [pc, macos, linux]; Seven: Enhanced Edition (2017) [pc]; Downward: Enhanced Edition (2017) [pc, playstation5, xbox-series-x, nintendo-switch, linux]; Sword of the Stars II: Enhanced Edition (2012) [pc] | 829 ms |
| Grand Theft Auto VI (post) | Preorder Grand Theft Auto VI The Album w Empiku. Płyty CD i winylowe ze ścieżką dźwiękową już od 67,50 zł | all | 1 | yes | Grand Theft Auto VI (2026) [playstation5, xbox-series-x]; Grand Theft Auto IV (2008) [pc, xbox-one, xbox360, playstation3]; Grand Theft Auto III: The Definitive Edition (2021) [pc, playstation5, xbox-one, playstation4, xbox-series-x, nintendo-switch]; Grand Theft Auto V (2013) [pc, playstation5, xbox-one, playstation4, xbox-series-x, xbox360, playstation3]; Grand Theft Auto IV: Complete Edition (2010) [pc, xbox360, playstation3] | 410 ms |
| Grand Theft Auto VI (post) | Preorder Grand Theft Auto VI The Album w Empiku. Płyty CD i winylowe ze ścieżką dźwiękową już od 67,50 zł | exclude additions | 1 | yes | Grand Theft Auto VI (2026) [playstation5, xbox-series-x]; Grand Theft Auto IV (2008) [pc, xbox-one, xbox360, playstation3]; Grand Theft Auto V (2013) [pc, playstation5, xbox-one, playstation4, xbox-series-x, xbox360, playstation3]; Grand Theft Auto: The Trilogy – The Definitive Edition (2021) [pc, playstation5, playstation4, xbox-one, xbox-series-x, nintendo-switch, ios, android]; Grand Theft Auto: Chinatown Wars (2009) [ios, android, nintendo-ds, ps-vita, psp] | 601 ms |
| Teenage Mutant Ninja Turtles Mutants Unleashed (post) | Pudełkowe Teenage Mutant Ninja Turtles Mutants Unleashed na Switcha od 45 zł w polskich sklepach | all | 2 | yes | Teenage Mutant Ninja Turtles: Mutants in Manhattan (2016) [pc, xbox-one, playstation4, xbox360, playstation3]; Teenage Mutant Ninja Turtles: Mutants Unleashed (2024) [pc]; Teenage Mutant Ninja Turtles: Mutant Melee (2005) [pc, xbox-old, playstation2, gamecube]; Teenage Mutant Ninja Turtles (1989) (1989) [pc, nes, commodore-amiga, atari-st]; Teenage Mutant Ninja Turtles 3: Mutant Nightmare (2005) [nintendo-ds, xbox-old, playstation2, gamecube] | 831 ms |
| Teenage Mutant Ninja Turtles Mutants Unleashed (post) | Pudełkowe Teenage Mutant Ninja Turtles Mutants Unleashed na Switcha od 45 zł w polskich sklepach | exclude additions | 2 | yes | Teenage Mutant Ninja Turtles: Mutants in Manhattan (2016) [pc, xbox-one, playstation4, xbox360, playstation3]; Teenage Mutant Ninja Turtles: Mutants Unleashed (2024) [pc]; Teenage Mutant Ninja Turtles: Mutant Melee (2005) [pc, xbox-old, playstation2, gamecube]; Teenage Mutant Ninja Turtles (1989) (1989) [pc, nes, commodore-amiga, atari-st]; Teenage Mutant Ninja Turtles 3: Mutant Nightmare (2005) [nintendo-ds, xbox-old, playstation2, gamecube] | 822 ms |
| Clive Barker’s Hellraiser Revival (post) | Preorder Clive Barker’s Hellraiser Revival Day One Edition na PS5 i XSX za 144,99 zł (+ wysyłka) w Perfect Blue | all | 1 | yes | Clive Barker's Hellraiser: Revival (2026) [pc, playstation5, xbox-series-x, nintendo-switch]; Clive Barker's Jericho (2007) [pc, xbox360, playstation3]; Clive Barker's Undying (2001) [pc]; I am Weapon: Revival (2015) [pc]; Day One: Garry's Incident (2013) [pc] | 650 ms |
| Clive Barker’s Hellraiser Revival (post) | Preorder Clive Barker’s Hellraiser Revival Day One Edition na PS5 i XSX za 144,99 zł (+ wysyłka) w Perfect Blue | exclude additions | 1 | yes | Clive Barker's Hellraiser: Revival (2026) [pc, playstation5, xbox-series-x, nintendo-switch]; Clive Barker's Jericho (2007) [pc, xbox360, playstation3]; Clive Barker's Undying (2001) [pc]; I am Weapon: Revival (2015) [pc]; Day One: Garry's Incident (2013) [pc] | 797 ms |
| Assassin’s Creed Black Flag Resynced (post) | Pudełkowe Assassin’s Creed Black Flag Resynced Launch Edition na PS5 za 249,99 zł na Allegro | all | — | no | Assassin's Creed Back Flag Resynced (2026) [pc, playstation5, xbox-series-x]; Na na na na na na na na na na na na na na na na... BATMAN! (2023) [web]; Assassin’s Creed IV: Black Flag (2013) [pc, playstation4, xbox-one, nintendo-switch, xbox360, playstation3, wii-u]; Assassin's Creed IV: Black Flag - Freedom Cry (2013) [pc, xbox-one, playstation4, nintendo-switch, xbox360, playstation3]; Assassin’s Creed Black Flag Gold Edition (2013) [pc, xbox-one, playstation4, playstation3] | 807 ms |
| Assassin’s Creed Black Flag Resynced (post) | Pudełkowe Assassin’s Creed Black Flag Resynced Launch Edition na PS5 za 249,99 zł na Allegro | exclude additions | — | no | Na na na na na na na na na na na na na na na na... BATMAN! (2023) [web]; Assassin’s Creed IV: Black Flag (2013) [pc, playstation4, xbox-one, nintendo-switch, xbox360, playstation3, wii-u]; Assassin’s Creed Black Flag Gold Edition (2013) [pc, xbox-one, playstation4, playstation3]; Assassin's Creed Valhalla (2020) [pc, playstation5, xbox-one, playstation4, xbox-series-x]; Assassin's Creed Origins (2017) [pc, xbox-one, playstation4] | 715 ms |
| Eastward (post) | Eastward za 109,99 zł (-8%) | all | 1 | yes | Eastward (2021) [pc, xbox-one, nintendo-switch, macos]; A-Train 8 (2013) [pc]; 8-Bit Invaders! (2016) [pc, xbox-one, playstation4]; Section 8: Prejudice (2011) [pc, xbox360, playstation3]; 8-Bit Bayonetta (2017) [pc, web] | 474 ms |
| Eastward (post) | Eastward za 109,99 zł (-8%) | exclude additions | 1 | yes | Eastward (2021) [pc, xbox-one, nintendo-switch, macos]; A-Train 8 (2013) [pc]; 8-Bit Invaders! (2016) [pc, xbox-one, playstation4]; Section 8: Prejudice (2011) [pc, xbox360, playstation3]; 8-Bit Bayonetta (2017) [pc, web] | 451 ms |
| Absolute Drift (post) | Absolute Drift Premium Edition za 133,90 zł (-6%) | all | 1 | yes | Absolute Drift (2015) [pc, ios, android, macos, linux]; Absolute Drift - Prototype (2014) [pc, macos, linux]; Dreamscapes: The Sandman - Premium Edition (2014) [pc]; Dreamscapes: Nightmare's Heir - Premium Edition (2015) [pc]; Halcyon 6: Lightspeed Edition (2017) [pc, ios, macos, linux] | 405 ms |
| Absolute Drift (post) | Absolute Drift Premium Edition za 133,90 zł (-6%) | exclude additions | 1 | yes | Absolute Drift (2015) [pc, ios, android, macos, linux]; Absolute Drift - Prototype (2014) [pc, macos, linux]; Dreamscapes: The Sandman - Premium Edition (2014) [pc]; Dreamscapes: Nightmare's Heir - Premium Edition (2015) [pc]; Halcyon 6: Lightspeed Edition (2017) [pc, ios, macos, linux] | 614 ms |

- own: found 12 of 12 within the first 5
- polish-only: found 0 of 0 within the first 5
- post: found 8 of 11 within the first 5

Verdict: PASS
Failure path: unavailable (status: none)

### Confirmed ranks

Tomasz reviewed every automatic rank on 2026-09-26. He confirmed all of them except two, which are corrected here:

1. **Bloodborne, `exclude additions`:** automatic `1`, corrected to `—`. The prefix match hit "Bloodborne: Game of the Year Edition", and the base game is absent in that mode. The entry is still found through `all` mode, where it ranks 1. Tomasz notes that boxed Bloodborne is probably sold only as the GOTY edition now, so base-edition boxes may no longer be made. That is his speculation and has not been checked.
2. **Assassin's Creed Black Flag Resynced (post), `all`:** automatic `—`, corrected to `1`. RAWG spells the entry "Assassin's Creed Back Flag Resynced", a typo in the catalogue, so the prefix match missed it. `exclude additions` stays `—`.

Two misses are real and are not query noise:

- **Fire Emblem: Fortune's Weave:** Tomasz confirms this is a new game that does not exist in RAWG's catalogue. It is a coverage gap: a new release the catalogue has not added yet.
- **Need for Speed Ultimate Bundle:** a bundle, not a single game, so no catalogue entry is expected.

Confirmed totals:

- **own:** 12 of 12 found within the first 5.
- **polish-only:** 0 of 0 (none probed).
- **post:** 9 of 11.

## Verdict

**PASS.** Every title from Tomasz's list with an international release was found within the first 5 results, 12 of 12. Each one ranked 1 in at least one mode; in `all` mode 11 ranked 1, and the 2001 Silent Hill 2 ranked 2, behind its remake. Both Polish-name queries ("Wiedźmin 3: Dziki Gon", "Dziedzictwo Hogwartu") ranked 1.

## Operational observations

- **Latency:** 128–2034 ms. All but two calls took between 228 and 921 ms. Longer post-text queries tend to be slower, around 650–920 ms. The single outlier, 2034 ms, was "Gra Hades II za 81,90 zł" in `all` mode; the same query took 311 ms in the other mode. No call came near the 5,000 ms default timeout.
- **Status codes:** no non-2xx status in the run.
- **Failure path:** `unavailable (status: none)` for the `timeoutMs: 1` call.
- **Quota:** the free tier allows 20,000 requests a month, and this run used 51.

## Findings

- **RAWG search matches Polish alternative names.** Both Polish names probed ranked 1. That includes Hogwarts Legacy, whose `alternative_names` looked empty on RAWG's public pages when the plan was written. Two data points do not prove this for every title.
- **`exclude_additions=true` removes games a collector wants:**
  - the Silent Hill 2 remake (2024), which RAWG files as an addition of the 2001 game;
  - the base Bloodborne, while its GOTY edition stays;
  - both Witcher Enhanced / Director's Cut editions;
  - Assassin's Creed Black Flag Resynced.

  In `all` mode, additions such as DLC (Hearts of Stone, The Old Hunters) and Complete or GOTY editions do appear, but none of them pushed an intended entry below rank 2.
- **RAWG's edition and parent structure is inconsistent.** A remake is filed as an addition of the original, and a GOTY edition is kept while its base game is dropped.
- **Name matching is fragile.** RAWG names carry years to tell games apart ("Silent Hill 2 (2001)", "Hades (2016)", "Altered Beast (2005)") and occasional typos ("Back Flag").
- **Platform lists are incomplete.** Teenage Mutant Ninja Turtles: Mutants Unleashed lists only `pc`, although the post sells a boxed Switch edition.
- **Raw post titles mostly resolve, but results degrade.** Titles still carrying prices, "Pudełkowe", "Preorder" or shop names mostly rank 1–2. Where they degrade:
  - Hades II fell to rank 5, behind an unrelated "Hades 2 (2001)";
  - a post naming two games returns both, at ranks 1 and 2;
  - a soundtrack-album post ("Grand Theft Auto VI The Album … Płyty CD i winylowe") resolved to the game GTA VI at rank 1.
- **Switch 2 is not a RAWG platform.** This comes from the plan's current-state analysis, not from this run. Tomasz accepts merging Switch and Switch 2.

## Handoff

### S-03 (`watchlist-from-catalog`)

- RAWG's terms require an active link to rawg.io on every page that shows RAWG data (`https://rawg.io/tos_api`). `src/app/layout.tsx` has no footer yet.
- Switch 2 is folded into Nintendo Switch; Tomasz accepts merging the two. Caveat: compatibility runs one way, so a Switch 2 game does not run on a Switch.
- Polish names: the plan expected them to be thin, but both names probed ranked 1. Two data points prove little, so search should still hint at trying the English title when a Polish one finds nothing.
- Default `exclude_additions` to **false**. It drops wanted entries (Silent Hill 2 remake, base Bloodborne, Black Flag Resynced), and in `all` mode additions never pushed an intended entry below rank 2.
- The four failure reasons are material for PRD question 6:
  - `misconfigured`: 401 or 403;
  - `rate_limited`: 429;
  - `unavailable`: network error, timeout or any other non-2xx;
  - `invalid_response`: a body of the wrong shape.

  The observed latencies are what the 5,000 ms default timeout should be tuned against.
- `RAWG_API_KEY` goes to Vercel as a server-only variable, never `NEXT_PUBLIC_`.
- The catalogue lags new releases: Fire Emblem: Fortune's Weave is on sale in collected posts but missing from RAWG. See Open Roadmap Question 9 (watching keywords) in [`context/foundation/roadmap.md`](../../foundation/roadmap.md#open-roadmap-questions).

### S-01 (`physical-deals-from-real-posts`)

- Extraction should emit the game's original (English) title, and perhaps alternative titles too. That second part is Tomasz's idea and S-01's call.
- Raw post text degrades ranking (Hades II at rank 5), and posts naming several games return several games.
- Posts about non-game merchandise resolve to the game: the GTA VI soundtrack post resolved to GTA VI. S-01 must classify "is this a game deal" before resolving.
- Bundles have no catalogue entry.
- Resolving a deal costs about one request. The free tier is 20,000 requests a month with no published per-second limit, so batches run one request at a time.
- The key goes to GitHub Actions secrets. Run the workflow's own command against it locally before wiring it in, and never paste it into an agent conversation (`context/foundation/lessons.md`).
- Scripts that import `src/` run with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`.

### S-04 (`deals-matched-to-watchlist`)

- Matching compares the RAWG `id` plus the platform rule. Editions collapse through `exclude_additions` or `GET /games/{id}/parent-games`.
- RAWG's edition structure is inconsistent. It files a remake as an addition of the original, and it keeps Bloodborne's GOTY edition as a separate `id` that may be what boxed copies now sell as, per Tomasz. So a watchlist entry for "Bloodborne" and a deal resolved to the GOTY `id` do not match by `id` alone.
- RAWG platform lists can be incomplete (Teenage Mutant Ninja Turtles: Mutants Unleashed lists only `pc`). The platform rule must not reject a deal just because the catalogue lacks that platform.
