/**
 * Whether the deals on `/` are fresh: the decision behind the line above the
 * list, which lets a visitor tell "no new deals" from "processing stopped"
 * (US-01). Pure: the last run's time and the clock are passed in.
 */

/**
 * How long after the last successful run the page starts warning. The
 * collect workflow runs every four hours, so six hours means a run is late or
 * failed — and a deal must reach the page within six hours of its post
 * (context/foundation/prd.md).
 */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type Freshness =
  | { state: "fresh"; finishedAt: string }
  | { state: "stale"; finishedAt: string }
  | { state: "never" };

/**
 * Decides the freshness line from when the last successful run finished — an
 * ISO instant, or null when no run has succeeded — and the current time. At
 * most six hours old is `fresh`, exactly six included; `stale` is strictly
 * older; `never` is no successful run at all.
 *
 * The comparison is written so that a time that does not parse reads as
 * stale: NaN fails `<=`. A warning that should not be there costs less than a
 * stopped pipeline that looks healthy.
 */
export function decideFreshness(
  lastOkFinishedAt: string | null,
  now: Date,
): Freshness {
  if (lastOkFinishedAt === null) return { state: "never" };
  const age = now.getTime() - Date.parse(lastOkFinishedAt);
  return age <= STALE_AFTER_MS
    ? { state: "fresh", finishedAt: lastOkFinishedAt }
    : { state: "stale", finishedAt: lastOkFinishedAt };
}
