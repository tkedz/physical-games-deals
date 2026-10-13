/**
 * expiryInstant, the stored `expires_at`: the exclusive end of a stated expiry
 * in Europe/Warsaw, the instant from which the deal is hidden.
 *
 * Every expected instant is a literal, worked out by hand from what the
 * product settled, never by running expiryInstant or a second implementation:
 * PRD AC3 (a deal whose post states an end stops showing after it; one without
 * an end stays), the column comment in create_deals.sql (null: the deal
 * stays), the docstring's "a day without an hour ends at the next Warsaw
 * midnight", and the EU summer-time rule: clocks change at 01:00 UTC on the
 * last Sunday of March (2026-03-29, CET +01:00 → CEST +02:00) and of October
 * (2026-10-25, CEST → CET). The decisions of 2026-10-13 are in this change's
 * plan.md: a one-digit hour is read, any other unreadable date stays undated,
 * and an ambiguous wall time is the later occurrence.
 */
import { describe, expect, it } from "vitest";
import { expiryInstant } from "../../../scripts/extract/deals.mts";

type Row = {
  /** The case, citing where its answer was settled. */
  name: string;
  expiresOn: string | null;
  expiresAt: string | null;
  expected: string | null;
};

const ROWS: Row[] = [
  // A stated day ends at the next Warsaw midnight.
  {
    name: "PRD AC3: a day in summer time ends at the next midnight, +02:00",
    expiresOn: "2026-10-24",
    expiresAt: null,
    expected: "2026-10-24T22:00:00.000Z",
  },
  {
    name: "EU DST rule: 2026-10-25, the day summer time ends, ends at midnight +01:00",
    expiresOn: "2026-10-25",
    expiresAt: null,
    expected: "2026-10-25T23:00:00.000Z",
  },
  {
    name: "EU DST rule: 2026-03-28, the day before summer time, ends at midnight +01:00",
    expiresOn: "2026-03-28",
    expiresAt: null,
    expected: "2026-03-28T23:00:00.000Z",
  },
  {
    name: "EU DST rule: 2026-03-29, the day summer time starts, ends at midnight +02:00",
    expiresOn: "2026-03-29",
    expiresAt: null,
    expected: "2026-03-29T22:00:00.000Z",
  },
  {
    name: "PRD AC3: the last day of the year ends in the next year",
    expiresOn: "2026-12-31",
    expiresAt: null,
    expected: "2026-12-31T23:00:00.000Z",
  },
  {
    name: "PRD AC3: a leap day is a calendar date",
    expiresOn: "2028-02-29",
    expiresAt: null,
    expected: "2028-02-29T23:00:00.000Z",
  },

  // A stated hour, on both sides of the October change.
  {
    name: "EU DST rule: 01:59 on 2026-10-25 is still summer time, +02:00",
    expiresOn: "2026-10-25",
    expiresAt: "01:59",
    expected: "2026-10-24T23:59:00.000Z",
  },
  {
    name: "decision 2026-10-13: 02:30 on 2026-10-25 happens twice, and is the later one, +01:00",
    expiresOn: "2026-10-25",
    expiresAt: "02:30",
    expected: "2026-10-25T01:30:00.000Z",
  },
  {
    name: "EU DST rule: 03:00 on 2026-10-25 is winter time, +01:00",
    expiresOn: "2026-10-25",
    expiresAt: "03:00",
    expected: "2026-10-25T02:00:00.000Z",
  },
  {
    name: "PRD AC3: a stated hour is honoured, 07:00",
    expiresOn: "2026-10-25",
    expiresAt: "07:00",
    expected: "2026-10-25T06:00:00.000Z",
  },
  {
    name: "decision 2026-10-13: a one-digit hour is read, 7:00 is 07:00",
    expiresOn: "2026-10-25",
    expiresAt: "7:00",
    expected: "2026-10-25T06:00:00.000Z",
  },

  // A stated hour, on both sides of the March change.
  {
    name: "EU DST rule: 01:59 on 2026-03-29 is still winter time, +01:00",
    expiresOn: "2026-03-29",
    expiresAt: "01:59",
    expected: "2026-03-29T00:59:00.000Z",
  },
  {
    name: "EU DST rule: 02:30 on 2026-03-29 does not exist; the clock reads 03:30 +02:00 then",
    expiresOn: "2026-03-29",
    expiresAt: "02:30",
    expected: "2026-03-29T01:30:00.000Z",
  },
  {
    name: "EU DST rule: 03:00 on 2026-03-29 is summer time, +02:00",
    expiresOn: "2026-03-29",
    expiresAt: "03:00",
    expected: "2026-03-29T01:00:00.000Z",
  },

  // An hour that is not one ends the stated day, as no hour does.
  {
    name: "expiryInstant docstring: 24:00 ends the stated day",
    expiresOn: "2026-10-25",
    expiresAt: "24:00",
    expected: "2026-10-25T23:00:00.000Z",
  },
  {
    name: "expiryInstant docstring: 25:00 is not an hour and ends the stated day",
    expiresOn: "2026-10-25",
    expiresAt: "25:00",
    expected: "2026-10-25T23:00:00.000Z",
  },
  {
    name: "expiryInstant docstring: 12:60 is not an hour and ends the stated day",
    expiresOn: "2026-10-25",
    expiresAt: "12:60",
    expected: "2026-10-25T23:00:00.000Z",
  },
  {
    name: "decision 2026-10-13: 7:5 is not H:MM and ends the stated day",
    expiresOn: "2026-10-25",
    expiresAt: "7:5",
    expected: "2026-10-25T23:00:00.000Z",
  },
  {
    name: "expiryInstant: the date and the hour are trimmed",
    expiresOn: " 2026-10-25 ",
    expiresAt: " 12:00 ",
    expected: "2026-10-25T11:00:00.000Z",
  },

  // No instant: the deal reads as undated and stays listed.
  {
    name: "PRD AC3: no stated date, no end",
    expiresOn: null,
    expiresAt: null,
    expected: null,
  },
  {
    name: "PRD AC3: an hour without a date names no end",
    expiresOn: null,
    expiresAt: "12:00",
    expected: null,
  },
  {
    name: "expiryInstant docstring: 2026-02-29 is not a calendar date",
    expiresOn: "2026-02-29",
    expiresAt: null,
    expected: null,
  },
  {
    name: "expiryInstant docstring: 2026-02-30 is not a calendar date",
    expiresOn: "2026-02-30",
    expiresAt: null,
    expected: null,
  },
  {
    name: "decision 2026-10-13: an unreadable date stays undated, 30.10.2026",
    expiresOn: "30.10.2026",
    expiresAt: null,
    expected: null,
  },
  {
    name: "decision 2026-10-13: an unreadable date stays undated, 2026-10-5",
    expiresOn: "2026-10-5",
    expiresAt: null,
    expected: null,
  },
];

describe("expiryInstant: the exclusive end in Europe/Warsaw", () => {
  it.each(ROWS)("$name", ({ expiresOn, expiresAt, expected }) => {
    expect(expiryInstant(expiresOn, expiresAt)).toBe(expected);
  });
});
