/**
 * The game page's rules (src/lib/games/rules.ts): which `/games/<id>` segment
 * names a catalogue game, and where a game's page lives.
 *
 * parseGameId decides what reaches the catalogue: an id it refuses is a 404
 * with no catalogue request, so a refusal it misses costs quota, and an id it
 * refuses wrongly hides a real game. The expected values come from the plan
 * (context/changes/game-search-and-pages/plan.md, Phase 3: "digits only, no
 * leading zero, from 1 up to the Postgres integer maximum"), and the integer
 * maximum is game_id's type in public.watchlist_entries.
 */
import { describe, expect, it } from "vitest";
import { gamePath, MAX_GAME_ID, parseGameId } from "@/lib/games/rules";

describe("parseGameId", () => {
  it.each([
    { name: "plan: a RAWG id, GTA V's", raw: "3498", id: 3498 },
    { name: "the smallest id, 1", raw: "1", id: 1 },
    {
      name: "the Postgres integer maximum, the largest id the list can hold",
      raw: "2147483647",
      id: 2_147_483_647,
    },
  ])("accepts $name", ({ raw, id }) => {
    expect(parseGameId(raw)).toBe(id);
  });

  it.each([
    { name: "plan: zero, which is no id", raw: "0" },
    { name: "plan: a leading zero, a second address for id 7", raw: "007" },
    { name: "plan: exponent notation, which Number reads as 1000", raw: "1e3" },
    { name: "plan: a leading space, which Number ignores", raw: " 7" },
    { name: "plan: text", raw: "abc" },
    {
      name: "plan: one above the Postgres integer maximum",
      raw: "2147483648",
    },
    { name: "an empty segment", raw: "" },
    { name: "a negative number", raw: "-7" },
    { name: "a fraction", raw: "7.5" },
    { name: "a trailing space", raw: "7 " },
    { name: "hexadecimal, which Number reads as 16", raw: "0x10" },
    { name: "digits past the safe integers", raw: "99999999999999999999" },
    { name: "a non-ASCII digit (Arabic-Indic seven)", raw: "\u0667" },
  ])("refuses $name", ({ raw }) => {
    expect(parseGameId(raw)).toBeNull();
  });

  it("holds ids to the largest one the watchlist can store", () => {
    // public.watchlist_entries.game_id is a Postgres integer.
    expect(MAX_GAME_ID).toBe(2_147_483_647);
  });
});

describe("gamePath", () => {
  it("is /games/ followed by the id", () => {
    expect(gamePath(3498)).toBe("/games/3498");
  });

  it("gives an address parseGameId reads back as the same id", () => {
    const id = 3498;
    const segment = gamePath(id).slice("/games/".length);
    expect(parseGameId(segment)).toBe(id);
  });
});
