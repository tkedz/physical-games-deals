/**
 * The evaluation's decisions: validating the labelled set and the exported
 * posts, pairing the items a model returned with the labelled ones, counting
 * what went wrong, ranking the candidates by the rule evaluation.md applies,
 * and judging the runs against the last passing record (judgeRuns).
 *
 * A module of its own rather than code in eval.mts, because that file calls
 * main() at the top level — the split scripts/catalog/coverage.mts makes for
 * the catalogue probe. Nothing here has a top-level side effect, so every
 * decision can be imported and called with data the day a test runner
 * arrives.
 */
import { z } from "zod";
// Whole-statement type imports: Node erases them entirely.
import type { DealKind, Edition, Platform } from "../../src/lib/deals/types.ts";
import type { CompletionResult, Failure, Usage } from "./openrouter.mts";
import type { PostGroup } from "./prompt.mts";
import { normalizeTitle } from "../catalog/coverage.mts";
import { isListable, toDealRows, type DealRow } from "./deals.mts";
import { isSameModel } from "./openrouter.mts";
import {
  editionSchema,
  kindSchema,
  platformSchema,
  type ExtractedItem,
  type ExtractionOutput,
} from "./schema.mts";

/** One item a labelled post should yield. */
export type LabelItem = {
  kind: DealKind;
  edition: Edition;
  englishTitle: string;
  platform: Platform | null;
  price: { amount: number; currency: string } | null;
  discountPercent: number | null;
  /**
   * The expected `expires_at`: the exclusive end instant, ISO in UTC, as
   * expiryInstant in deals.mts states it from the post's own words. Null for
   * a post that states no end.
   */
  expiresAt: string | null;
  /**
   * The other games of a set, non-empty for a game sold in one; `[]` for an
   * item sold on its own. Absent: the set is not scored for this item.
   */
  setWith?: string[];
  /**
   * The expected stored `shop_url`; null when the deal should link to the
   * post. Absent: the link is not scored for this item.
   */
  shopUrl?: string | null;
};

/** What one post should yield, keyed by the id of its representative row. */
export type Label = {
  postId: string;
  /** The trap the post covers, or why it is in the set. */
  note: string;
  items: LabelItem[];
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

// Strict, so a misspelt key fails loudly instead of reading as a missing value.
const labelItemSchema = z.strictObject({
  kind: kindSchema,
  edition: editionSchema,
  englishTitle: z.string().min(1),
  platform: platformSchema.nullable(),
  price: z
    .strictObject({
      amount: z.number().positive(),
      currency: z.string().regex(/^[A-Z]{3}$/),
    })
    .nullable(),
  discountPercent: z.int().min(1).max(99).nullable(),
  expiresAt: z.iso.datetime().nullable(),
  setWith: z.array(z.string().min(1)).optional(),
  shopUrl: z.string().min(1).nullable().optional(),
});

const labelSchema = z.strictObject({
  postId: z.string().min(1),
  note: z.string(),
  items: z.array(labelItemSchema),
});

// The shape the sample query exports: one representative row per link, and
// the feeds of every row sharing it. Not strict: a column added to
// collected_posts later is dropped rather than rejected.
const postGroupSchema = z.object({
  post: z.object({
    id: z.string().min(1),
    source: z.string().min(1),
    platform_hint: z.string(),
    title: z.string().nullable(),
    link: z.string().min(1),
    published_at: z.string().nullable(),
    categories: z.array(z.string()),
    content: z.string().nullable(),
    first_seen_at: z.string().min(1),
  }),
  feeds: z
    .array(z.object({ source: z.string().min(1), platform_hint: z.string() }))
    .min(1),
});

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const field =
    issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : "";
  return `${field}${issue.message}`;
}

/** Validates the parsed labels.json. A failure names the first bad label. */
export function parseLabels(data: unknown): Parsed<Label[]> {
  if (!Array.isArray(data)) {
    return { ok: false, reason: "labels.json must be an array" };
  }
  if (data.length === 0) {
    return { ok: false, reason: "labels.json holds no labels" };
  }

  const labels: Label[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of data.entries()) {
    const parsed = labelSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        reason: `label ${index + 1} is malformed — ${firstIssue(parsed.error)}`,
      };
    }
    if (seen.has(parsed.data.postId)) {
      return {
        ok: false,
        reason: `label ${index + 1} repeats post ${parsed.data.postId}`,
      };
    }
    seen.add(parsed.data.postId);
    labels.push(parsed.data);
  }
  return { ok: true, value: labels };
}

/**
 * The sample query's `posts` cell out of the result row around it. The
 * Supabase SQL editor exports a result as an array of rows, so a saved export
 * is `[{ "posts": [...] }]`; the cell value alone passes through unchanged.
 */
function unwrapResultRow(data: unknown): unknown {
  if (!Array.isArray(data) || data.length !== 1) return data;
  const [row] = data;
  return typeof row === "object" &&
    row !== null &&
    !Array.isArray(row) &&
    "posts" in row
    ? (row as { posts: unknown }).posts
    : data;
}

/**
 * Validates the parsed posts.json — the query's `posts` cell, or the result
 * row holding it — or synthetic-posts.json, which has the cell's shape. A
 * failure names the file and its first bad post.
 */
export function parsePosts(
  data: unknown,
  name = "posts.json",
): Parsed<PostGroup[]> {
  const cell = unwrapResultRow(data);
  if (!Array.isArray(cell)) {
    return {
      ok: false,
      reason: `${name} must be the JSON array the sample query returns`,
    };
  }

  const groups: PostGroup[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of cell.entries()) {
    const parsed = postGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        reason: `${name}: post ${index + 1} is malformed — ${firstIssue(parsed.error)}`,
      };
    }
    if (seen.has(parsed.data.post.id)) {
      return {
        ok: false,
        reason: `${name}: post ${index + 1} repeats id ${parsed.data.post.id}`,
      };
    }
    seen.add(parsed.data.post.id);
    groups.push(parsed.data);
  }
  return { ok: true, value: groups };
}

/** A labelled item that should reach the page. */
export function isListableLabel(item: LabelItem): boolean {
  return isListable({
    kind: item.kind,
    edition: item.edition,
    price_amount: item.price?.amount ?? null,
  });
}

function isPhysicalGame(item: LabelItem): boolean {
  return item.kind === "game" && item.edition === "physical";
}

// Words that name an edition rather than a game, the leading article, and the
// "s" an apostrophe leaves once normalizeTitle has turned it into a space — so
// that "Marvel's Spider-Man 2 Deluxe Edition" and "Marvel's Spider-Man 2" pair.
const NOISE_WORDS = new Set([
  "the",
  "s",
  "edition",
  "edycja",
  "edycji",
  "deluxe",
  "gold",
  "ultimate",
  "standard",
  "complete",
  "definitive",
  "goty",
  "collector",
  "collectors",
  "kolekcjonerska",
  "limited",
  "special",
  "premium",
]);

/**
 * A title reduced to the words that tell two games apart. Whatever
 * normalizeTitle leaves besides letters and digits — "/", "+", "!" — splits
 * words too, so that "Final Fantasy X/X-2" and "Final Fantasy X X-2" pair.
 */
export function titleKey(title: string): string {
  return normalizeTitle(title.replace(/&/g, " and "))
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word !== "" && !NOISE_WORDS.has(word))
    .join(" ");
}

/** `same` when the keys are equal, `close` when one extends the other by whole words. */
type TitleMatch = "same" | "close" | null;

function matchTitles(expected: string, returned: string): TitleMatch {
  const a = titleKey(expected);
  const b = titleKey(returned);
  if (a === "" || b === "") return null;
  if (a === b) return "same";
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  return longer.startsWith(`${shorter} `) ? "close" : null;
}

/** The best match between a labelled title and any name the row carries. */
function bestMatch(expected: LabelItem, row: DealRow): TitleMatch {
  let best: TitleMatch = null;
  for (const name of [
    row.english_title,
    row.title,
    ...row.alternative_titles,
  ]) {
    const match = matchTitles(expected.englishTitle, name);
    if (match === "same") return "same";
    if (match === "close") best = "close";
  }
  return best;
}

/** The share of words two titles have in common: the loose test that only ever finds a leak. */
function overlap(a: string, b: string): number {
  const left = new Set(titleKey(a).split(" ").filter(Boolean));
  const right = new Set(titleKey(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** A returned item together with the row it became. */
export type ReturnedItem = { item: ExtractedItem; row: DealRow };

/**
 * What became of one returned item:
 * - `listed`: listed, and the label expects a physical game there;
 * - `leak`: listed, while the label says it is not a physical game;
 * - `extra offer`: listed, another shop's or platform's offer for a physical
 *   game the label names once — not an error;
 * - `wrong game`: listed, and it matches nothing in the label;
 * - `missed`: not listed, while the label expects it listed;
 * - `rejected`: not listed, and not expected listed.
 */
export type Mark =
  "listed" | "leak" | "extra offer" | "wrong game" | "missed" | "rejected";

/**
 * A field of a listed item that disagrees with its label. `expiry`, `set` and
 * `link` are judged on the stored row: the instant in `expires_at`, whether
 * `set_with` names other games, and the `shop_url` that survived
 * verifyShopUrl.
 */
export type FieldName =
  "price" | "currency" | "platform" | "discount" | "expiry" | "set" | "link";

export const FIELD_NAMES: readonly FieldName[] = [
  "price",
  "currency",
  "platform",
  "discount",
  "expiry",
  "set",
  "link",
];

export type MarkedItem = ReturnedItem & {
  mark: Mark;
  expected: LabelItem | null;
  /** The paired label item's index in `label.items`; null when unpaired. */
  expectedIndex: number | null;
  /** On a listed item, the fields that disagree with the label. */
  fields: FieldName[];
  /** Paired by a close title rather than the same one. */
  titleDiffers: boolean;
  /** On a missed item, why it was not listed. */
  why: string[];
};

export type Comparison = {
  items: MarkedItem[];
  /** Labelled items that should be listed and that nothing returned paired with. */
  unpaired: LabelItem[];
};

/**
 * Whether two ISO instants, or two nulls, name the same moment: written
 * differently, "…T23:00:00Z" and "…T23:00:00.000Z" are one instant.
 */
function sameInstant(expected: string | null, stored: string | null): boolean {
  if (expected === null || stored === null) return expected === stored;
  const a = Date.parse(expected);
  const b = Date.parse(stored);
  return Number.isFinite(a) && a === b;
}

function fieldErrors(expected: LabelItem, { row }: ReturnedItem) {
  const fields: FieldName[] = [];
  const price = expected.price;
  const priceDiffers =
    price === null
      ? row.price_amount !== null
      : row.price_amount === null ||
        Math.abs(price.amount - row.price_amount) > 0.005;
  if (priceDiffers) fields.push("price");
  if (
    price !== null &&
    row.currency !== null &&
    price.currency !== row.currency
  ) {
    fields.push("currency");
  }
  if (expected.platform !== row.platform) fields.push("platform");
  if (expected.discountPercent !== row.discount_percent)
    fields.push("discount");
  if (!sameInstant(expected.expiresAt, row.expires_at)) fields.push("expiry");
  // A set is judged by whether the row names other games at all: the card's
  // set note shows when set_with is non-empty.
  if (
    expected.setWith !== undefined &&
    expected.setWith.length > 0 !== row.set_with.length > 0
  ) {
    fields.push("set");
  }
  if (expected.shopUrl !== undefined && expected.shopUrl !== row.shop_url) {
    fields.push("link");
  }
  return fields;
}

function whyNotListed(row: DealRow): string[] {
  const why: string[] = [];
  if (row.kind !== "game") why.push(`kind ${row.kind}`);
  if (row.edition !== "physical") why.push(`edition ${row.edition}`);
  if (row.price_amount === null) why.push("no price");
  return why;
}

// Strictest first: the same title on the same platform at the same price —
// so that of two shops' offers the one the label names pairs, whichever the
// reply gives first — then the same title and platform, a close title on it,
// and the title alone: a wrong platform is a field error, not another item.
const PAIRING_PASSES = [
  { title: "same", samePlatform: true, samePrice: true },
  { title: "same", samePlatform: true, samePrice: false },
  { title: "close", samePlatform: true, samePrice: false },
  { title: "same", samePlatform: false, samePrice: false },
  { title: "close", samePlatform: false, samePrice: false },
] as const;

function isSamePrice(expected: LabelItem, row: DealRow): boolean {
  if (expected.price === null || row.price_amount === null) {
    return expected.price === null && row.price_amount === null;
  }
  return Math.abs(expected.price.amount - row.price_amount) <= 0.005;
}

/**
 * Pairs the returned items with the labelled ones and marks each returned
 * item. An unpaired listed item counts as a leak when it resembles a labelled
 * item that is not a physical game, or when the label expects no physical
 * game at all — a leak is the one error that disqualifies a model, so
 * doubtful cases land there.
 */
export function compareReply(
  expected: LabelItem[],
  returned: ReturnedItem[],
): Comparison {
  const pairOf = new Map<number, number>();
  const taken = new Set<number>();

  for (const pass of PAIRING_PASSES) {
    returned.forEach(({ row }, r) => {
      if (pairOf.has(r)) return;
      const e = expected.findIndex((item, i) => {
        if (taken.has(i)) return false;
        if (pass.samePlatform && item.platform !== row.platform) return false;
        if (pass.samePrice && !isSamePrice(item, row)) return false;
        const match = bestMatch(item, row);
        return pass.title === "same" ? match === "same" : match !== null;
      });
      if (e !== -1) {
        pairOf.set(r, e);
        taken.add(e);
      }
    });
  }

  const expectsPhysicalGame = expected.some(isPhysicalGame);

  const items = returned.map((entry, r): MarkedItem => {
    const e = pairOf.get(r);
    const paired = e === undefined ? null : expected[e];
    const listed = isListable(entry.row);
    const base = {
      ...entry,
      expected: paired,
      expectedIndex: e ?? null,
      fields: [] as FieldName[],
      titleDiffers: false,
      why: [] as string[],
    };

    if (paired === null) {
      if (!listed) return { ...base, mark: "rejected" };
      // The leak test comes first: a doubtful listing must not pass as an
      // extra offer.
      const resemblesRejected = expected.some(
        (item) =>
          !isPhysicalGame(item) &&
          overlap(item.englishTitle, entry.row.english_title) >= 0.5,
      );
      if (resemblesRejected || !expectsPhysicalGame) {
        return { ...base, mark: "leak" };
      }
      const repeatsPhysicalGame = expected.some(
        (item) => isPhysicalGame(item) && bestMatch(item, entry.row) !== null,
      );
      return {
        ...base,
        mark: repeatsPhysicalGame ? "extra offer" : "wrong game",
      };
    }

    const titleDiffers =
      matchTitles(paired.englishTitle, entry.row.english_title) !== "same";
    if (listed && !isPhysicalGame(paired)) {
      return { ...base, mark: "leak", titleDiffers };
    }
    if (listed) {
      return {
        ...base,
        mark: "listed",
        fields: fieldErrors(paired, entry),
        titleDiffers,
      };
    }
    if (isListableLabel(paired)) {
      return {
        ...base,
        mark: "missed",
        titleDiffers,
        why: whyNotListed(entry.row),
      };
    }
    return { ...base, mark: "rejected", titleDiffers };
  });

  const unpaired = expected.filter(
    (item, i) => !taken.has(i) && isListableLabel(item),
  );
  return { items, unpaired };
}

export type PostScore = {
  expectedListable: number;
  listed: number;
  leaks: number;
  missed: number;
  wrongGame: number;
  fields: Record<FieldName, number>;
  titleDiffers: number;
};

function emptyFields(): Record<FieldName, number> {
  return {
    price: 0,
    currency: 0,
    platform: 0,
    discount: 0,
    expiry: 0,
    set: 0,
    link: 0,
  };
}

/** The counts one valid reply comes to. */
export function scoreComparison(
  expected: LabelItem[],
  comparison: Comparison,
): PostScore {
  const score: PostScore = {
    expectedListable: expected.filter(isListableLabel).length,
    listed: 0,
    leaks: 0,
    missed: comparison.unpaired.length,
    wrongGame: 0,
    fields: emptyFields(),
    titleDiffers: 0,
  };
  for (const item of comparison.items) {
    if (item.mark === "listed") score.listed += 1;
    if (item.mark === "leak") score.leaks += 1;
    if (item.mark === "missed") score.missed += 1;
    if (item.mark === "wrong game") score.wrongGame += 1;
    if (item.titleDiffers) score.titleDiffers += 1;
    for (const field of item.fields) score.fields[field] += 1;
  }
  return score;
}

/**
 * The counts an invalid reply comes to: every item the label expects listed is
 * missed, because in production that post would be retried and, failing
 * again, given up.
 */
export function scoreInvalid(expected: LabelItem[]): PostScore {
  const expectedListable = expected.filter(isListableLabel).length;
  return {
    expectedListable,
    listed: 0,
    leaks: 0,
    missed: expectedListable,
    wrongGame: 0,
    fields: emptyFields(),
    titleDiffers: 0,
  };
}

/**
 * One call as the evaluation counts it. A post-scope failure is an `invalid`
 * reply and counts against the model; a systemic one leaves the post
 * `unmeasured`, because it says nothing about how the model reads posts.
 */
export type CallRecord =
  | {
      outcome: "reply";
      score: PostScore;
      answeredBy: string;
      usage: Usage;
      latencyMs: number;
    }
  | {
      outcome: "invalid";
      score: PostScore;
      failure: Failure;
      latencyMs: number;
    }
  | { outcome: "unmeasured"; failure: Failure; latencyMs: number };

/** Scores one call against its label, through the same toDealRows the pipeline uses. */
export function measureCall(
  label: Label,
  group: PostGroup,
  result: CompletionResult<ExtractionOutput>,
  latencyMs: number,
): { record: CallRecord; comparison: Comparison | null } {
  if (result.ok) {
    const rows = toDealRows(result.output, group);
    const returned = result.output.items.map((item, index) => ({
      item,
      row: rows[index],
    }));
    const comparison = compareReply(label.items, returned);
    return {
      comparison,
      record: {
        outcome: "reply",
        score: scoreComparison(label.items, comparison),
        answeredBy: result.model,
        usage: result.usage,
        latencyMs,
      },
    };
  }
  if (result.scope === "post") {
    return {
      comparison: null,
      record: {
        outcome: "invalid",
        score: scoreInvalid(label.items),
        failure: result,
        latencyMs,
      },
    };
  }
  return {
    comparison: null,
    record: { outcome: "unmeasured", failure: result, latencyMs },
  };
}

export type Tally = {
  posts: number;
  replies: number;
  invalid: number;
  unmeasured: number;
  expectedListable: number;
  listed: number;
  leaks: number;
  missed: number;
  wrongGame: number;
  fields: Record<FieldName, number>;
  titleDiffers: number;
  /** Distinct models that answered. */
  answeredBy: string[];
  /** Replies from a model other than the one asked. */
  otherModel: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  costUsd: number;
  latenciesMs: number[];
  /** Failed calls by reason, with the first detail seen for each. */
  failures: Partial<
    Record<Failure["reason"], { count: number; detail: string | null }>
  >;
};

/** Adds up one candidate's calls. */
export function tallyCalls(asked: string, calls: CallRecord[]): Tally {
  const tally: Tally = {
    posts: calls.length,
    replies: 0,
    invalid: 0,
    unmeasured: 0,
    expectedListable: 0,
    listed: 0,
    leaks: 0,
    missed: 0,
    wrongGame: 0,
    fields: emptyFields(),
    titleDiffers: 0,
    answeredBy: [],
    otherModel: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    costUsd: 0,
    latenciesMs: [],
    failures: {},
  };

  for (const call of calls) {
    if (call.outcome === "unmeasured" || call.outcome === "invalid") {
      const seen = tally.failures[call.failure.reason];
      tally.failures[call.failure.reason] = {
        count: (seen?.count ?? 0) + 1,
        detail: seen?.detail ?? call.failure.detail,
      };
    }
    if (call.outcome === "unmeasured") {
      tally.unmeasured += 1;
      continue;
    }

    const { score } = call;
    tally.expectedListable += score.expectedListable;
    tally.listed += score.listed;
    tally.leaks += score.leaks;
    tally.missed += score.missed;
    tally.wrongGame += score.wrongGame;
    tally.titleDiffers += score.titleDiffers;
    for (const field of FIELD_NAMES) tally.fields[field] += score.fields[field];

    if (call.outcome === "invalid") {
      tally.invalid += 1;
      continue;
    }

    tally.replies += 1;
    tally.latenciesMs.push(call.latencyMs);
    if (!tally.answeredBy.includes(call.answeredBy)) {
      tally.answeredBy.push(call.answeredBy);
    }
    if (!isSameModel(asked, call.answeredBy)) tally.otherModel += 1;
    tally.promptTokens += call.usage.promptTokens ?? 0;
    tally.completionTokens += call.usage.completionTokens ?? 0;
    tally.reasoningTokens += call.usage.reasoningTokens ?? 0;
    tally.costUsd += call.usage.costUsd ?? 0;
  }
  return tally;
}

export function totalFieldErrors(tally: Tally): number {
  return FIELD_NAMES.reduce((sum, field) => sum + tally.fields[field], 0);
}

export type Ranked = {
  model: string;
  tally: Tally;
  eligible: boolean;
  /** Why a model is not eligible; null when it is. */
  reason: string | null;
};

/**
 * The rule evaluation.md applies. Only a model with zero digital leaks is
 * eligible — and only when its zero is a measurement: it answered at all, so
 * the request shape was accepted, every post was measured, and every reply
 * came from the model asked. Among the eligible, the fewest missed physical
 * deals wins, then the fewest field errors, then the lowest cost.
 */
export function rankModels(
  tallies: { model: string; tally: Tally }[],
): Ranked[] {
  const ranked = tallies.map(({ model, tally }): Ranked => {
    const reasons: string[] = [];
    if (tally.replies === 0)
      reasons.push("no valid reply, so no accepted request shape");
    if (tally.leaks > 0) reasons.push(`${tally.leaks} digital leak(s)`);
    if (tally.unmeasured > 0)
      reasons.push(`${tally.unmeasured} post(s) unmeasured`);
    if (tally.otherModel > 0) {
      reasons.push(`${tally.otherModel} reply(ies) from another model`);
    }
    return {
      model,
      tally,
      eligible: reasons.length === 0,
      reason: reasons.length === 0 ? null : reasons.join("; "),
    };
  });

  return ranked.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      a.tally.missed - b.tally.missed ||
      totalFieldErrors(a.tally) - totalFieldErrors(b.tally) ||
      a.tally.costUsd - b.tally.costUsd,
  );
}

/** The nearest-rank percentile of the values, or null when there are none. */
export function percentile(
  values: readonly number[],
  share: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(
    Math.max(Math.ceil(share * sorted.length), 1),
    sorted.length,
  );
  return sorted[rank - 1];
}

/**
 * The failures the gate blocks on. `missed` and `wrongGame` come from the
 * marks, the others from the fields of a listed item. `currency`, `platform`
 * and `discount` stay reported only.
 */
export type GatedFailure =
  "missed" | "wrongGame" | "price" | "expiry" | "set" | "link";

export const GATED_FAILURES: readonly GatedFailure[] = [
  "missed",
  "wrongGame",
  "price",
  "expiry",
  "set",
  "link",
];

const GATED_FIELDS: ReadonlySet<FieldName> = new Set<FieldName>([
  "price",
  "expiry",
  "set",
  "link",
]);

/** A labelled item's key: its post and its index in `label.items`. */
export function itemKey(postId: string, index: number): string {
  return `${postId}#${index}`;
}

/** Item key → the gated failures it showed, `[]` when it was right. */
export type ItemFailures = Record<string, GatedFailure[]>;

function inGateOrder(failures: Iterable<GatedFailure>): GatedFailure[] {
  const set = new Set(failures);
  return GATED_FAILURES.filter((failure) => set.has(failure));
}

/**
 * The gated failures of every labelled item of one post in one call, keyed by
 * itemKey, the items that came back right included as `[]`:
 * - an invalid reply misses every item the label expects listed, as
 *   scoreInvalid counts it;
 * - an unpaired listable item is missed;
 * - a field error on a listed item is its own failure;
 * - a `wrong game` pairs with no labelled item, so it is charged to the
 *   post's first physical game — a wrong game is only ever marked in a post
 *   that expects one.
 *
 * An unmeasured call yields nothing: it says nothing about the items, and
 * judgeRuns fails the run on it.
 */
export function itemFailures(
  label: Label,
  call: { record: CallRecord; comparison: Comparison | null },
): ItemFailures {
  if (call.record.outcome === "unmeasured") return {};

  const failures = label.items.map(() => new Set<GatedFailure>());
  const { comparison } = call;
  if (call.record.outcome === "invalid" || comparison === null) {
    label.items.forEach((item, i) => {
      if (isListableLabel(item)) failures[i].add("missed");
    });
  } else {
    for (const marked of comparison.items) {
      if (marked.mark === "wrong game") {
        const first = label.items.findIndex(isPhysicalGame);
        if (first !== -1) failures[first].add("wrongGame");
        continue;
      }
      if (marked.expectedIndex === null) continue;
      if (marked.mark === "missed") {
        failures[marked.expectedIndex].add("missed");
      }
      for (const field of marked.fields) {
        if (GATED_FIELDS.has(field)) {
          failures[marked.expectedIndex].add(field as GatedFailure);
        }
      }
    }
    for (const item of comparison.unpaired) {
      failures[label.items.indexOf(item)].add("missed");
    }
  }

  return Object.fromEntries(
    failures.map((set, i) => [itemKey(label.postId, i), inGateOrder(set)]),
  );
}

/** The counts of one model's run that fail the gate whatever the baseline. */
export type RunTotals = Pick<
  Tally,
  "posts" | "leaks" | "unmeasured" | "otherModel"
>;

/** One model's run over the labelled set, as the gate reads it. */
export type ModelRun = { totals: RunTotals; items: ItemFailures };

/** One run of the eval: model → its run. */
export type EvalRun = Record<string, ModelRun>;

/** One model's calls over every labelled post, reduced to what the gate reads. */
export function modelRun(
  model: string,
  calls: {
    label: Label;
    record: CallRecord;
    comparison: Comparison | null;
  }[],
): ModelRun {
  const tally = tallyCalls(
    model,
    calls.map((call) => call.record),
  );
  const items: ItemFailures = {};
  for (const call of calls) {
    Object.assign(items, itemFailures(call.label, call));
  }
  return {
    totals: {
      posts: tally.posts,
      leaks: tally.leaks,
      unmeasured: tally.unmeasured,
      otherModel: tally.otherModel,
    },
    items,
  };
}

/** Model → item key → the gated failures allowed or recorded. */
export type GateRecord = Record<string, ItemFailures>;

export type Verdict = "pass" | "fail";

export type Judgement = {
  verdict: Verdict;
  /** Every reason for a fail; empty on a pass. */
  reasons: string[];
  /**
   * Per production model, every item key with the union of its gated
   * failures across the runs, `[]` for an item right in every run. On a pass
   * it is the next baseline.
   */
  record: GateRecord;
};

/**
 * The entries a model is held to: its own, or, for a model the baseline does
 * not hold yet, its predecessor's — the baseline's first model, which is the
 * production primary the record was written for.
 */
function entriesFor(baseline: GateRecord, model: string): ItemFailures {
  const own = baseline[model];
  if (own !== undefined) return own;
  const [predecessor] = Object.keys(baseline);
  return predecessor === undefined ? {} : baseline[predecessor];
}

/**
 * Judges the runs of one eval against the baseline, the record of the last
 * passing eval. Only the production models are judged; a candidate outside
 * them is reported, never gated. Each run must pass on its own. A production
 * model fails the gate when, in any run:
 * - it was not evaluated;
 * - it listed anything the label says is not a physical game (a leak);
 * - a post was left unmeasured, which would shrink the denominator;
 * - a reply came from a model other than the one asked;
 * - an item shows a gated failure its baseline entry lacks.
 *
 * An item whose key the baseline lacks is new, accepted on first sight and
 * recorded. An item that improved is recorded as `[]`, so failures can only
 * shrink from one record to the next.
 */
export function judgeRuns(input: {
  baseline: GateRecord;
  runs: readonly EvalRun[];
  models: readonly string[];
}): Judgement {
  const { baseline, runs, models } = input;
  const reasons: string[] = [];
  const record: GateRecord = {};

  if (runs.length === 0) reasons.push("no run was made");
  if (models.length === 0) reasons.push("MODELS is empty");

  for (const model of models) {
    const allowed = entriesFor(baseline, model);
    const union = new Map<string, Set<GatedFailure>>();

    runs.forEach((run, r) => {
      const name = `run ${r + 1}`;
      const outcome = run[model];
      if (outcome === undefined) {
        reasons.push(`${model} was not evaluated in ${name}`);
        return;
      }
      const { totals } = outcome;
      if (totals.leaks > 0) {
        reasons.push(
          `${model} listed ${totals.leaks} item(s) that are not physical games (leaks) in ${name}`,
        );
      }
      if (totals.unmeasured > 0) {
        reasons.push(
          `${model} left ${totals.unmeasured} post(s) unmeasured in ${name}`,
        );
      }
      if (totals.otherModel > 0) {
        reasons.push(
          `${totals.otherModel} reply(ies) to ${model} came from another model in ${name}`,
        );
      }

      for (const [key, failures] of Object.entries(outcome.items)) {
        const seen = union.get(key) ?? new Set<GatedFailure>();
        for (const failure of failures) seen.add(failure);
        union.set(key, seen);

        const entry = allowed[key];
        if (entry === undefined) continue;
        const newFailures = failures.filter(
          (failure) => !entry.includes(failure),
        );
        if (newFailures.length > 0) {
          reasons.push(
            `${model}: ${key} newly fails ${newFailures.join(", ")} in ${name}` +
              ` (baseline: ${entry.length === 0 ? "none" : entry.join(", ")})`,
          );
        }
      }
    });

    record[model] = Object.fromEntries(
      [...union].map(([key, failures]) => [key, inGateOrder(failures)]),
    );
  }

  return {
    verdict: reasons.length === 0 ? "pass" : "fail",
    reasons,
    record,
  };
}

/**
 * Reads the baseline out of a parsed result.json: its `record`, validated so
 * that a hand-edited or truncated file cannot loosen the gate silently.
 */
export function parseBaseline(data: unknown): Parsed<GateRecord> {
  const parsed = z
    .object({
      record: z.record(
        z.string(),
        z.record(z.string(), z.array(z.enum(GATED_FAILURES))),
      ),
    })
    .safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `result.json holds no valid record — ${firstIssue(parsed.error)}`,
    };
  }
  return { ok: true, value: parsed.data.record };
}

// The keys of the 55 labels evaluation.md
// (context/archive/2026-09-28-physical-deals-from-real-posts/) records, in labels.json
// order — the order its numbering follows, because eval.mts numbers the posts
// of its report in label order. A post that expects nothing has no key.
const V3_KEYS = [
  "0f5cc06c045eb321#0",
  "21992a93f6d95283#0",
  "35f9ffbf227d28a3#0",
  "7e6598e4ba19ae79#0",
  "80b992c95c74a3d0#0",
  "83328db2b6466093#0",
  "8a51f8e9a8bd27d9#0",
  "9d4b5010d732e207#0",
  "aafc9cf6cbc51857#0",
  "cd21c66efdee0b82#0",
  "db678008ec9a4f31#0",
  "f1586d19dab5c195#0",
  "09b1153826a6c918#0",
  "1682822fa7cf7b7d#0",
  "1ba5fb9a24d655f2#0",
  "1ba5fb9a24d655f2#1",
  "66ee4a26b278abb5#0",
  "773cee9350629db7#0",
  "7e3fd28bfe5e243c#0",
  "8410aaf7573d95a7#0",
  "af2c1cb46eb61f25#0",
  "da46d8fb2c4f753c#0",
  "dc6b8a966ab2d97e#0",
  "f60aae03ac782340#0",
  "f647131aa127e5f0#0",
  "177da139d6c1c235#0",
  "290c07bba85be6df#0",
  "2c5b90ea87e74a91#0",
  "40e923c089c02c46#0",
  "4780c2c26320636f#0",
  "553a5c179b3fb366#0",
  "5d02587d7b3216e8#0",
  "5d02587d7b3216e8#1",
  "69a6d68732570c9a#0",
  "7a81989f145fb596#0",
  "82c6e55196928d62#0",
  "9084b8dec6fa59da#0",
  "9220654893e4b984#0",
  "9d718bcdfa7fdca2#0",
  "9f637e9775ac2828#0",
  "9fc29fb2a638ffce#0",
  "b499462a6223aff0#0",
  "bac6b58408e8d112#0",
  "bac6ff8ce71904d9#0",
  "be25eecd82bbf812#0",
  "c86fa2ad9e24cc38#0",
  "d03942ee8b83b7b8#0",
  "d31a86d97c2b4922#0",
  "d31a86d97c2b4922#1",
  "d7bc4657c73d0f06#0",
  "d7bc4657c73d0f06#1",
  "f167c50ce0f5f980#0",
  "f167c50ce0f5f980#1",
  "f167c50ce0f5f980#2",
  "f89ad2ca3d0c61f8#0",
];

// evaluation.md's #49, No More Heroes 3 at Empik and Neonet, is the 49th
// label in labels.json: post be25eecd82bbf812, whose one item is index 0. It
// came back `unclear` in every run, the one missed physical deal of v3
// (1 of 23; evaluation.md, "Prompt version 3" and "Findings").
const V3_MISSED = "be25eecd82bbf812#0";

/**
 * The baseline for the first gated eval, used only while no result.json
 * exists: prompt version 3's outcome for Mistral Small 3.2 as evaluation.md
 * records it — no digital leak, one missed physical deal (#49), no wrong game
 * and no wrong price (evaluation.md:100,126). Expiry measured nothing then
 * (no label stated one), and set and link had no labels, so no other failure
 * is allowed. The synthetic posts' keys are absent: they are new, accepted on
 * first sight and recorded.
 */
export const BOOTSTRAP_BASELINE: GateRecord = {
  "mistralai/mistral-small-3.2-24b-instruct": Object.fromEntries(
    V3_KEYS.map((key): [string, GatedFailure[]] => [
      key,
      key === V3_MISSED ? ["missed"] : [],
    ]),
  ),
};
