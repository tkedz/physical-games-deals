/**
 * The evaluation's decisions: validating the labelled set and the exported
 * posts, pairing the items a model returned with the labelled ones, counting
 * what went wrong, and ranking the candidates by the rule evaluation.md
 * applies.
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
  expiresOn: string | null;
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
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
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
 * row holding it. A failure names the first bad post.
 */
export function parsePosts(data: unknown): Parsed<PostGroup[]> {
  const cell = unwrapResultRow(data);
  if (!Array.isArray(cell)) {
    return {
      ok: false,
      reason: "posts.json must be the JSON array the sample query returns",
    };
  }

  const groups: PostGroup[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of cell.entries()) {
    const parsed = postGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        reason: `post ${index + 1} is malformed — ${firstIssue(parsed.error)}`,
      };
    }
    if (seen.has(parsed.data.post.id)) {
      return {
        ok: false,
        reason: `post ${index + 1} repeats id ${parsed.data.post.id}`,
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

export type FieldName =
  "price" | "currency" | "platform" | "discount" | "expiry";

export const FIELD_NAMES: readonly FieldName[] = [
  "price",
  "currency",
  "platform",
  "discount",
  "expiry",
];

export type MarkedItem = ReturnedItem & {
  mark: Mark;
  expected: LabelItem | null;
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

function fieldErrors(expected: LabelItem, { item, row }: ReturnedItem) {
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
  if (expected.expiresOn !== (item.expiresOn?.trim() || null)) {
    fields.push("expiry");
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
  return { price: 0, currency: 0, platform: 0, discount: 0, expiry: 0 };
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

/**
 * Whether the model that answered is the one asked. OpenRouter reports the
 * concrete build it served, which may carry a date: asked for
 * "openai/gpt-4.1-nano", it may answer as "openai/gpt-4.1-nano-2025-04-14".
 */
export function isSameModel(asked: string, answered: string): boolean {
  const base = asked.split(":")[0];
  const reported = answered.split(":")[0];
  if (reported === base) return true;
  return (
    reported.startsWith(base) && /^-\d[\d-]*$/.test(reported.slice(base.length))
  );
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
