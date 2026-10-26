/**
 * foldForMatching, the twin of public.fold_for_matching that the phrase
 * pre-check uses to predict the folded unique index.
 *
 * Every expected value comes from what the product settled, never from running
 * the fold: the PRD (FR-010, Business Logic: case, diacritics and punctuation
 * are ignored), roadmap S-04 (ł mapped explicitly, apostrophes removed, "&"
 * reads "and", every other run outside letters and digits is one space) and
 * the S-04 plan in context/archive/2026-10-09-deals-matched-to-watchlist/plan.md (the
 * result is trimmed; an empty key matches nothing). So each rule is asserted as
 * spellings that must fold alike, paired with near misses that must stay
 * apart, which no constant or over-eager fold passes. Every class carries
 * non-ASCII input, because ASCII alone leaves all but A-Z of the table
 * untested. Each letter used is one of the table's: a letter outside it is not
 * folded, and no source promises that it is.
 */
import { describe, expect, it } from "vitest";
import { foldForMatching } from "@/lib/watchlist/rules";

type FoldRule = {
  /** The rule, citing where it was settled. */
  name: string;
  /** Spellings that must fold to one and the same non-empty text. */
  alike: string[];
  /** Pairs that must fold to different texts. */
  apart: [string, string][];
};

const RULES: FoldRule[] = [
  {
    name: "PRD FR-010: letter case is ignored, digits are kept",
    alike: [
      "Wiedźmin 3: Dziki Gon",
      "WIEDŹMIN 3: DZIKI GON",
      "wiedźmin 3: dziki gon",
    ],
    apart: [["Wiedźmin 3", "Wiedźmin"]],
  },
  {
    name: "PRD FR-010, roadmap S-04: Polish diacritics are ignored, in both cases",
    alike: [
      "Zażółć gęślą jaźń",
      "ZAŻÓŁĆ GĘŚLĄ JAŹŃ",
      "Zazolc gesla jazn",
      "ZAZOLC GESLA JAZN",
    ],
    // A letter folds to its own base letter, not to one that sounds alike.
    apart: [
      ["Może", "Morze"],
      ["Góra", "Gura"],
    ],
  },
  {
    name: "roadmap S-04: ł and Ł have no Unicode decomposition and are mapped explicitly",
    alike: ["Łowcy gier", "ŁOWCY GIER", "łowcy gier", "Lowcy gier"],
    // Mapped to l, not deleted.
    apart: [["Łowcy gier", "Owcy gier"]],
  },
  {
    name: "roadmap S-04: „pokemon” finds „Pokémon”",
    alike: ["Pokémon", "POKÉMON", "Pokemon", "pokemon"],
    apart: [["Pokémon", "Pokmon"]],
  },
  {
    name: "review F5, roadmap S-04: „pokemon” finds „Pokémon” typed with a separate accent (NFD)",
    // Escapes, so that no editor can compose the accent onto its letter.
    alike: ["Poke\u0301mon", "Pokémon", "pokemon", "POKE\u0301MON"],
    // The accent belongs to its letter, so it does not split the word.
    apart: [["Poke\u0301mon", "Poke mon"]],
  },
  {
    name: "review F5: „Wiedźmin” typed with a separate accent (NFD) folds as the precomposed one",
    alike: ["Wiedz\u0301min", "Wiedźmin", "wiedzmin", "WIEDZ\u0301MIN"],
    apart: [["Wiedz\u0301min", "Wiedz min"]],
  },
  {
    name: "roadmap S-04: Czech diacritics of the fixed table fold to their base letter",
    alike: [
      "Příliš žluťoučký kůň úpěl ďábelské ódy",
      "PŘÍLIŠ ŽLUŤOUČKÝ KŮŇ ÚPĚL ĎÁBELSKÉ ÓDY",
      "Prilis zlutoucky kun upel dabelske ody",
    ],
    // ř is r, not the Polish rz.
    apart: [["Řeka", "Rzeka"]],
  },
  {
    name: "roadmap S-04: Hungarian diacritics of the fixed table fold to their base letter",
    alike: [
      "Árvíztűrő tükörfúrógép",
      "ÁRVÍZTŰRŐ TÜKÖRFÚRÓGÉP",
      "Arvizturo tukorfurogep",
    ],
    // ü is u, not the German ue.
    apart: [["Tükör", "Tuekoer"]],
  },
  {
    name: "roadmap S-04: Western European diacritics of the fixed table fold to their base letter",
    alike: [
      "Déjà vu Brütal Señor Façade Smørrebrød Ångström",
      "DÉJÀ VU BRÜTAL SEÑOR FAÇADE SMØRREBRØD ÅNGSTRÖM",
      "Deja vu Brutal Senor Facade Smorrebrod Angstrom",
    ],
    // ñ is n, not ny.
    apart: [["Señor", "Senyor"]],
  },
  {
    name: "roadmap S-04: the six apostrophes are removed",
    alike: [
      "Dragon's Dogma",
      "Dragon’s Dogma",
      "Dragon‘s Dogma",
      "Dragon`s Dogma",
      "Dragon´s Dogma",
      "Dragonʼs Dogma",
      "Dragons Dogma",
      "DRAGON’S DOGMA",
    ],
    // Removed, not turned into a space.
    apart: [["Dragon’s Dogma", "Dragon s Dogma"]],
  },
  {
    name: 'roadmap S-04: "&" reads "and"',
    alike: [
      "Pokémon Scarlet & Violet",
      "Pokémon Scarlet and Violet",
      "POKEMON SCARLET AND VIOLET",
    ],
    apart: [
      ["Mario & Luigi", "Mario Luigi"],
      ["Pokémon Scarlet & Violet", "Pokémon Scarlet Violet"],
    ],
  },
  {
    name: "PRD FR-010, roadmap S-04, S-04 plan: every other run outside letters and digits is one space, trimmed at the ends",
    alike: [
      "Pokémon Legends: Z-A",
      "Pokémon Legends Z A",
      "POKÉMON — LEGENDS / Z·A",
      "¡Pokémon Legends: Z–A!",
    ],
    // A run of punctuation is a space, not nothing.
    apart: [["Pokémon Legends: Z-A", "Pokémon Legends: ZA"]],
  },
];

describe.each(RULES)("$name", ({ alike, apart }) => {
  it("folds every spelling alike, to a non-empty text", () => {
    const folded = alike.map((spelling) => foldForMatching(spelling));
    expect(folded[0]).not.toBe("");
    expect(folded).toEqual(folded.map(() => folded[0]));
  });

  it.each(apart)("keeps „%s” apart from „%s”", (one, other) => {
    expect(foldForMatching(one)).not.toBe(foldForMatching(other));
  });
});

describe("S-04 plan: an empty key matches nothing", () => {
  it.each(["!!!", "¿…?!"])("„%s” folds to nothing", (phrase) => {
    expect(foldForMatching(phrase)).toBe("");
  });
});
