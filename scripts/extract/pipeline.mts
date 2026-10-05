/**
 * The extraction run's decisions: which pending rows become which calls and in
 * what order, when the run stops starting links, which failures count against
 * their posts, what a reply is written as, and what the run prints and
 * records.
 *
 * A module of its own rather than code in extract.mts, because that file calls
 * main() at the top level — the split scripts/collector/posts.mts makes for
 * collect.mts. Pure — data in, data out, no clock and no I/O — so every
 * decision here can be imported and called with data the day a test runner
 * arrives, as context/foundation/lessons.md asks.
 */
// Whole-statement type imports: Node erases them entirely.
import type { CollectedPost } from "../collector/posts.mts";
import type { Completion, Failure } from "./openrouter.mts";
import type { ExtractionOutput } from "./schema.mts";
// The .mts extensions are written out because Node strips the types without
// rewriting the specifier, so these have to be the real file names.
import {
  decideRunOutcome,
  shouldCountFailures,
  toDealRows,
  type DealRow,
  type RunOutcome,
} from "./deals.mts";
import { PROMPT_VERSION, type PostGroup } from "./prompt.mts";

/** Whether a row carries a link to extract. A blank one counts as none. */
export function hasLink(link: string | null): link is string {
  return link !== null && link.trim() !== "";
}

/** Distinct links among the given ones: what pipeline_runs.links_pending counts. */
export function countLinks(links: readonly (string | null)[]): number {
  return new Set(links.filter(hasLink)).size;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Earlier `first_seen_at` first, then the smaller id: the order in which the
 * labelled set's sample query picked each link's representative row
 * (evaluation.md in context/changes/physical-deals-from-real-posts/).
 */
function compareSightings(a: CollectedPost, b: CollectedPost): number {
  return (
    Date.parse(a.first_seen_at) - Date.parse(b.first_seen_at) ||
    compareText(a.id, b.id)
  );
}

/**
 * The rows sharing one link as the model is shown them, built the way the
 * sample query built the labelled set: the earliest sighting is the
 * representative, whose text the model reads and whose id the extraction
 * records, and the feed of every row is listed, sorted by feed id.
 */
function toPostGroup(link: string, rows: readonly CollectedPost[]): PostGroup {
  const [earliest] = [...rows].sort(compareSightings);
  return {
    post: { ...earliest, link },
    feeds: rows
      .map(({ source, platform_hint }) => ({ source, platform_hint }))
      .sort((a, b) => compareText(a.source, b.source)),
  };
}

export type RunPlan = {
  /** Ids of the rows with no link: nothing listable can come of them. */
  linkless: string[];
  /** Links among the rows read. */
  links: number;
  /** The links this run extracts, newest first: at most the cap of them. */
  queue: PostGroup[];
};

/**
 * Groups the pending rows by link — one call per link, however many feeds saw
 * it — and orders the links by their newest sighting, newest first, so that a
 * post collected in this run is extracted before the backlog. The rows
 * without a link are set aside to be closed without a call. `cap` is the
 * run's link cap (linkCap).
 */
export function planRun(rows: readonly CollectedPost[], cap: number): RunPlan {
  const linkless: string[] = [];
  const byLink = new Map<string, CollectedPost[]>();
  for (const row of rows) {
    if (!hasLink(row.link)) {
      linkless.push(row.id);
      continue;
    }
    const sightings = byLink.get(row.link);
    if (sightings === undefined) byLink.set(row.link, [row]);
    else sightings.push(row);
  }

  const links = [...byLink].map(([link, sightings]) => ({
    link,
    sightings,
    newest: sightings.reduce((a, b) => (compareSightings(a, b) >= 0 ? a : b)),
  }));
  links.sort((a, b) => compareSightings(b.newest, a.newest));

  return {
    linkless,
    links: links.length,
    queue: links
      .slice(0, cap)
      .map(({ link, sightings }) => toPostGroup(link, sightings)),
  };
}

/** The run's link cap: RUN_LINK_CAP, or a smaller --limit on a local proving run. */
export function linkCap(
  limit: number | null,
  runLinkCap: number,
): { value: number; source: string } {
  return limit !== null && limit < runLinkCap
    ? { value: limit, source: "--limit" }
    : { value: runLinkCap, source: "RUN_LINK_CAP" };
}

/** A whole number of at least 1 given on the command line, such as `--limit 3`. */
export function parseCount(
  option: string,
  raw: string,
): { ok: true; value: number } | { ok: false; reason: string } {
  const value = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(value) && value >= 1
    ? { ok: true, value }
    : {
        ok: false,
        reason: `${option} takes a whole number of at least 1, not "${raw}"`,
      };
}

/**
 * How the collect step ended — success, failure, cancelled or skipped — as the
 * workflow passes it in COLLECT_OUTCOME. Null when it is unset or empty, as in
 * every local run: that run records nothing in pipeline_runs.
 */
export function readCollectOutcome(value: string | undefined): string | null {
  const outcome = value?.trim() ?? "";
  return outcome === "" ? null : outcome;
}

/**
 * Whether a worker may start another link: not once the run has stopped, and
 * not once the time budget is spent. A call already in flight is never cut
 * short: it finishes, and a reply that arrives is saved.
 */
export function shouldStartLink(run: {
  elapsedMs: number;
  budgetMs: number;
  stopped: boolean;
}): boolean {
  return !run.stopped && run.elapsedMs < run.budgetMs;
}

/**
 * What became of one link the run started:
 * - `extracted`: its reply is written and its rows are closed;
 * - `failed`: the call failed, for this post alone (`scope: "post"`) or for
 *   every post alike (`scope: "systemic"`);
 * - `error`: the extractor itself failed on it — a read or write of the store,
 *   or a bug — after the model answered (`model` set) or before.
 */
export type LinkOutcome =
  | {
      status: "extracted";
      link: string;
      model: string;
      costUsd: number | null;
      deals: number;
      listed: number;
    }
  | { status: "failed"; link: string; failure: Failure }
  | {
      status: "error";
      link: string;
      model: string | null;
      costUsd: number | null;
      error: string;
    };

/**
 * A systemic failure hits every post alike, and an extractor error leaves the
 * store in doubt: either one stops the run from starting further links.
 */
export function stopsRun(outcome: LinkOutcome): boolean {
  return (
    outcome.status === "error" ||
    (outcome.status === "failed" && outcome.failure.scope === "systemic")
  );
}

/** A failure as one line: the reason, the status, and OpenRouter's own message. */
export function describeFailure(failure: Failure): string {
  return (
    `${failure.reason} (status ${failure.status ?? "none"})` +
    (failure.detail === null ? "" : `: ${failure.detail}`)
  );
}

/**
 * The per-post failures to count against their posts, each with the reason
 * its rows' extraction_error records. Counted only when the whole run is over,
 * because a success after a failure still makes it count, and then only in a
 * run that extracted something (shouldCountFailures). None in a run that
 * stopped on an extractor error, which counts against nothing. A systemic
 * failure never counts.
 */
export function failuresToCount(
  outcomes: readonly LinkOutcome[],
): { link: string; reason: string }[] {
  if (outcomes.some((outcome) => outcome.status === "error")) return [];
  const extracted = outcomes.filter(
    (outcome) => outcome.status === "extracted",
  ).length;
  if (!shouldCountFailures({ extracted })) return [];

  return outcomes.flatMap((outcome) =>
    outcome.status === "failed" && outcome.failure.scope === "post"
      ? [{ link: outcome.link, reason: describeFailure(outcome.failure) }]
      : [],
  );
}

/** One post_extractions row. */
export type ExtractionRow = {
  link: string;
  /** The representative collected_posts row: the one whose text the model read. */
  post_id: string;
  /** The model that answered, not necessarily the first one asked. */
  model: string;
  prompt_version: number;
  item_count: number;
  /** The reply as validated, before any cleaning. */
  output: ExtractionOutput;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
  generation_id: string | null;
  extracted_at: string;
};

/** A deals row as written: the reply's row, stamped with its link's extraction time. */
export type StoredDeal = DealRow & { extracted_at: string };

/** Everything the writes for one link carry. */
export type ExtractionRecord = {
  extraction: ExtractionRow;
  deals: StoredDeal[];
};

/**
 * A token count the integer column accepts, or null. A fraction would make the
 * whole write fail, and with it every later run that reaches this link.
 */
function wholeOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * The rows one reply becomes. `extractedAt` is one instant for the whole link,
 * sent with every row rather than left to the column default: an upsert
 * updates only the columns it sends, so a re-extraction refreshes it only
 * when it is sent.
 */
export function toExtractionRecord(
  group: PostGroup,
  reply: Completion<ExtractionOutput>,
  extractedAt: string,
): ExtractionRecord {
  return {
    extraction: {
      link: group.post.link,
      post_id: group.post.id,
      model: reply.model,
      prompt_version: PROMPT_VERSION,
      item_count: reply.output.items.length,
      output: reply.output,
      prompt_tokens: wholeOrNull(reply.usage.promptTokens),
      completion_tokens: wholeOrNull(reply.usage.completionTokens),
      reasoning_tokens: wholeOrNull(reply.usage.reasoningTokens),
      cost_usd: reply.usage.costUsd,
      generation_id: reply.generationId,
      extracted_at: extractedAt,
    },
    deals: toDealRows(reply.output, group).map((row) => ({
      ...row,
      extracted_at: extractedAt,
    })),
  };
}

export type RunTally = {
  attempted: number;
  extracted: number;
  /** Started and not extracted: failed calls and extractor errors alike. */
  failed: number;
  deals: number;
  listed: number;
  /** Summed from the replies that reported a cost, saved or not. */
  costUsd: number;
  /** Replies that reported no cost. */
  unpriced: number;
  /** How many replies each model gave, in the order the models first answered. */
  answeredBy: Map<string, number>;
  /** The first systemic failure, which stopped the run. */
  systemic: Failure | null;
  /** The first extractor error, which stopped the run. */
  error: string | null;
};

/** Adds up what became of the links the run started. */
export function tallyRun(outcomes: readonly LinkOutcome[]): RunTally {
  const tally: RunTally = {
    attempted: outcomes.length,
    extracted: 0,
    failed: 0,
    deals: 0,
    listed: 0,
    costUsd: 0,
    unpriced: 0,
    answeredBy: new Map(),
    systemic: null,
    error: null,
  };

  for (const outcome of outcomes) {
    if (outcome.status === "failed") {
      tally.failed += 1;
      if (outcome.failure.scope === "systemic") {
        tally.systemic ??= outcome.failure;
      }
      continue;
    }

    // The model answered, so the reply is billed whether or not it was saved.
    if (outcome.model !== null) {
      tally.answeredBy.set(
        outcome.model,
        (tally.answeredBy.get(outcome.model) ?? 0) + 1,
      );
      if (outcome.costUsd === null) tally.unpriced += 1;
      else tally.costUsd += outcome.costUsd;
    }

    if (outcome.status === "error") {
      tally.failed += 1;
      tally.error ??= outcome.error;
      continue;
    }
    tally.extracted += 1;
    tally.deals += outcome.deals;
    tally.listed += outcome.listed;
  }
  return tally;
}

/** What the run's summary is made of. */
export type RunSummary = {
  /** Pending rows read, and the most one read returns. */
  rows: number;
  window: number;
  plan: RunPlan;
  cap: { value: number; source: string };
  budgetMs: number;
  outcomes: readonly LinkOutcome[];
};

/**
 * The summary of the extraction itself: links extracted, failed and skipped,
 * the deals written and listed, the models that answered, the cost, and why
 * the run stopped. Nothing here can carry a key or a request: a failure is
 * described by its reason, its status and OpenRouter's own message.
 */
export function summaryLines(run: RunSummary): string[] {
  const tally = tallyRun(run.outcomes);
  const fullWindow =
    run.rows >= run.window
      ? " — the most one read returns, so older pending rows wait for a later run"
      : "";
  const lines = [
    `Pending: ${run.plan.links} link(s) in ${run.rows} row(s) read${fullWindow}; ` +
      `${run.plan.linkless.length} row(s) without a link closed without a call`,
  ];

  const beyondCap = run.plan.links - run.plan.queue.length;
  const notStarted = run.plan.queue.length - tally.attempted;
  const skipped: string[] = [];
  if (beyondCap > 0) {
    skipped.push(
      `${beyondCap} beyond the cap of ${run.cap.value} set by ${run.cap.source}`,
    );
  }
  if (notStarted > 0) {
    const why =
      tally.systemic !== null
        ? "the run stopped on a systemic failure"
        : tally.error !== null
          ? "the run stopped on an extractor error"
          : `the ${run.budgetMs / 60_000}-minute budget ran out`;
    skipped.push(`${notStarted} not started: ${why}`);
  }
  lines.push(
    `Links: ${tally.extracted} extracted, ${tally.failed} failed, ` +
      `${beyondCap + notStarted} skipped` +
      (skipped.length > 0 ? ` (${skipped.join("; ")})` : ""),
  );

  lines.push(`Deals: ${tally.deals} written, ${tally.listed} of them listed`);
  const answeredBy = [...tally.answeredBy]
    .map(([model, count]) => `${model} ×${count}`)
    .join(", ");
  lines.push(`Answered by: ${answeredBy === "" ? "no model" : answeredBy}`);
  lines.push(
    `Cost: $${tally.costUsd.toFixed(4)}` +
      (tally.unpriced > 0
        ? ` (${tally.unpriced} reply(ies) reported no cost)`
        : ""),
  );

  // One line per reason, with the first case of it.
  const byReason = new Map<string, { count: number; first: string }>();
  for (const outcome of run.outcomes) {
    if (outcome.status === "extracted") continue;
    const reason =
      outcome.status === "failed" ? outcome.failure.reason : "extractor error";
    const detail =
      outcome.status === "failed"
        ? describeFailure(outcome.failure)
        : `extractor error: ${outcome.error}`;
    const seen = byReason.get(reason);
    if (seen === undefined) {
      byReason.set(reason, {
        count: 1,
        first: `${detail} — on ${outcome.link}`,
      });
    } else {
      seen.count += 1;
    }
  }
  for (const { count, first } of byReason.values()) {
    lines.push(`Failed ×${count}: ${first}`);
  }

  if (tally.systemic !== null) {
    lines.push(
      `Stopped: ${tally.systemic.reason} is a systemic failure — it hits every ` +
        "post alike, so no further link was started and it counts against no post",
    );
  }
  if (tally.error !== null) {
    lines.push(
      "Stopped: a read or write of the extractor's own failed — no further " +
        "link was started, and nothing is counted against any post",
    );
  }
  return lines;
}

/** The summary's line on counting, printed once the counting is done. */
export function countingLine(outcomes: readonly LinkOutcome[]): string {
  const perPost = outcomes.filter(
    (outcome) =>
      outcome.status === "failed" && outcome.failure.scope === "post",
  ).length;
  if (perPost === 0) return "Per-post failures: none";

  const counted = failuresToCount(outcomes).length;
  if (counted > 0) {
    return `Per-post failures: ${counted}, each counted against its post`;
  }
  return outcomes.some((outcome) => outcome.status === "error")
    ? `Per-post failures: ${perPost}, not counted — the run stopped on an extractor error`
    : `Per-post failures: ${perPost}, not counted — nothing was extracted in this run`;
}

/** One pipeline_runs row. */
export type RunRow = {
  started_at: string;
  finished_at: string;
  collect_succeeded: boolean;
  outcome: RunOutcome;
  failure_reason: string | null;
  links_attempted: number;
  links_extracted: number;
  links_failed: number;
  deals_listed: number;
  links_pending: number;
  cost_usd: number;
};

/**
 * The pipeline_runs row for one run of the workflow. `ok` takes a successful
 * collection and no stop (decideRunOutcome), and an extractor error stops the
 * run as an outage does. The cost is rounded to a billionth of a dollar, so
 * that a sum of floats writes no rounding noise into the numeric column.
 */
export function toRunRow(run: {
  startedAt: string;
  finishedAt: string;
  collectOutcome: string;
  outcomes: readonly LinkOutcome[];
  pending: number;
}): RunRow {
  const tally = tallyRun(run.outcomes);
  const collectSucceeded = run.collectOutcome === "success";

  const reasons: string[] = [];
  if (!collectSucceeded) {
    reasons.push(`the collect step ended in ${run.collectOutcome}`);
  }
  if (tally.systemic !== null) {
    reasons.push(`extraction stopped on ${describeFailure(tally.systemic)}`);
  }
  if (tally.error !== null) {
    reasons.push(`extraction stopped on an extractor error: ${tally.error}`);
  }

  return {
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    collect_succeeded: collectSucceeded,
    outcome: decideRunOutcome({
      collectSucceeded,
      systemicFailure: tally.systemic !== null || tally.error !== null,
    }),
    failure_reason: reasons.length > 0 ? reasons.join("; ") : null,
    links_attempted: tally.attempted,
    links_extracted: tally.extracted,
    links_failed: tally.failed,
    deals_listed: tally.listed,
    links_pending: run.pending,
    cost_usd: Math.round(tally.costUsd * 1e9) / 1e9,
  };
}
