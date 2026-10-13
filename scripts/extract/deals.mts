/**
 * The decisions on a reply: which rows it becomes, which shop link is trusted,
 * when a deal expires, what may be listed, and how a run is judged.
 *
 * Pure — data in, data out, no clock and no I/O — so that the evaluation, the
 * pipeline and a future test runner all call the same code, as
 * context/foundation/lessons.md asks. isListable states the same rule as the
 * select policy on the deals table.
 */
// Whole-statement type imports: Node erases them entirely.
import type { DealKind, Edition, Platform } from "../../src/lib/deals/types.ts";
import type { ExtractedItem, ExtractionOutput } from "./schema.mts";
import { postHrefs, type PostGroup } from "./prompt.mts";

/**
 * One deals row as the reply decides it. `id` and `extracted_at` are not the
 * reply's to decide, so they are left to the table and the writer.
 */
export type DealRow = {
  link: string;
  /** The item's position in the reply, from 0. */
  item_index: number;
  source: string;
  /** The post's own publication time, or when it was first collected. */
  published_at: string;
  kind: DealKind;
  edition: Edition;
  platform: Platform | null;
  title: string;
  english_title: string;
  alternative_titles: string[];
  /**
   * The other games sold together with this one for price_amount, which is
   * then the whole set's price. Empty for a game sold on its own.
   */
  set_with: string[];
  price_amount: number | null;
  currency: string | null;
  discount_percent: number | null;
  /** The exclusive end instant: the deal is hidden from this moment on. */
  expires_at: string | null;
  shop_url: string | null;
  shop_name: string | null;
  edition_evidence: string | null;
};

/** The largest amount a `numeric(10,2)` column holds. */
const MAX_PRICE = 99_999_999.99;
const MAX_EVIDENCE_LENGTH = 300;

/** Spellings of a currency a model writes instead of the ISO 4217 code. */
const CURRENCY_ALIASES = new Map([
  ["ZŁ", "PLN"],
  ["ZL", "PLN"],
  ["€", "EUR"],
]);

/** Trimmed, or null when nothing is left. */
function clean(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * The names cleaned and in order, without repeats and without any of `known`,
 * compared without regard to case.
 */
function distinctNames(
  names: readonly string[],
  known: readonly string[],
): string[] {
  const seen = new Set(known.map((name) => name.toLowerCase()));
  const result: string[] = [];
  for (const raw of names) {
    const name = clean(raw);
    if (name === null || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    result.push(name);
  }
  return result;
}

/**
 * A price the table can hold — positive, at most two decimals, below the
 * column's limit, with a three-letter currency — or null. Either way amount
 * and currency are both set or both null, as the table requires.
 */
function toPrice(
  price: ExtractedItem["price"],
): { amount: number; currency: string } | null {
  if (price === null) return null;
  const amount = Math.round(price.amount * 100) / 100;
  const written = price.currency.trim().toUpperCase();
  const currency = CURRENCY_ALIASES.get(written) ?? written;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PRICE) {
    return null;
  }
  return /^[A-Z]{3}$/.test(currency) ? { amount, currency } : null;
}

/** A whole percentage between 1 and 99, the table's range, or null. */
function toDiscount(percent: number | null): number | null {
  if (percent === null) return null;
  const whole = Math.round(percent);
  return whole >= 1 && whole <= 99 ? whole : null;
}

/** The lower-case host of a URL, or null when it does not parse. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The same site: equal hosts once `www.` is dropped, or a subdomain of it. */
function isSameSite(host: string, siteHost: string): boolean {
  const bare = (value: string) => value.replace(/^www\./, "");
  const site = bare(siteHost);
  const candidate = bare(host);
  return candidate === site || candidate.endsWith(`.${site}`);
}

/**
 * The sites of the aggregators whose feeds scripts/collector/feeds.json
 * collects. A link to any of them leads to another post, never to a shop,
 * whichever aggregator the post itself comes from.
 */
export const AGGREGATOR_SITES = ["pepper.pl", "lowcygier.pl", "cenograj.pl"];

/**
 * Keeps a shop URL only when all four hold: it is one of the post's own link
 * targets, character for character; it uses http: or https:; it carries no
 * username or password, which can dress one host up as another; and it is on
 * neither the post's own site nor any site in AGGREGATOR_SITES. Otherwise
 * null, and the deal links to the post.
 *
 * `postHost` is the host of the post's link. When it is unknown the fourth
 * condition cannot be checked, so nothing is kept.
 */
export function verifyShopUrl(
  url: string | null,
  hrefs: readonly string[],
  postHost: string | null,
): string | null {
  if (url === null || postHost === null) return null;
  if (!hrefs.includes(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  const host = parsed.hostname.toLowerCase();
  if (isSameSite(host, postHost)) return null;
  if (AGGREGATOR_SITES.some((site) => isSameSite(host, site))) return null;
  return url;
}

const WARSAW = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Warsaw",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** How far Warsaw's wall clock is ahead of UTC at an instant, in milliseconds. */
function warsawOffsetMs(instant: number): number {
  const part: Record<string, number> = {};
  for (const { type, value } of WARSAW.formatToParts(instant)) {
    if (type !== "literal") part[type] = Number(value);
  }
  const wallClock = Date.UTC(
    part.year,
    part.month - 1,
    part.day,
    part.hour,
    part.minute,
    part.second,
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a Warsaw wall-clock time names. Resolved through Intl rather
 * than a fixed +02:00, because Warsaw leaves summer time on the last Sunday
 * of October: the offset is looked up at a first guess and then at the
 * corrected instant, which settles it on either side of the change.
 */
function warsawToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const guess = wallClock - warsawOffsetMs(wallClock);
  return wallClock - warsawOffsetMs(guess);
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

/**
 * The exclusive end of a stated expiry, in Europe/Warsaw, as an ISO instant.
 * Without an hour, the day ends at the next local midnight: "do 30.09" ends at
 * 2026-09-30T22:00:00Z, "do 25.10" at 2026-10-25T23:00:00Z. A stated hour,
 * H:MM or HH:MM, is honoured; 24:00, or an hour that is not one, ends the day
 * at midnight too. Null when there is no date, or it is not a calendar date.
 */
export function expiryInstant(
  expiresOn: string | null,
  expiresAt: string | null,
): string | null {
  const date = expiresOn === null ? null : DATE.exec(expiresOn.trim());
  if (date === null) return null;

  const year = Number(date[1]);
  const month = Number(date[2]);
  const day = Number(date[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null;
  }

  const time = expiresAt === null ? null : TIME.exec(expiresAt.trim());
  const hour = time === null ? 24 : Number(time[1]);
  const minute = time === null ? 0 : Number(time[2]);
  if (hour < 24 && minute < 60) {
    return new Date(warsawToUtc(year, month, day, hour, minute)).toISOString();
  }

  // Date.UTC rolls day + 1 over into the next month and year.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return new Date(
    warsawToUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      0,
      0,
    ),
  ).toISOString();
}

/**
 * Maps a validated reply to deals rows, one per item in reply order, cleaned
 * so that every row satisfies the table's checks: a price the column cannot
 * hold, a discount outside 1–99 or an unreadable expiry becomes null rather
 * than failing the write, and an unverified shop URL is dropped.
 */
export function toDealRows(
  output: ExtractionOutput,
  group: PostGroup,
): DealRow[] {
  const { post } = group;
  const hrefs = postHrefs(post.content);
  const postHost = hostOf(post.link);

  return output.items.map((item, index) => {
    const price = toPrice(item.price);
    const title =
      clean(item.title) ??
      clean(item.englishTitle) ??
      clean(post.title) ??
      "(untitled)";
    const englishTitle = clean(item.englishTitle) ?? title;
    const ownTitles = [title, englishTitle];

    return {
      link: post.link,
      item_index: index,
      source: post.source,
      published_at: post.published_at ?? post.first_seen_at,
      kind: item.kind,
      edition: item.edition,
      platform: item.platform,
      title,
      english_title: englishTitle,
      alternative_titles: distinctNames(item.alternativeTitles, ownTitles),
      // Without the item's own title: a set names the others only.
      set_with: distinctNames(item.setWith, ownTitles),
      price_amount: price?.amount ?? null,
      currency: price?.currency ?? null,
      discount_percent: toDiscount(item.discountPercent),
      expires_at: expiryInstant(item.expiresOn, item.expiresAt),
      shop_url: verifyShopUrl(clean(item.shopUrl), hrefs, postHost),
      shop_name: clean(item.shopName),
      edition_evidence:
        clean(item.editionEvidence)?.slice(0, MAX_EVIDENCE_LENGTH) ?? null,
    };
  });
}

/**
 * Whether a row may reach the page: a game, a physical copy, and a price.
 * `unclear` stays hidden — a false hit costs more than a missed deal.
 */
export function isListable(
  row: Pick<DealRow, "kind" | "edition" | "price_amount">,
): boolean {
  return (
    row.kind === "game" &&
    row.edition === "physical" &&
    row.price_amount !== null
  );
}

export type RunOutcome = "ok" | "failed";

/**
 * `ok` only when collection succeeded and no systemic failure stopped the
 * extraction. Per-post failures and backlog left for the next run do not fail
 * a run: they are ordinary work, not a broken pipeline.
 */
export function decideRunOutcome(run: {
  collectSucceeded: boolean;
  systemicFailure: boolean;
}): RunOutcome {
  return run.collectSucceeded && !run.systemicFailure ? "ok" : "failed";
}

/**
 * Per-post failures count against their posts only in a run that extracted
 * something. A run in which nothing succeeded — a schema the endpoint rejects,
 * a broken deploy — says nothing about the posts, so it leaves every counter
 * untouched.
 */
export function shouldCountFailures(run: { extracted: number }): boolean {
  return run.extracted > 0;
}
