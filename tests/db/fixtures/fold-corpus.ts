/**
 * The inputs tests/db/fold-parity.test.ts folds twice, with foldForMatching
 * and with public.fold_for_matching, to compare the two. It holds no expected
 * output: the parity test asserts agreement only, and what each input should
 * fold to is asserted elsewhere (tests/unit/watchlist/fold.test.ts and
 * supabase/checks/matching.sql).
 *
 * Built the same way on every run, from two parts:
 * - curated inputs: the fold cases of supabase/checks/matching.sql, section 1
 *   (inputs only), the PRD's and roadmap S-04's examples, the 20 catalogue
 *   names of context/changes/deals-matched-to-watchlist/acceptance.md, and
 *   the Polish pangram;
 * - generated probes: every code point of the blocks where Latin letters,
 *   their diacritics, apostrophes, dashes, letterlike symbols and fullwidth
 *   forms live, each alone and between "a" and "b", and every ASCII letter
 *   followed by every combining mark. U+0000 is left out, because Postgres
 *   text cannot hold it; no lone surrogate falls in these blocks.
 */

/** supabase/checks/matching.sql, section 1: the fold cases' inputs. */
const MATCHING_SQL_FOLD_INPUTS = [
  "Wiedźmin 3: Dziki Gon",
  "ŁOWCY GIER",
  "Dragon’s Dogma 2",
  "Dragon's Dogma",
  "Pokémon Legends: Z-A",
  "Final Fantasy X/X-2 HD Remaster",
  "Mario & Luigi",
  "  Watch_Dogs 2 ",
  "ゼルダの伝説",
  "!!!",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789",
  "ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż",
  "ÀÁÂÃÄÅ ÇČ ĎĐ ÈÉÊËĚ ÌÍÎÏ ŇÑ ÒÔÕÖØŐ Ř Š Ť ÙÚÛÜŮŰ ÝŸ Ž",
  "àáâãäå çč ďđ èéêëě ìíîï ňñ òôõöøő ř š ť ùúûüůű ýÿ ž",
  "a'b’c‘d`e´fʼg",
];

/** The PRD's and roadmap S-04's matching examples. */
const PRD_AND_ROADMAP_EXAMPLES = [
  "Silent Hill 2",
  "pokemon",
  "Pokémon",
  "Dragon’s Dogma",
  "Wiedźmin",
  "wiedzmin",
  "Łowcy",
  "Mario and Luigi",
];

/** acceptance.md, "Per game": the catalogue names, without RAWG's year. */
const ACCEPTANCE_CATALOGUE_NAMES = [
  "Dragon’s Dogma 2",
  "Little Nightmares",
  "The Last Faith",
  "Fortnite Battle Royale",
  "Mighty Morphin Power Rangers: Rita's Rewind",
  "Assassin’s Creed The Ezio Collection",
  "PGA TOUR 2K25",
  "Daemon X Machina: Titanic Scion",
  "Astro Bot",
  "Yoshi and the Mysterious Book",
  "Borderlands Legendary Collection",
  "Saints Row",
  "Orbitals",
  "HELLDIVERS 2",
  "Worms Armageddon",
  "Final Fantasy VII Rebirth",
  "The Blood Of Dawnwalker",
  "Atari Mania",
  "Pokkén Tournament DX",
  "Kamiwaza: Way of the Thief",
];

const POLISH_PANGRAM = ["Zażółć gęślą jaźń", "ZAŻÓŁĆ GĘŚLĄ JAŹŃ"];

/**
 * Inclusive code point ranges: Basic Latin to Combining Diacritical Marks,
 * Latin Extended Additional, General Punctuation, Letterlike Symbols, and
 * the fullwidth ASCII forms.
 */
const PROBED_BLOCKS: readonly (readonly [number, number])[] = [
  [0x0001, 0x036f],
  [0x1e00, 0x1eff],
  [0x2000, 0x206f],
  [0x2100, 0x214f],
  [0xff00, 0xff5e],
];

const COMBINING_MARKS: readonly [number, number] = [0x0300, 0x036f];

const ASCII_LETTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");

function codePoints([first, last]: readonly [number, number]): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function* probes(): Generator<string> {
  for (const block of PROBED_BLOCKS) {
    for (const codePoint of codePoints(block)) {
      const character = String.fromCodePoint(codePoint);
      yield character;
      yield `a${character}b`;
    }
  }
  for (const letter of ASCII_LETTERS) {
    for (const mark of codePoints(COMBINING_MARKS)) {
      yield `${letter}${String.fromCodePoint(mark)}`;
    }
  }
}

/** Every input the parity test folds, curated first. */
export const FOLD_CORPUS: readonly string[] = [
  ...MATCHING_SQL_FOLD_INPUTS,
  ...PRD_AND_ROADMAP_EXAMPLES,
  ...ACCEPTANCE_CATALOGUE_NAMES,
  ...POLISH_PANGRAM,
  ...probes(),
];
