/**
 * decideEntryEdit, what an edit of one watchlist entry does, and
 * editEntrySchema, how the edit form's data is read.
 *
 * An edit is a replace — insert the new version, then remove the old one —
 * so the decision must catch every edit the insert would refuse as a
 * collision with the entry being edited ("same_match"), before anything is
 * written. The expected values come from the change's settled decisions
 * (context/changes/watchlist-entry-edit/change.md) and the unique indexes
 * isPhraseOnList mirrors.
 */
import { describe, expect, it } from "vitest";
import { decideEntryEdit, type EntryEdit } from "@/lib/watchlist/edit";
import { editEntrySchema, entryEditFields } from "@/lib/watchlist/rules";
import type {
  GameEntry,
  PhraseEntry,
  PinnablePlatform,
} from "@/lib/watchlist/types";

const HADES: GameEntry = {
  id: 7,
  kind: "game",
  platform: "ps5",
  game_id: 274755,
  game_slug: "hades",
  game_name: "Hades",
  game_released: "2020-09-17",
};

const HADES_ANY: GameEntry = { ...HADES, id: 8, platform: null };

function phraseEntry(
  phrase: string,
  platform: PinnablePlatform | null = null,
): PhraseEntry {
  return { id: 11, kind: "phrase", platform, phrase };
}

const WIEDZMIN = phraseEntry("Wiedźmin", "ps5");

describe("decideEntryEdit, game entries", () => {
  it("is unchanged on the same platform", () => {
    expect(
      decideEntryEdit(HADES, { phrase: undefined, platform: "ps5" }),
    ).toEqual({ outcome: "unchanged" });
    expect(
      decideEntryEdit(HADES_ANY, { phrase: undefined, platform: null }),
    ).toEqual({ outcome: "unchanged" });
  });

  it("replaces with the catalogue fields copied and the new platform", () => {
    expect(
      decideEntryEdit(HADES, { phrase: undefined, platform: "pc" }),
    ).toEqual({
      outcome: "replace",
      game: {
        gameId: 274755,
        gameSlug: "hades",
        gameName: "Hades",
        gameReleased: "2020-09-17",
        platform: "pc",
      },
    });
  });

  it("copies a missing release date as null", () => {
    const undated: GameEntry = { ...HADES, game_released: null };
    expect(
      decideEntryEdit(undated, { phrase: undefined, platform: "switch" }),
    ).toMatchObject({ outcome: "replace", game: { gameReleased: null } });
  });

  it("replaces a pinned game with any platform, and the other way round", () => {
    expect(
      decideEntryEdit(HADES, { phrase: undefined, platform: null }),
    ).toMatchObject({ outcome: "replace", game: { platform: null } });
    expect(
      decideEntryEdit(HADES_ANY, { phrase: undefined, platform: "ps5" }),
    ).toMatchObject({ outcome: "replace", game: { platform: "ps5" } });
  });

  it("ignores a phrase sent for a game", () => {
    expect(decideEntryEdit(HADES, { phrase: "x", platform: "ps5" })).toEqual({
      outcome: "unchanged",
    });
    const edit = decideEntryEdit(HADES, {
      phrase: "Something else",
      platform: "pc",
    });
    expect(edit).toEqual({
      outcome: "replace",
      game: expect.objectContaining({ gameName: "Hades", platform: "pc" }),
    });
    expect(edit).not.toHaveProperty("phrase");
  });
});

type PhraseRow = {
  name: string;
  entry: PhraseEntry;
  phrase: string | undefined;
  platform: PinnablePlatform | null;
  expected: EntryEdit;
};

const NINETY_NINE = "a".repeat(99);

const PHRASE_ROWS: PhraseRow[] = [
  {
    name: "identical text, same platform → unchanged",
    entry: WIEDZMIN,
    phrase: "Wiedźmin",
    platform: "ps5",
    expected: { outcome: "unchanged" },
  },
  {
    name: "identical text with surrounding spaces → unchanged",
    entry: WIEDZMIN,
    phrase: "  Wiedźmin \t",
    platform: "ps5",
    expected: { outcome: "unchanged" },
  },
  {
    name: "2 characters → invalid_phrase",
    entry: WIEDZMIN,
    phrase: "ab",
    platform: "ps5",
    expected: { outcome: "invalid_phrase" },
  },
  {
    name: "2 characters once trimmed → invalid_phrase",
    entry: WIEDZMIN,
    phrase: "  ab  ",
    platform: "ps5",
    expected: { outcome: "invalid_phrase" },
  },
  {
    name: "blank → invalid_phrase",
    entry: WIEDZMIN,
    phrase: "   ",
    platform: "ps5",
    expected: { outcome: "invalid_phrase" },
  },
  {
    name: "absent → invalid_phrase",
    entry: WIEDZMIN,
    phrase: undefined,
    platform: "ps5",
    expected: { outcome: "invalid_phrase" },
  },
  {
    name: "101 code points, an emoji counted once → invalid_phrase",
    entry: WIEDZMIN,
    phrase: `${"a".repeat(100)}😀`,
    platform: "ps5",
    expected: { outcome: "invalid_phrase" },
  },
  {
    name: "exactly 3 characters → accepted",
    entry: WIEDZMIN,
    phrase: "abc",
    platform: "ps5",
    expected: {
      outcome: "replace",
      phrase: { phrase: "abc", platform: "ps5" },
    },
  },
  {
    name: "exactly 100 code points, 101 UTF-16 units with the emoji → accepted",
    entry: WIEDZMIN,
    phrase: `${NINETY_NINE}😀`,
    platform: "ps5",
    expected: {
      outcome: "replace",
      phrase: { phrase: `${NINETY_NINE}😀`, platform: "ps5" },
    },
  },
  {
    name: "case-only change, same platform → same_match (the lower(phrase) index)",
    entry: phraseEntry("hades", "pc"),
    phrase: "Hades",
    platform: "pc",
    expected: { outcome: "same_match" },
  },
  {
    name: "diacritic-only change, same platform → same_match (the folded index)",
    entry: phraseEntry("wiedzmin", "ps5"),
    phrase: "Wiedźmin",
    platform: "ps5",
    expected: { outcome: "same_match" },
  },
  {
    name: "punctuation-only change, same platform → same_match",
    entry: phraseEntry("Baldur's Gate 3"),
    phrase: "Baldurs Gate 3",
    platform: null,
    expected: { outcome: "same_match" },
  },
  {
    name: "case-only change on another platform → replace",
    entry: phraseEntry("hades", "pc"),
    phrase: "Hades",
    platform: "ps5",
    expected: {
      outcome: "replace",
      phrase: { phrase: "Hades", platform: "ps5" },
    },
  },
  {
    name: "a new text → replace, trimmed",
    entry: WIEDZMIN,
    phrase: "  Cyberpunk 2077 ",
    platform: "ps5",
    expected: {
      outcome: "replace",
      phrase: { phrase: "Cyberpunk 2077", platform: "ps5" },
    },
  },
  {
    name: "two phrases that fold to nothing but differ → replace",
    entry: phraseEntry("!!!"),
    phrase: "???",
    platform: null,
    expected: { outcome: "replace", phrase: { phrase: "???", platform: null } },
  },
  {
    name: "platform-only change → replace with the same phrase",
    entry: WIEDZMIN,
    phrase: "Wiedźmin",
    platform: null,
    expected: {
      outcome: "replace",
      phrase: { phrase: "Wiedźmin", platform: null },
    },
  },
  {
    name: "any platform pinned → replace",
    entry: phraseEntry("Hollow Knight"),
    phrase: "Hollow Knight",
    platform: "switch",
    expected: {
      outcome: "replace",
      phrase: { phrase: "Hollow Knight", platform: "switch" },
    },
  },
];

describe("decideEntryEdit, phrase entries", () => {
  it.each(PHRASE_ROWS)("$name", ({ entry, phrase, platform, expected }) => {
    expect(decideEntryEdit(entry, { phrase, platform })).toEqual(expected);
  });
});

describe("editEntrySchema", () => {
  it("reads a phrase entry's form", () => {
    expect(
      editEntrySchema.parse({ entryId: "42", phrase: " ab ", platform: "pc" }),
    ).toEqual({ entryId: 42, phrase: " ab ", platform: "pc" });
  });

  it("passes an absent phrase as undefined", () => {
    const parsed = editEntrySchema.parse({ entryId: "42", platform: "ps5" });
    expect(parsed.phrase).toBeUndefined();
    expect(parsed).toEqual({ entryId: 42, platform: "ps5" });
  });

  it.each(["1e3", " 7", "0", "", "-1", "0x10", "7.0"])(
    "refuses the entry id %j",
    (entryId) => {
      expect(editEntrySchema.safeParse({ entryId, platform: "" }).success).toBe(
        false,
      );
    },
  );

  it("refuses a missing entry id", () => {
    expect(editEntrySchema.safeParse({ platform: "pc" }).success).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["unknown", "xbox-360"],
    ["other", "other"],
    ["absent", undefined],
  ])("reads an %s platform as any platform", (_name, platform) => {
    expect(
      editEntrySchema.parse({ entryId: "1", phrase: "abc", platform }).platform,
    ).toBeNull();
  });

  it("reads back the hidden field entryEditFields writes", () => {
    const fields = entryEditFields(HADES);
    expect(fields).toEqual({ entryId: "7" });
    expect(editEntrySchema.parse(fields)).toEqual({
      entryId: 7,
      platform: null,
    });
  });
});
