/**
 * formatExpiry, the end a deal card shows, read from `expires_at`, the
 * exclusive end.
 *
 * The expected texts come from the function's own documented examples
 * (src/lib/deals/format.ts: a Warsaw midnight is shown as the day it closes,
 * without a time; any other instant is a stated hour, shown with it) and from
 * the stated-day rule: the instant is the one expiryInstant stores for that
 * day, worked out by hand from the EU summer-time rule in expiry.test.ts.
 */
import { describe, expect, it } from "vitest";
import { formatExpiry } from "@/lib/deals/format";

describe("formatExpiry", () => {
  it.each([
    {
      name: "format.ts docstring: the end of 30.09 in summer time is that day",
      expiresAt: "2026-09-30T22:00:00.000Z",
      shown: "30 września 2026",
    },
    {
      name: "format.ts docstring: the end of 25.10, the night summer time ends, is that day",
      expiresAt: "2026-10-25T23:00:00.000Z",
      shown: "25 października 2026",
    },
    {
      name: "stated-day rule: the end of 29.03, the day summer time starts, is that day",
      expiresAt: "2026-03-29T22:00:00.000Z",
      shown: "29 marca 2026",
    },
    {
      name: "format.ts docstring: a stated hour is shown with it, 07:00 after the October change",
      expiresAt: "2026-10-25T06:00:00.000Z",
      shown: "25 października 2026 07:00",
    },
  ])("$name", ({ expiresAt, shown }) => {
    expect(formatExpiry(expiresAt)).toBe(shown);
  });
});
