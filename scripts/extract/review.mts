/**
 * The sample review's decisions: drawing the sample, pairing each extracted
 * link with its post and its deals, why an item stays off the page, and the
 * layout of the report and of its counts per aggregator.
 *
 * A module of its own rather than code in report.mts, because that file calls
 * main() at the top level. Pure — data in, data out — with the random source
 * passed in, so that a test can draw a fixed sample.
 */
// Whole-statement type imports: Node erases them entirely.
import type { CollectedPost } from "../collector/posts.mts";
// The .mts extensions are written out because Node strips the types without
// rewriting the specifier, so these have to be the real file names.
import { isListable, type DealRow } from "./deals.mts";
import { aggregatorOf, postText } from "./prompt.mts";

/** One post_extractions row, as the review reads it. */
export type ExtractedLink = {
  link: string;
  /** The representative collected_posts row: the one whose text the model read. */
  post_id: string;
  model: string;
  prompt_version: number;
  item_count: number;
  extracted_at: string;
};

/** The fields of the representative row that the report shows. */
export type ReviewPost = Pick<
  CollectedPost,
  "id" | "source" | "title" | "published_at" | "first_seen_at" | "content"
>;

/** One sampled link: its extraction, its post, and its deals in reply order. */
export type ReviewEntry = {
  extraction: ExtractedLink;
  /** Null only when the representative row could not be read. */
  post: ReviewPost | null;
  deals: DealRow[];
};

/** Why an item stays off the page. */
export type HiddenReason = "not a game" | "digital" | "unclear" | "no price";

const HIDDEN_REASONS: readonly HiddenReason[] = [
  "not a game",
  "digital",
  "unclear",
  "no price",
];

export type AggregatorCounts = {
  aggregator: string;
  links: number;
  /** Links whose reply held no item. */
  empty: number;
  items: number;
  listed: number;
  hidden: Record<HiddenReason, number>;
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whitespace runs, line breaks included, collapsed: one value per line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * `size` items drawn at random without repeats, or all of them when there are
 * fewer: a partial Fisher–Yates shuffle. `random` returns a number in [0, 1),
 * as Math.random does; a test can pass a seeded one.
 */
export function drawSample<T>(
  items: readonly T[],
  size: number,
  random: () => number,
): T[] {
  const pool = [...items];
  const count = Math.min(size, pool.length);
  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** The aggregator a sampled link belongs to: its post's feed id prefix. */
function aggregatorOfEntry(entry: ReviewEntry): string {
  const source = entry.post?.source ?? entry.deals.at(0)?.source;
  return source === undefined ? "unknown" : aggregatorOf(source);
}

/**
 * Pairs each sampled link with its representative post and its deals, the
 * deals in reply order, and orders the links by aggregator, then by link, so
 * that one aggregator's posts are judged together.
 */
export function buildReview(
  sample: readonly ExtractedLink[],
  posts: readonly ReviewPost[],
  deals: readonly DealRow[],
): ReviewEntry[] {
  const postById = new Map(posts.map((post) => [post.id, post]));
  const dealsByLink = new Map<string, DealRow[]>();
  for (const deal of deals) {
    const rows = dealsByLink.get(deal.link);
    if (rows === undefined) dealsByLink.set(deal.link, [deal]);
    else rows.push(deal);
  }

  const entries = sample.map((extraction): ReviewEntry => ({
    extraction,
    post: postById.get(extraction.post_id) ?? null,
    deals: [...(dealsByLink.get(extraction.link) ?? [])].sort(
      (a, b) => a.item_index - b.item_index,
    ),
  }));
  return entries.sort(
    (a, b) =>
      compareText(aggregatorOfEntry(a), aggregatorOfEntry(b)) ||
      compareText(a.extraction.link, b.extraction.link),
  );
}

/**
 * Why a row stays off the page — the first of isListable's three conditions
 * that it fails — or null when it is listed.
 */
export function hiddenReason(
  row: Pick<DealRow, "kind" | "edition" | "price_amount">,
): HiddenReason | null {
  if (isListable(row)) return null;
  if (row.kind !== "game") return "not a game";
  if (row.edition === "digital") return "digital";
  if (row.edition === "unclear") return "unclear";
  return "no price";
}

function emptyCounts(aggregator: string): AggregatorCounts {
  return {
    aggregator,
    links: 0,
    empty: 0,
    items: 0,
    listed: 0,
    hidden: { "not a game": 0, digital: 0, unclear: 0, "no price": 0 },
  };
}

/** Links, items, listed items and hidden ones by reason, per aggregator. */
export function countByAggregator(
  entries: readonly ReviewEntry[],
): AggregatorCounts[] {
  const counts = new Map<string, AggregatorCounts>();
  for (const entry of entries) {
    const aggregator = aggregatorOfEntry(entry);
    const tally = counts.get(aggregator) ?? emptyCounts(aggregator);
    counts.set(aggregator, tally);

    tally.links += 1;
    if (entry.deals.length === 0) tally.empty += 1;
    for (const deal of entry.deals) {
      tally.items += 1;
      const reason = hiddenReason(deal);
      if (reason === null) tally.listed += 1;
      else tally.hidden[reason] += 1;
    }
  }
  return [...counts.values()].sort((a, b) =>
    compareText(a.aggregator, b.aggregator),
  );
}

/** The counts as a Markdown table, with a total row. */
export function countsTable(counts: readonly AggregatorCounts[]): string[] {
  const total = emptyCounts("total");
  for (const row of counts) {
    total.links += row.links;
    total.empty += row.empty;
    total.items += row.items;
    total.listed += row.listed;
    for (const reason of HIDDEN_REASONS) {
      total.hidden[reason] += row.hidden[reason];
    }
  }

  const header = [
    "Aggregator",
    "Links",
    "No items",
    "Items",
    "Listed",
    ...HIDDEN_REASONS.map((reason) => `Hidden: ${reason}`),
  ];
  const line = (row: AggregatorCounts) =>
    `| ${[
      row.aggregator,
      row.links,
      row.empty,
      row.items,
      row.listed,
      ...HIDDEN_REASONS.map((reason) => row.hidden[reason]),
    ].join(" | ")} |`;

  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...counts.map(line),
    line(total),
  ];
}

function describeDeal(deal: DealRow): string {
  const reason = hiddenReason(deal);
  const parts = [
    reason === null ? "**listed**" : `hidden, ${reason}`,
    deal.kind,
    deal.edition,
    deal.platform ?? "no platform",
    deal.price_amount === null || deal.currency === null
      ? "no price"
      : `${deal.price_amount.toFixed(2)} ${deal.currency}`,
    `"${oneLine(deal.title)}"`,
  ];
  if (deal.english_title !== deal.title) {
    parts.push(`english "${oneLine(deal.english_title)}"`);
  }
  if (deal.alternative_titles.length > 0) {
    parts.push(
      `also ${deal.alternative_titles.map((name) => `"${oneLine(name)}"`).join(", ")}`,
    );
  }
  if (deal.discount_percent !== null) parts.push(`-${deal.discount_percent}%`);
  if (deal.expires_at !== null) parts.push(`until ${deal.expires_at}`);
  if (deal.shop_name !== null) parts.push(`shop ${oneLine(deal.shop_name)}`);
  if (deal.shop_url !== null) parts.push("shop link kept");
  parts.push(
    deal.edition_evidence === null
      ? "no evidence"
      : `evidence "${oneLine(deal.edition_evidence)}"`,
  );
  return parts.join(" · ");
}

/**
 * The post as the model read it, quoted line by line. A line that the next one
 * continues ends in a backslash, CommonMark's hard line break: without it the
 * lines of one paragraph would render joined, and cenograj's template of one
 * field per line would read as a single line.
 */
function quote(text: string): string[] {
  if (text === "") return ["> (empty)"];
  const lines = text.split("\n");
  return lines.map((line, index) => {
    if (line === "") return ">";
    const next = lines.at(index + 1);
    return next === undefined || next === "" ? `> ${line}` : `> ${line}\\`;
  });
}

function entryLines(position: number, entry: ReviewEntry): string[] {
  const { extraction, post, deals } = entry;
  const title = post === null || post.title === null ? "" : oneLine(post.title);
  const published =
    post === null
      ? "unknown"
      : (post.published_at ??
        `${post.first_seen_at}, when it was first collected — the feed gave no date`);

  const lines = [
    `### ${position}. ${aggregatorOfEntry(entry)} · ${title === "" ? "(no title)" : title}`,
    "",
    `- Link: ${extraction.link}`,
    `- Feed: ${post?.source ?? "unknown"} · published ${published}`,
    `- Extracted: ${extraction.extracted_at} by ${extraction.model}, prompt version ${extraction.prompt_version}`,
  ];
  if (deals.length !== extraction.item_count) {
    lines.push(
      `- Note: the reply held ${extraction.item_count} item(s), but ${deals.length} deals row(s) exist`,
    );
  }
  lines.push(deals.length === 0 ? "- Items: none" : "- Items:");
  for (const deal of deals) lines.push(`  - ${describeDeal(deal)}`);
  lines.push("", ...quote(post === null ? "" : postText(post.content)), "");
  return lines;
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * The whole report as Markdown: per link the aggregator, the post's title,
 * link and text as the model read it, and each item with its verdicts,
 * evidence, price and platform and whether it is listed; then the counts per
 * aggregator.
 */
export function formatReview(
  entries: readonly ReviewEntry[],
  meta: { total: number; drawnAt: string },
): string {
  const models = distinct(entries.map((entry) => entry.extraction.model));
  const versions = distinct(
    entries.map((entry) => String(entry.extraction.prompt_version)),
  );

  return [
    "# Extraction review sample",
    "",
    `${entries.length} of ${meta.total} extracted links, drawn at random · ` +
      `${meta.drawnAt} · answered by ${models.join(", ") || "no model"} · ` +
      `prompt version ${versions.join(", ") || "none"}`,
    "",
    "Listed means a game, a physical copy and a price, as isListable in " +
      "scripts/extract/deals.mts decides. A hidden item names the first of " +
      "the three it fails.",
    "",
    "## Per link",
    "",
    ...entries.flatMap((entry, index) => entryLines(index + 1, entry)),
    "## Counts per aggregator",
    "",
    ...countsTable(countByAggregator(entries)),
  ].join("\n");
}

/**
 * "sample-2026-10-01T101500Z.md": one file per draw, so that a later draw
 * never overwrites the one a review quotes.
 */
export function reportFileName(drawnAt: string): string {
  return `sample-${drawnAt.replace(/\.\d+Z$/, "Z").replace(/:/g, "")}.md`;
}
