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
  expiryInstant,
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
 * (evaluation.md in context/archive/2026-09-28-physical-deals-from-real-posts/).
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

/**
 * Sets aside the late sightings of links already extracted: the pending rows
 * of a link that post_extractions knows, every one of them first seen after
 * the link's last extraction. They are the same post, met since in another
 * feed — a row's id is a hash of its feed and entry
 * (scripts/collector/posts.mts) — and they are closed without a call. A link
 * is extracted once (plan.md, "What We're NOT Doing"): a second call would
 * replace its deals from the late row alone, without the hints of the feeds
 * that saw it first.
 *
 * A pending row first seen before its link's extraction is a deliberate reset
 * (plan.md, Migration Notes) or a crash before the rows were closed, so its
 * link is extracted as usual, together with any late row of it. A time that
 * does not parse leaves the row to be extracted, as before this rule.
 * `extractedAt` maps each extracted link to its post_extractions.extracted_at.
 */
export function setAsideLateSightings(
  rows: readonly CollectedPost[],
  extractedAt: ReadonlyMap<string, string>,
): { rows: CollectedPost[]; late: string[] } {
  // The links with at least one row that is not a late sighting.
  const toExtract = new Set<string>();
  for (const row of rows) {
    if (!hasLink(row.link)) continue;
    const at = extractedAt.get(row.link);
    const late =
      at !== undefined && Date.parse(row.first_seen_at) > Date.parse(at);
    if (!late) toExtract.add(row.link);
  }

  const kept: CollectedPost[] = [];
  const late: string[] = [];
  for (const row of rows) {
    if (hasLink(row.link) && !toExtract.has(row.link)) late.push(row.id);
    else kept.push(row);
  }
  return { rows: kept, late };
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

const CUTOFF_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CUTOFF_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * The run's cut-off, as EXTRACT_SINCE or --since gives it (`name` says which,
 * for the message): the instant from which posts are eligible, judged by when
 * the collector first saw them, or null for no cut-off — every pending post,
 * the default.
 *
 * A date alone means the start of that day in Warsaw, which expiryInstant
 * names when given 00:00. An instant has to carry its offset, so that no value
 * depends on the time zone of the machine reading it. Anything else is refused
 * rather than read as no cut-off, so that a typo never widens a run.
 */
export function readCutoff(
  value: string | undefined,
  name = "EXTRACT_SINCE",
): { ok: true; since: string | null } | { ok: false; reason: string } {
  const raw = value?.trim() ?? "";
  if (raw === "") return { ok: true, since: null };

  const since = CUTOFF_DATE.test(raw)
    ? expiryInstant(raw, "00:00")
    : CUTOFF_INSTANT.test(raw) && Number.isFinite(Date.parse(raw))
      ? new Date(Date.parse(raw)).toISOString()
      : null;
  if (since !== null) return { ok: true, since };
  return {
    ok: false,
    reason:
      `${name} takes a date (YYYY-MM-DD, from the start of that day in ` +
      `Warsaw) or an instant with its offset, such as 2026-10-05T12:00:00+02:00 — not "${raw}"`,
  };
}

/**
 * Refuses a cut-off after the run's start in a run that records itself in
 * pipeline_runs (COLLECT_OUTCOME set): it would extract nothing yet record
 * `ok`, and the page would call stale data fresh. A local run may look ahead,
 * as check 3.12 does with --since.
 */
export function checkCutoffNotAhead(
  since: string | null,
  startedAt: string,
  recorded: boolean,
  name: string,
): { ok: true } | { ok: false; reason: string } {
  if (since === null || !recorded) return { ok: true };
  if (!(Date.parse(since) > Date.parse(startedAt))) return { ok: true };
  return {
    ok: false,
    reason:
      `${name} is ${since}, after this run's start — a recorded run would ` +
      "extract nothing and still call the data fresh",
  };
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
      /** What a failed store write reported — a SQLSTATE, or PostgREST's own — or null. */
      code: string | null;
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
 * Whether the failure that stopped a run can belong to its link rather than
 * to the service: a call that timed out or met a 5xx or a network failure
 * after its retry — a reply that long, or an input the provider fails on — or
 * a write Postgres refused for the link's own data (SQLSTATE class 22, bad
 * data, or 23, a broken constraint). A key, the credits, a missing endpoint or
 * a rate limit never belongs to one link.
 */
function canBeTheLinks(outcome: LinkOutcome): boolean {
  if (outcome.status === "failed") {
    return (
      outcome.failure.scope === "systemic" &&
      (outcome.failure.reason === "timeout" ||
        outcome.failure.reason === "unavailable")
    );
  }
  return outcome.status === "error" && /^2[23]/.test(outcome.code ?? "");
}

/**
 * The failures to count against their posts, each with the reason its rows'
 * extraction_error records. Counted only when the whole run is over, because
 * a success after a failure still makes it count, and then only in a run that
 * extracted something (shouldCountFailures): a run in which nothing succeeded
 * says nothing about its posts.
 *
 * - Every per-post failure counts.
 * - The failure that stopped the run counts against its link too when it can
 *   be the link's own (canBeTheLinks): other links were extracted, so the
 *   service worked. Without this, a link whose reply always outlasts the
 *   timeout would stop every run that reaches it and never be given up. Only
 *   that one link counts, so an outage that begins mid-run costs one attempt
 *   on one link at most.
 * - An extractor error of any other kind leaves the store in doubt, and the
 *   run counts nothing at all.
 */
export function failuresToCount(
  outcomes: readonly LinkOutcome[],
): { link: string; reason: string }[] {
  const extracted = outcomes.filter(
    (outcome) => outcome.status === "extracted",
  ).length;
  if (!shouldCountFailures({ extracted })) return [];
  if (
    outcomes.some(
      (outcome) => outcome.status === "error" && !canBeTheLinks(outcome),
    )
  ) {
    return [];
  }

  const counted = outcomes.flatMap((outcome) =>
    outcome.status === "failed" && outcome.failure.scope === "post"
      ? [{ link: outcome.link, reason: describeFailure(outcome.failure) }]
      : [],
  );
  // Outcomes arrive in the order the links finished, so the first that stops
  // the run is the one that stopped it.
  const stop = outcomes.find(stopsRun);
  if (
    stop !== undefined &&
    stop.status !== "extracted" &&
    canBeTheLinks(stop)
  ) {
    counted.push({
      link: stop.link,
      reason:
        stop.status === "failed"
          ? describeFailure(stop.failure)
          : `extractor error: ${stop.error}`,
    });
  }
  return counted;
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
  /** The cut-off the pending rows were read under (readCutoff), or null for none. */
  since: string | null;
  /** Pending rows read, and the most one read returns. */
  rows: number;
  window: number;
  /** Rows closed without a call as late sightings (setAsideLateSightings). */
  late: number;
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
    run.since === null
      ? "Cut-off: none — every pending post is eligible"
      : `Cut-off: posts first seen since ${run.since}; older pending posts wait`,
    `Pending: ${run.plan.links} link(s) in ${run.rows} row(s) read${fullWindow}; ` +
      `${run.plan.linkless.length} row(s) without a link and ${run.late} ` +
      "late sighting(s) of links already extracted closed without a call",
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

  // Whether either stop also counts against its link is the counting line's
  // to say (countingLine).
  if (tally.systemic !== null) {
    lines.push(
      `Stopped: ${tally.systemic.reason} is a systemic failure — it can hit ` +
        "every post alike, so no further link was started",
    );
  }
  if (tally.error !== null) {
    lines.push(
      "Stopped: a read or write of the extractor's own failed — no further " +
        "link was started",
    );
  }
  return lines;
}

/** The summary's line on counting, printed once the counting is done. */
export function countingLine(outcomes: readonly LinkOutcome[]): string {
  const counted = failuresToCount(outcomes);
  if (counted.length > 0) {
    const stop = outcomes.find(stopsRun);
    const stopCounted =
      stop !== undefined && counted.some(({ link }) => link === stop.link);
    return (
      `Per-post failures: ${counted.length}, each counted against its post` +
      (stopCounted
        ? " — the link that stopped the run among them, because other links were extracted"
        : "")
    );
  }

  const perPost = outcomes.filter(
    (outcome) =>
      outcome.status === "failed" && outcome.failure.scope === "post",
  ).length;
  if (perPost === 0) return "Per-post failures: none";
  return outcomes.some((outcome) => outcome.status === "extracted")
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
