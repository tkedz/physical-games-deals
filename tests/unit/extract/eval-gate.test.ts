/**
 * The eval gate's logic: how a returned row is scored against its label, how
 * one call becomes per-item gated failures, and how judgeRuns judges the runs
 * of one eval against the last passing record.
 *
 * Nothing here calls a model or reads a record file. Every outcome, label and
 * DealRow below is hand-written, so these are tests of the gate's rules, not
 * of how well any model reads a post — that is what `npm run extract:eval`
 * measures.
 *
 * The expected verdicts come from this change's plan.md (Phase 5, test
 * specification, and the "Baseline" and "Repeated runs" decisions of
 * 2026-10-13): a production model fails on a leak, an unmeasured post, a
 * reply from another model or not being evaluated, in any run; an item fails
 * on a gated failure — missed, wrong game, price, expiry, set or link — its
 * baseline entry lacks; a new item is accepted and recorded; failures only
 * shrink. The bootstrap rows come from
 * context/archive/2026-09-28-physical-deals-from-real-posts/evaluation.md (v3: #49
 * missed, no wrong game and no wrong price for Mistral).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DealRow } from "../../../scripts/extract/deals.mts";
import {
  BOOTSTRAP_BASELINE,
  compareReply,
  itemFailures,
  judgeRuns,
  parseLabels,
  scoreComparison,
  scoreInvalid,
  type EvalRun,
  type GateRecord,
  type ItemFailures,
  type Label,
  type LabelItem,
  type ModelRun,
  type ReturnedItem,
  type RunTotals,
} from "../../../scripts/extract/evaluation.mts";
import type { ExtractedItem } from "../../../scripts/extract/schema.mts";

const MISTRAL = "mistralai/mistral-small-3.2-24b-instruct";
const NANO = "openai/gpt-4.1-nano";
const PRODUCTION = [MISTRAL];

const KEY_A = "post-a#0";
const KEY_B = "post-b#0";

/** A model's run with no leak, nothing unmeasured, every reply its own. */
function modelRun(
  items: ItemFailures,
  totals: Partial<RunTotals> = {},
): ModelRun {
  return {
    totals: { posts: 2, leaks: 0, unmeasured: 0, otherModel: 0, ...totals },
    items,
  };
}

const CLEAN_ITEMS: ItemFailures = { [KEY_A]: [], [KEY_B]: [] };
const BASELINE: GateRecord = { [MISTRAL]: { [KEY_A]: [], [KEY_B]: [] } };

/** Two runs in which Mistral gets every item right. */
function cleanRuns(): EvalRun[] {
  return [
    { [MISTRAL]: modelRun(CLEAN_ITEMS) },
    { [MISTRAL]: modelRun(CLEAN_ITEMS) },
  ];
}

describe("judgeRuns (hand-written run outcomes)", () => {
  const FAILS: {
    name: string;
    baseline: GateRecord;
    runs: EvalRun[];
    models?: string[];
    reason: RegExp;
  }[] = [
    {
      name: "a production model that leaks in run 2 only (plan: each run must pass on its own)",
      baseline: BASELINE,
      runs: [
        { [MISTRAL]: modelRun(CLEAN_ITEMS) },
        { [MISTRAL]: modelRun(CLEAN_ITEMS, { leaks: 1 }) },
      ],
      reason: /mistralai\/mistral-small-3\.2-24b-instruct .*leaks.* in run 2/,
    },
    {
      name: "a production model that leaks in run 1 (PRD Guardrails: no digital deal is listed)",
      baseline: BASELINE,
      runs: [
        { [MISTRAL]: modelRun(CLEAN_ITEMS, { leaks: 2 }) },
        { [MISTRAL]: modelRun(CLEAN_ITEMS) },
      ],
      reason: /mistral.* listed 2 item\(s\).* in run 1/,
    },
    {
      name: "an unmeasured post, which would shrink the denominator",
      baseline: BASELINE,
      runs: [
        { [MISTRAL]: modelRun({ [KEY_A]: [] }, { unmeasured: 1 }) },
        { [MISTRAL]: modelRun(CLEAN_ITEMS) },
      ],
      reason: /left 1 post\(s\) unmeasured in run 1/,
    },
    {
      name: "a reply that came from another model",
      baseline: BASELINE,
      runs: [
        { [MISTRAL]: modelRun(CLEAN_ITEMS) },
        { [MISTRAL]: modelRun(CLEAN_ITEMS, { otherModel: 1 }) },
      ],
      reason: /came from another model in run 2/,
    },
    {
      name: "a production model that was not evaluated",
      baseline: BASELINE,
      runs: [
        { [NANO]: modelRun(CLEAN_ITEMS) },
        { [NANO]: modelRun(CLEAN_ITEMS) },
      ],
      reason: /mistral.* was not evaluated in run 1/,
    },
    {
      name: "an item newly missed against a baseline entry of [] (in run 2 only)",
      baseline: BASELINE,
      runs: [
        { [MISTRAL]: modelRun(CLEAN_ITEMS) },
        { [MISTRAL]: modelRun({ [KEY_A]: ["missed"], [KEY_B]: [] }) },
      ],
      reason: /post-a#0 newly fails missed in run 2 \(baseline: none\)/,
    },
    {
      name: "a new wrong price",
      baseline: BASELINE,
      runs: [
        { [MISTRAL]: modelRun({ [KEY_A]: [], [KEY_B]: ["price"] }) },
        { [MISTRAL]: modelRun(CLEAN_ITEMS) },
      ],
      reason: /post-b#0 newly fails price in run 1/,
    },
    {
      name: "a new failure on an item whose baseline allows another one",
      baseline: { [MISTRAL]: { [KEY_A]: ["missed"], [KEY_B]: [] } },
      runs: [
        {
          [MISTRAL]: modelRun({
            [KEY_A]: ["missed", "wrongGame"],
            [KEY_B]: [],
          }),
        },
        { [MISTRAL]: modelRun({ [KEY_A]: ["missed"], [KEY_B]: [] }) },
      ],
      reason: /post-a#0 newly fails wrongGame in run 1 \(baseline: missed\)/,
    },
    ...(["expiry", "set", "link"] as const).map((failure) => ({
      name: `a new ${failure} failure`,
      baseline: BASELINE,
      runs: [
        { [MISTRAL]: modelRun({ [KEY_A]: [failure], [KEY_B]: [] }) },
        { [MISTRAL]: modelRun(CLEAN_ITEMS) },
      ],
      reason: new RegExp(`post-a#0 newly fails ${failure} in run 1`),
    })),
    {
      name: "a new production model held to its predecessor's entries",
      baseline: BASELINE,
      models: ["example/new-model"],
      runs: [
        { "example/new-model": modelRun({ [KEY_A]: ["missed"], [KEY_B]: [] }) },
        { "example/new-model": modelRun(CLEAN_ITEMS) },
      ],
      reason: /example\/new-model: post-a#0 newly fails missed in run 1/,
    },
  ];

  it.each(FAILS)("fails on $name", ({ baseline, runs, models, reason }) => {
    const judgement = judgeRuns({
      baseline,
      runs,
      models: models ?? PRODUCTION,
    });
    expect(judgement.verdict).toBe("fail");
    expect(judgement.reasons).toContainEqual(expect.stringMatching(reason));
  });

  it("passes when only a candidate outside MODELS leaks", () => {
    const judgement = judgeRuns({
      baseline: BASELINE,
      runs: cleanRuns().map((run) => ({
        ...run,
        [NANO]: modelRun(CLEAN_ITEMS, { leaks: 3 }),
      })),
      models: PRODUCTION,
    });
    expect(judgement).toEqual({
      verdict: "pass",
      reasons: [],
      record: { [MISTRAL]: CLEAN_ITEMS },
    });
  });

  it("passes on a failure the baseline holds (evaluation.md: #49 missed)", () => {
    const items: ItemFailures = {
      ...BOOTSTRAP_BASELINE[MISTRAL],
      "be25eecd82bbf812#0": ["missed"],
    };
    const judgement = judgeRuns({
      baseline: BOOTSTRAP_BASELINE,
      runs: [{ [MISTRAL]: modelRun(items) }, { [MISTRAL]: modelRun(items) }],
      models: PRODUCTION,
    });
    expect(judgement.verdict).toBe("pass");
    expect(judgement.record[MISTRAL]["be25eecd82bbf812#0"]).toEqual(["missed"]);
  });

  it("passes on an item new to the record, and records its failures", () => {
    const judgement = judgeRuns({
      baseline: BASELINE,
      runs: [
        { [MISTRAL]: modelRun({ ...CLEAN_ITEMS, "synthetic-01#0": ["link"] }) },
        { [MISTRAL]: modelRun({ ...CLEAN_ITEMS, "synthetic-01#0": ["set"] }) },
      ],
      models: PRODUCTION,
    });
    expect(judgement.verdict).toBe("pass");
    expect(judgement.record[MISTRAL]["synthetic-01#0"]).toEqual([
      "set",
      "link",
    ]);
  });

  it("passes on an item that improved, and records it as []", () => {
    const judgement = judgeRuns({
      baseline: { [MISTRAL]: { [KEY_A]: ["missed"], [KEY_B]: ["price"] } },
      runs: cleanRuns(),
      models: PRODUCTION,
    });
    expect(judgement).toEqual({
      verdict: "pass",
      reasons: [],
      record: { [MISTRAL]: { [KEY_A]: [], [KEY_B]: [] } },
    });
  });

  it("records the union of both runs' failures, in gate order", () => {
    const judgement = judgeRuns({
      baseline: { [MISTRAL]: { [KEY_A]: ["price", "expiry"], [KEY_B]: [] } },
      runs: [
        { [MISTRAL]: modelRun({ [KEY_A]: ["expiry"], [KEY_B]: [] }) },
        { [MISTRAL]: modelRun({ [KEY_A]: ["price"], [KEY_B]: [] }) },
      ],
      models: PRODUCTION,
    });
    expect(judgement.verdict).toBe("pass");
    expect(judgement.record[MISTRAL][KEY_A]).toEqual(["price", "expiry"]);
  });

  it("passes a new production model that does as well as its predecessor, recording it under its own id", () => {
    const judgement = judgeRuns({
      baseline: BASELINE,
      runs: [
        { "example/new-model": modelRun(CLEAN_ITEMS) },
        { "example/new-model": modelRun(CLEAN_ITEMS) },
      ],
      models: ["example/new-model"],
    });
    expect(judgement.verdict).toBe("pass");
    expect(Object.keys(judgement.record)).toEqual(["example/new-model"]);
  });

  it("fails when no run was made", () => {
    const judgement = judgeRuns({
      baseline: BASELINE,
      runs: [],
      models: PRODUCTION,
    });
    expect(judgement.verdict).toBe("fail");
  });
});

describe("BOOTSTRAP_BASELINE (evaluation.md, prompt version 3)", () => {
  const labelsFile = parseLabels(
    JSON.parse(
      readFileSync(
        new URL("../../../scripts/extract/eval/labels.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  if (!labelsFile.ok) throw new Error(labelsFile.reason);
  const labels = labelsFile.value;
  const entries = BOOTSTRAP_BASELINE[MISTRAL];

  it("holds Mistral only, the one production model v3 measured", () => {
    expect(Object.keys(BOOTSTRAP_BASELINE)).toEqual([MISTRAL]);
  });

  it("lists the 55 items of the original labels, and no synthetic one", () => {
    const keys = Object.keys(entries);
    expect(keys).toHaveLength(55);
    expect(keys.filter((key) => key.startsWith("synthetic-"))).toEqual([]);
    const labelled = new Set(
      labels.flatMap((label) =>
        label.items.map((_, index) => `${label.postId}#${index}`),
      ),
    );
    expect(keys.filter((key) => !labelled.has(key))).toEqual([]);
  });

  it("allows #49 (No More Heroes 3, the 49th label) to be missed, and nothing else", () => {
    const fortyNinth = labels[48];
    expect(fortyNinth.items[0].englishTitle).toBe("No More Heroes 3");
    expect(entries[`${fortyNinth.postId}#0`]).toEqual(["missed"]);
    const others = Object.entries(entries).filter(
      ([key]) => key !== `${fortyNinth.postId}#0`,
    );
    expect(others.every(([, failures]) => failures.length === 0)).toBe(true);
  });
});

// Scoring: hand-written rows paired against hand-written labels.

/** A listable physical game on PS5 for 199 PLN, with no end, set or link. */
function labelItem(overrides: Partial<LabelItem> = {}): LabelItem {
  return {
    kind: "game",
    edition: "physical",
    englishTitle: "Test Game",
    platform: "ps5",
    price: { amount: 199, currency: "PLN" },
    discountPercent: null,
    expiresAt: null,
    ...overrides,
  };
}

/** The row a correct reply for labelItem() maps to; tests override fields. */
function dealRow(overrides: Partial<DealRow> = {}): DealRow {
  return {
    link: "https://www.pepper.pl/promocje/test-game-1",
    item_index: 0,
    source: "pepper-ps5",
    published_at: "2026-10-21T10:00:00.000Z",
    kind: "game",
    edition: "physical",
    platform: "ps5",
    title: "Test Game",
    english_title: "Test Game",
    alternative_titles: [],
    set_with: [],
    price_amount: 199,
    currency: "PLN",
    discount_percent: null,
    expires_at: null,
    shop_url: null,
    shop_name: null,
    edition_evidence: null,
    ...overrides,
  };
}

// The scoring reads the row only; the item it came from is a placeholder.
const ITEM: ExtractedItem = {
  title: "Test Game",
  englishTitle: "Test Game",
  alternativeTitles: [],
  kind: "game",
  editionEvidence: null,
  edition: "physical",
  platform: "ps5",
  setWith: [],
  price: { amount: 199, currency: "PLN" },
  discountPercent: null,
  expiresOn: null,
  expiresAt: null,
  shopName: null,
  shopUrl: null,
};

function returned(row: Partial<DealRow>): ReturnedItem {
  return { item: ITEM, row: dealRow(row) };
}

/** The fields one listed row gets wrong against one label item. */
function wrongFields(expected: LabelItem, row: Partial<DealRow>) {
  const { items } = compareReply([expected], [returned(row)]);
  expect(items[0].mark).toBe("listed");
  return items[0].fields;
}

describe("scoring a listed row against its label (hand-written rows)", () => {
  const SHOP = "https://sklep.example/test-game";

  const ROWS: {
    name: string;
    expected: LabelItem;
    row: Partial<DealRow>;
    fields: string[];
  }[] = [
    {
      name: "a set label with an empty set_with is a set failure",
      expected: labelItem({ setWith: ["Other Game"] }),
      row: { set_with: [] },
      fields: ["set"],
    },
    {
      name: "a non-set label (setWith []) with a non-empty set_with is a set failure",
      expected: labelItem({ setWith: [] }),
      row: { set_with: ["Other Game"] },
      fields: ["set"],
    },
    {
      name: "a set label with a set_with naming another game is right",
      expected: labelItem({ setWith: ["Other Game"] }),
      row: { set_with: ["Other Game"] },
      fields: [],
    },
    {
      name: "a label without setWith does not score the set",
      expected: labelItem(),
      row: { set_with: ["Other Game"] },
      fields: [],
    },
    {
      name: "a label shopUrl null with a row shop_url null is right (the deal links to the post)",
      expected: labelItem({ shopUrl: null }),
      row: { shop_url: null },
      fields: [],
    },
    {
      name: "a label shopUrl with the row's link dropped is a link failure",
      expected: labelItem({ shopUrl: SHOP }),
      row: { shop_url: null },
      fields: ["link"],
    },
    {
      name: "a label shopUrl null with a kept link is a link failure",
      expected: labelItem({ shopUrl: null }),
      row: { shop_url: SHOP },
      fields: ["link"],
    },
    {
      name: "a label without shopUrl does not score the link",
      expected: labelItem(),
      row: { shop_url: SHOP },
      fields: [],
    },
    {
      name: "expiry compares instants: …T23:00:00Z equals …T23:00:00.000Z",
      expected: labelItem({ expiresAt: "2026-10-31T23:00:00Z" }),
      row: { expires_at: "2026-10-31T23:00:00.000Z" },
      fields: [],
    },
    {
      name: "a stated end the row lost is an expiry failure",
      expected: labelItem({ expiresAt: "2026-10-25T06:00:00Z" }),
      row: { expires_at: null },
      fields: ["expiry"],
    },
    {
      name: "an end on the wrong hour is an expiry failure",
      expected: labelItem({ expiresAt: "2026-10-25T06:00:00Z" }),
      row: { expires_at: "2026-10-25T23:00:00.000Z" },
      fields: ["expiry"],
    },
    {
      name: "an end the post never stated is an expiry failure",
      expected: labelItem(),
      row: { expires_at: "2026-10-25T23:00:00.000Z" },
      fields: ["expiry"],
    },
  ];

  it.each(ROWS)("$name", ({ expected, row, fields }) => {
    expect(wrongFields(expected, row)).toEqual(fields);
  });
});

describe("itemFailures: one call as per-item gated failures (hand-written comparisons)", () => {
  const PHYSICAL = labelItem({ englishTitle: "Test Game" });
  const DIGITAL = labelItem({
    englishTitle: "Digital Game",
    edition: "digital",
  });
  const LABEL: Label = {
    postId: "post-x",
    note: "A hand-written label: one physical game, one digital.",
    items: [PHYSICAL, DIGITAL],
  };

  function failuresOf(rows: Partial<DealRow>[]) {
    const comparison = compareReply(LABEL.items, rows.map(returned));
    const record = {
      outcome: "reply" as const,
      score: scoreComparison(LABEL.items, comparison),
      answeredBy: MISTRAL,
      usage: {
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
        costUsd: null,
      },
      latencyMs: 0,
    };
    return itemFailures(LABEL, { record, comparison });
  }

  it("lists every labelled item, right ones as []", () => {
    expect(
      failuresOf([
        {},
        {
          english_title: "Digital Game",
          title: "Digital Game",
          edition: "digital",
        },
      ]),
    ).toEqual({ "post-x#0": [], "post-x#1": [] });
  });

  it("marks a listable item nothing paired with as missed", () => {
    expect(failuresOf([])).toEqual({ "post-x#0": ["missed"], "post-x#1": [] });
  });

  it("marks a listable item returned unlisted as missed", () => {
    expect(failuresOf([{ edition: "unclear" }])).toEqual({
      "post-x#0": ["missed"],
      "post-x#1": [],
    });
  });

  it("gates a wrong price but only reports a wrong platform", () => {
    expect(failuresOf([{ price_amount: 149, platform: "ps4" }])).toEqual({
      "post-x#0": ["price"],
      "post-x#1": [],
    });
  });

  it("charges a wrong game to the post's first physical game", () => {
    expect(
      failuresOf([
        {},
        { english_title: "Unrelated Title", title: "Unrelated Title" },
      ]),
    ).toEqual({ "post-x#0": ["wrongGame"], "post-x#1": [] });
  });

  it("counts an invalid reply as every listable item missed", () => {
    expect(
      itemFailures(LABEL, {
        record: {
          outcome: "invalid",
          score: scoreInvalid(LABEL.items),
          failure: {
            ok: false,
            reason: "invalid_reply",
            scope: "post",
            status: 200,
            detail: null,
          },
          latencyMs: 0,
        },
        comparison: null,
      }),
    ).toEqual({ "post-x#0": ["missed"], "post-x#1": [] });
  });

  it("yields nothing for an unmeasured call, which judgeRuns fails on its own", () => {
    expect(
      itemFailures(LABEL, {
        record: {
          outcome: "unmeasured",
          failure: {
            ok: false,
            reason: "unavailable",
            scope: "systemic",
            status: 503,
            detail: null,
          },
          latencyMs: 0,
        },
        comparison: null,
      }),
    ).toEqual({});
  });
});
