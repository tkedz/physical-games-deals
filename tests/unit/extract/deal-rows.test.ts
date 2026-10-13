/**
 * toDealRows and isListable: what a validated reply becomes in public.deals,
 * and which rows may reach the page.
 *
 * This is row mapping from a fixed model output, not extraction: every reply
 * below is a hand-written ExtractionOutput, so nothing here says whether a
 * model reads a post well. That is the eval's job (scripts/extract/eval.mts).
 *
 * The expected rows come from what the product settled, never from running
 * toDealRows: the table's checks and column comments in
 * supabase/migrations/20260930061813_create_deals.sql (numeric(10,2), price
 * and currency both set or both null, an ISO 4217 code, a discount between 1
 * and 99), the set rule in the prompt (scripts/extract/prompt.mts: one item
 * per game, each with the set's price and the other games in setWith), PRD
 * AC4 (no digital deal is listed) and Guardrails (a false hit costs more than
 * a missed deal), and the expiry rule tested in expiry.test.ts.
 */
import { describe, expect, it } from "vitest";
import { isListable, toDealRows } from "../../../scripts/extract/deals.mts";
import type { PostGroup } from "../../../scripts/extract/prompt.mts";
import type {
  ExtractedItem,
  ExtractionOutput,
} from "../../../scripts/extract/schema.mts";

const SHOP_URL = "https://sklep.example/gra/123";

/** An invented pepper post carrying one shop link. */
const GROUP: PostGroup = {
  post: {
    id: "00000000-0000-4000-8000-000000000001",
    source: "pepper-ps5",
    platform_hint: "ps5",
    title: "Gra testowa (PS5) za 199 zł",
    link: "https://www.pepper.pl/promocje/gra-testowa-ps5-1",
    published_at: "2026-10-21T08:00:00.000Z",
    categories: [],
    content: `<p>Gra testowa w pudełku za 199 zł w <a href="${SHOP_URL}">Sklep Example</a>.</p>`,
    first_seen_at: "2026-10-21T08:05:00.000Z",
  },
  feeds: [{ source: "pepper-ps5", platform_hint: "ps5" }],
};

/** A physical game for 199 PLN with no end and no link; rows override it. */
function item(overrides: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    title: "Gra testowa",
    englishTitle: "Test Game",
    alternativeTitles: [],
    kind: "game",
    editionEvidence: "w pudełku",
    edition: "physical",
    platform: "ps5",
    setWith: [],
    price: { amount: 199, currency: "PLN" },
    discountPercent: null,
    expiresOn: null,
    expiresAt: null,
    shopName: null,
    shopUrl: null,
    ...overrides,
  };
}

/** The single row a one-item reply maps to. */
function rowOf(overrides: Partial<ExtractedItem>) {
  const output: ExtractionOutput = { items: [item(overrides)] };
  const rows = toDealRows(output, GROUP);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe("toDealRows, row mapping (fixed model output)", () => {
  describe("set_with: the other games of a set", () => {
    it("keeps the other games trimmed, without repeats, and drops the item's own titles whatever their case", () => {
      const row = rowOf({
        title: "Wiedźmin 3: Dziki Gon",
        englishTitle: "The Witcher 3: Wild Hunt",
        setWith: [
          " Cyberpunk 2077 ",
          "cyberpunk 2077",
          "WIEDŹMIN 3: DZIKI GON",
          "the witcher 3: wild hunt",
          "",
          "Gwint",
        ],
      });
      expect(row.set_with).toEqual(["Cyberpunk 2077", "Gwint"]);
    });

    it("yields [] for a setWith naming only the item itself: code cannot invent the other game", () => {
      const row = rowOf({
        title: "Splatoon Raiders",
        englishTitle: "Splatoon Raiders",
        setWith: ["Splatoon Raiders"],
      });
      expect(row.set_with).toEqual([]);
    });

    it("gives both rows of a two-game set the set's price undivided, each naming the other game", () => {
      // The prompt's own example: "Splatoon Raiders + Star Fox za 354,78 zł".
      const setPrice = { amount: 354.78, currency: "PLN" };
      const rows = toDealRows(
        {
          items: [
            item({
              title: "Splatoon Raiders",
              englishTitle: "Splatoon Raiders",
              setWith: ["Star Fox"],
              price: setPrice,
            }),
            item({
              title: "Star Fox",
              englishTitle: "Star Fox",
              setWith: ["Splatoon Raiders"],
              price: setPrice,
            }),
          ],
        },
        GROUP,
      );
      expect(
        rows.map((row) => ({
          item_index: row.item_index,
          title: row.title,
          set_with: row.set_with,
          price_amount: row.price_amount,
          currency: row.currency,
        })),
      ).toEqual([
        {
          item_index: 0,
          title: "Splatoon Raiders",
          set_with: ["Star Fox"],
          price_amount: 354.78,
          currency: "PLN",
        },
        {
          item_index: 1,
          title: "Star Fox",
          set_with: ["Splatoon Raiders"],
          price_amount: 354.78,
          currency: "PLN",
        },
      ]);
    });
  });

  describe("price: what numeric(10,2) and an ISO 4217 code hold", () => {
    type PriceRow = {
      name: string;
      price: ExtractedItem["price"];
      amount: number | null;
      currency: string | null;
    };

    const PRICES: PriceRow[] = [
      {
        name: "a price in PLN is kept",
        price: { amount: 199, currency: "PLN" },
        amount: 199,
        currency: "PLN",
      },
      {
        name: "numeric(10,2): rounded to two decimals, down",
        price: { amount: 59.994, currency: "PLN" },
        amount: 59.99,
        currency: "PLN",
      },
      {
        name: "numeric(10,2): rounded to two decimals, up",
        price: { amount: 129.999, currency: "PLN" },
        amount: 130,
        currency: "PLN",
      },
      {
        name: "ISO 4217: zł is PLN",
        price: { amount: 49.9, currency: "zł" },
        amount: 49.9,
        currency: "PLN",
      },
      {
        name: "ISO 4217: ZL is PLN",
        price: { amount: 49.9, currency: "ZL" },
        amount: 49.9,
        currency: "PLN",
      },
      {
        name: "ISO 4217: € is EUR",
        price: { amount: 29.9, currency: "€" },
        amount: 29.9,
        currency: "EUR",
      },
      {
        name: "numeric(10,2): the column's largest value is kept",
        price: { amount: 99_999_999.99, currency: "PLN" },
        amount: 99_999_999.99,
        currency: "PLN",
      },
      {
        name: "numeric(10,2): above the column's largest value nulls both",
        price: { amount: 100_000_000, currency: "PLN" },
        amount: null,
        currency: null,
      },
      {
        name: "a zero price is no price, and nulls both",
        price: { amount: 0, currency: "PLN" },
        amount: null,
        currency: null,
      },
      {
        name: "a price that rounds to zero is no price, and nulls both",
        price: { amount: 0.004, currency: "PLN" },
        amount: null,
        currency: null,
      },
      {
        name: "a negative price is no price, and nulls both",
        price: { amount: -5, currency: "PLN" },
        amount: null,
        currency: null,
      },
      {
        name: "ISO 4217: a four-letter code nulls both",
        price: { amount: 199, currency: "PLNX" },
        amount: null,
        currency: null,
      },
      {
        name: "ISO 4217: a symbol without an alias nulls both",
        price: { amount: 199, currency: "$" },
        amount: null,
        currency: null,
      },
      {
        name: "no price stays no price",
        price: null,
        amount: null,
        currency: null,
      },
    ];

    it.each(PRICES)("$name", ({ price, amount, currency }) => {
      const row = rowOf({ price });
      expect({
        price_amount: row.price_amount,
        currency: row.currency,
      }).toEqual({ price_amount: amount, currency });
    });
  });

  describe("discount_percent: a whole percentage between 1 and 99", () => {
    it.each([
      { stated: 29.6, stored: 30 },
      { stated: 1, stored: 1 },
      { stated: 99, stored: 99 },
      { stated: 0, stored: null },
      { stated: 100, stored: null },
      { stated: null, stored: null },
    ])("$stated is stored as $stored", ({ stated, stored }) => {
      expect(rowOf({ discountPercent: stated }).discount_percent).toBe(stored);
    });
  });

  describe("wiring of the expiry and link rules", () => {
    it("stores the stated end as its Warsaw instant", () => {
      const row = rowOf({ expiresOn: "2026-10-25", expiresAt: "7:00" });
      expect(row.expires_at).toBe("2026-10-25T06:00:00.000Z");
    });

    it("stores no end when the post states none", () => {
      expect(rowOf({}).expires_at).toBeNull();
    });

    it("keeps a shop link the post carries, as written", () => {
      expect(rowOf({ shopUrl: SHOP_URL }).shop_url).toBe(SHOP_URL);
    });

    it("drops a shop link the post does not carry", () => {
      expect(
        rowOf({ shopUrl: "https://sklep.example/inna-gra" }).shop_url,
      ).toBeNull();
    });
  });
});

describe("isListable", () => {
  type ListRow = Parameters<typeof isListable>[0] & {
    name: string;
    listable: boolean;
  };

  const LISTED: ListRow[] = [
    {
      name: "PRD: a physical game with a price is listed",
      kind: "game",
      edition: "physical",
      price_amount: 199,
      listable: true,
    },
    {
      name: "PRD AC4: a digital copy is never listed",
      kind: "game",
      edition: "digital",
      price_amount: 199,
      listable: false,
    },
    {
      name: "PRD Guardrails: unclear stays hidden, a false hit costs more than a missed deal",
      kind: "game",
      edition: "unclear",
      price_amount: 199,
      listable: false,
    },
    {
      name: "PRD: what is not a game is not listed",
      kind: "not_game",
      edition: "physical",
      price_amount: 199,
      listable: false,
    },
    {
      name: "PRD US-01: every listed deal shows a price, so one without is not listed",
      kind: "game",
      edition: "physical",
      price_amount: null,
      listable: false,
    },
  ];

  it.each(LISTED)("$name", ({ kind, edition, price_amount, listable }) => {
    expect(isListable({ kind, edition, price_amount })).toBe(listable);
  });
});
