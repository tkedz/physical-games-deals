/**
 * How the deals view writes prices, dates and names: in Polish, on Warsaw's
 * clock.
 *
 * Every date names its time zone rather than taking the machine's, because
 * Vercel runs in UTC: without it a deal posted at 00:30 in Warsaw would show
 * the day before. Call these from Server Components only, so the text is
 * written once, by the server's locale data, and a browser with other data
 * never renders it differently on hydration.
 *
 * Pure — no clock and no I/O — so a future test runner can call it with data.
 * The dates take ISO instants that parse, which the zod checks in queries.ts
 * guarantee: Intl throws on an invalid date.
 */
// A whole-statement type import: types.ts holds types only.
import type { Platform } from "./types";

const LOCALE = "pl-PL";
const TIME_ZONE = "Europe/Warsaw";

const DATE = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Warsaw's wall clock as numbers, for the midnight check in formatExpiry.
const WALL_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/**
 * A price in its own currency, an ISO 4217 code: "129,99 zł", "29,90 €",
 * "59,99 USD".
 */
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(
    amount,
  );
}

/** A percentage cut the post states: "−35%", with a minus sign. */
export function formatDiscount(percent: number): string {
  return `−${percent}%`;
}

/** The Warsaw date of an instant: "6 października 2026". */
export function formatDate(instant: string): string {
  return DATE.format(Date.parse(instant));
}

/** The Warsaw date and time of an instant: "6 października 2026 14:05". */
export function formatDateTime(instant: string): string {
  return DATE_TIME.format(Date.parse(instant));
}

function wallClock(instant: number): {
  hour: number;
  minute: number;
  second: number;
} {
  const clock = { hour: 0, minute: 0, second: 0 };
  for (const { type, value } of WALL_CLOCK.formatToParts(instant)) {
    if (type === "hour" || type === "minute" || type === "second") {
      clock[type] = Number(value);
    }
  }
  return clock;
}

/**
 * The last moment of an offer, from `expires_at`, its exclusive end.
 *
 * An offer that runs to the end of a stated day ends at the next Warsaw
 * midnight, so written as it is "do 30.09" would read as 1 October. A Warsaw
 * midnight is therefore shown as the day it closes, without a time:
 * 2026-09-30T22:00:00Z as "30 września 2026", and 2026-10-25T23:00:00Z, the
 * night summer time ends, as "25 października 2026". Any other instant is an
 * hour the post stated, shown with it: "30 września 2026 12:00".
 */
export function formatExpiry(expiresAt: string): string {
  const end = Date.parse(expiresAt);
  const { hour, minute, second } = wallClock(end);
  if (hour === 0 && minute === 0 && second === 0) {
    // A millisecond before midnight is still the stated day, on either side
    // of a change of offset.
    return DATE.format(end - 1);
  }
  return DATE_TIME.format(end);
}

const PLATFORM_LABELS = {
  ps5: "PS5",
  ps4: "PS4",
  "xbox-series": "Xbox Series X|S",
  "xbox-one": "Xbox One",
  switch: "Switch",
  "switch-2": "Switch 2",
  pc: "PC",
  other: "Inna platforma",
} as const satisfies Record<Platform, string>;

/** The name a card shows for a platform. */
export function platformLabel(platform: Platform): string {
  return PLATFORM_LABELS[platform];
}

// The aggregators by their sites' domain names (scripts/collector/feeds.json).
// A Map rather than an object literal, so that a feed id such as
// "constructor-…" cannot reach Object.prototype.
const AGGREGATOR_LABELS = new Map([
  ["pepper", "pepper.pl"],
  ["lowcygier", "lowcygier.pl"],
  ["cenograj", "cenograj.pl"],
]);

/**
 * The aggregator a deal comes from, by its site: "pepper.pl" for the feed
 * "pepper-ps5". A feed id starts with its aggregator, the rule aggregatorOf in
 * scripts/extract/prompt.mts applies; it is restated here because nothing
 * under src/ imports from scripts/. An aggregator not listed above is shown
 * by its bare prefix.
 */
export function aggregatorLabel(source: string): string {
  const aggregator = source.split("-")[0];
  return AGGREGATOR_LABELS.get(aggregator) ?? aggregator;
}
