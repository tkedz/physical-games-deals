/**
 * Extracts deals from the posts still pending: one model call per link,
 * newest first.
 *
 *   npm run extract
 *   npm run extract -- --limit 3
 *   npm run extract -- --since 2026-10-05
 *
 * .github/workflows/collect.yml runs it right after the collector, unless the
 * repository variable EXTRACT_PAUSED is true. A run reads up to 1,000 pending
 * rows — only those first seen since EXTRACT_SINCE, when it is set
 * (readCutoff in pipeline.mts) — closes without a call the rows that have no
 * link and the late sightings of links already extracted
 * (setAsideLateSightings in pipeline.mts), and sends every other link to
 * MODELS (config.mts) in one request per link, CONCURRENCY at a time. It stops starting links once RUN_LINK_CAP have
 * been started or RUN_BUDGET_MS is spent, and lets the calls in flight finish;
 * whatever is left is the next run's. `--limit` caps a local proving run
 * further, and `--since` sets the cut-off for one run ahead of EXTRACT_SINCE,
 * in the same words in cmd, PowerShell and Git Bash. Each reply is written in
 * the order store.mts describes.
 *
 * A systemic failure — the key, the credits, a rate limit, a provider outage —
 * stops the run at once. A failure of one post's call counts against it only
 * in a run that extracted something else (deals.mts), so a run in which
 * nothing succeeds leaves every counter alone. In a run that did extract, the
 * failure that stopped it counts against its link as well when it can be the
 * link's own — a timeout, a 5xx, a write refused for the link's data — so
 * that one post cannot stop every run (failuresToCount in pipeline.mts).
 * The exit code is 1 on a systemic failure and on a failure of the extractor
 * itself, 0 otherwise.
 *
 * The workflow sets COLLECT_OUTCOME, and the run is then recorded in
 * public.pipeline_runs; a local run prints its summary only. Nothing printed
 * carries a key or a request: the OpenRouter client reports a failure as a
 * reason, a status and OpenRouter's own message.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
// The .mts extensions are written out because Node strips the types without
// rewriting the specifier, so these have to be the real file names.
import { errorMessage, type CollectorClient } from "../collector/posts.mts";
import { createCollectorClient } from "../collector/supabase.mts";
import {
  CONCURRENCY,
  MAX_TOKENS,
  MODELS,
  REQUEST_TIMEOUT_MS,
  RUN_BUDGET_MS,
  RUN_LINK_CAP,
  TEMPERATURE,
} from "./config.mts";
import { isListable } from "./deals.mts";
import { checkRecord, promptFingerprint } from "./fingerprint.mts";
import {
  createOpenRouterClient,
  readOpenRouterApiKey,
  type CompletionResult,
  type OpenRouterClient,
  type ResponseFormat,
} from "./openrouter.mts";
import { buildMessages, type PostGroup } from "./prompt.mts";
import {
  extractionSchema,
  toResponseFormat,
  type ExtractionOutput,
} from "./schema.mts";
// The decisions live next door, in a module with no top-level side effects —
// this file cannot host them, because it calls main() at the bottom.
import {
  checkCutoffNotAhead,
  countingLine,
  failuresToCount,
  hasLink,
  linkCap,
  parseCount,
  planRun,
  readCollectOutcome,
  readCutoff,
  setAsideLateSightings,
  shouldStartLink,
  stopsRun,
  summaryLines,
  toExtractionRecord,
  toRunRow,
  type LinkOutcome,
} from "./pipeline.mts";
// Every read and write the run makes.
import {
  closeWithoutCall,
  countFailure,
  countPending,
  loadExtractionTimes,
  loadPending,
  PAGE_SIZE,
  recordRun,
  saveExtraction,
  storeErrorCode,
} from "./store.mts";

/** A progress line after every this many links, so a long run shows it is alive. */
const PROGRESS_EVERY = 25;

type Deps = {
  supabase: CollectorClient;
  openrouter: OpenRouterClient;
  responseFormat: ResponseFormat;
};

/** One link, end to end: the call, then its writes. Never throws. */
async function extractLink(group: PostGroup, deps: Deps): Promise<LinkOutcome> {
  const { link } = group.post;

  let result: CompletionResult<ExtractionOutput>;
  try {
    result = await deps.openrouter.complete({
      messages: buildMessages(group),
      models: MODELS,
      responseFormat: deps.responseFormat,
      schema: extractionSchema,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
  } catch (err) {
    // The client returns every failed call as a value, so this is a bug.
    return {
      status: "error",
      link,
      model: null,
      costUsd: null,
      error: errorMessage(err),
      code: null,
    };
  }
  if (!result.ok) return { status: "failed", link, failure: result };

  const answer = { model: result.model, costUsd: result.usage.costUsd };
  try {
    const record = toExtractionRecord(group, result, new Date().toISOString());
    await saveExtraction(deps.supabase, record);
    return {
      status: "extracted",
      link,
      ...answer,
      deals: record.deals.length,
      listed: record.deals.filter(isListable).length,
    };
  } catch (err) {
    // A failed write, or a bug: the extractor's own failure, unless Postgres
    // refused the link's own data, which the code tells (failuresToCount).
    return {
      status: "error",
      link,
      ...answer,
      error: errorMessage(err),
      code: storeErrorCode(err),
    };
  }
}

/**
 * Works through the queue with CONCURRENCY workers. Each worker takes the next
 * link only while shouldStartLink allows it, so a stop or the end of the
 * budget halts new starts while every call in flight still finishes.
 */
async function extractQueue(
  queue: readonly PostGroup[],
  deps: Deps,
  startedMs: number,
): Promise<LinkOutcome[]> {
  const outcomes: LinkOutcome[] = [];
  let next = 0;
  let stopped = false;

  const worker = async (): Promise<void> => {
    while (
      next < queue.length &&
      shouldStartLink({
        elapsedMs: performance.now() - startedMs,
        budgetMs: RUN_BUDGET_MS,
        stopped,
      })
    ) {
      const group = queue[next];
      next += 1;
      const outcome = await extractLink(group, deps);
      outcomes.push(outcome);
      if (stopsRun(outcome)) stopped = true;
      if (outcomes.length % PROGRESS_EVERY === 0) {
        console.error(`${outcomes.length}/${queue.length} links done`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return outcomes;
}

/** The committed eval record next to the eval, or null when there is none. */
function readEvalRecord(): string | null {
  try {
    return readFileSync(new URL("./eval/result.json", import.meta.url), "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  // Before everything else, because it reads only a local file and sends
  // nothing: a prompt or model without a passing eval record never reaches a
  // credential, the database or the model. The prompt fingerprint covers
  // what is sent; the labels are the eval's business, so they are not checked
  // here (fingerprint.mts).
  const recordCheck = checkRecord(readEvalRecord(), {
    prompt: promptFingerprint(),
  });
  if (!recordCheck.ok) throw new Error(recordCheck.reason);

  const startedMs = performance.now();
  const startedAt = new Date().toISOString();

  // Second, so that a missing credential aborts before anything is read or
  // sent, naming the first one missing: NEXT_PUBLIC_SUPABASE_URL, then
  // SUPABASE_SECRET_KEY, then OPENROUTER_API_KEY. The last is picked out
  // because ProcessEnv declares no OPENROUTER_API_KEY, and TypeScript rejects
  // it against a parameter whose only property is optional.
  const supabase = createCollectorClient();
  const apiKey = readOpenRouterApiKey({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  });

  const { values } = parseArgs({
    options: { limit: { type: "string" }, since: { type: "string" } },
  });
  let limit: number | null = null;
  if (values.limit !== undefined) {
    const parsed = parseCount("--limit", values.limit);
    if (!parsed.ok) throw new Error(parsed.reason);
    limit = parsed.value;
  }
  const collectOutcome = readCollectOutcome(process.env.COLLECT_OUTCOME);
  const cutoffName = values.since !== undefined ? "--since" : "EXTRACT_SINCE";
  const cutoff = readCutoff(
    values.since ?? process.env.EXTRACT_SINCE,
    cutoffName,
  );
  if (!cutoff.ok) throw new Error(cutoff.reason);
  const notAhead = checkCutoffNotAhead(
    cutoff.since,
    startedAt,
    collectOutcome !== null,
    cutoffName,
  );
  if (!notAhead.ok) throw new Error(notAhead.reason);

  const rows = await loadPending(supabase, cutoff.since);
  const extractedAt = await loadExtractionTimes(supabase, [
    ...new Set(rows.map((row) => row.link).filter(hasLink)),
  ]);
  const sighted = setAsideLateSightings(rows, extractedAt);
  const cap = linkCap(limit, RUN_LINK_CAP);
  const plan = planRun(sighted.rows, cap.value);
  await closeWithoutCall(supabase, [...plan.linkless, ...sighted.late]);

  console.error(
    `Extracting ${plan.queue.length} of ${plan.links} pending link(s), ` +
      `${CONCURRENCY} at a time, for up to ${RUN_BUDGET_MS / 60_000} minutes…`,
  );
  const outcomes = await extractQueue(
    plan.queue,
    {
      supabase,
      openrouter: createOpenRouterClient({ apiKey, fetch }),
      responseFormat: toResponseFormat(),
    },
    startedMs,
  );
  if (outcomes.some(stopsRun)) process.exitCode = 1;

  console.log("---");
  const summary = summaryLines({
    since: cutoff.since,
    rows: rows.length,
    window: PAGE_SIZE,
    late: sighted.late.length,
    plan,
    cap,
    budgetMs: RUN_BUDGET_MS,
    outcomes,
  });
  for (const line of summary) console.log(line);

  // Only now, with the run over: a success after a failure still makes the
  // failure count.
  for (const { link, reason } of failuresToCount(outcomes)) {
    await countFailure(supabase, link, reason);
  }
  console.log(countingLine(outcomes));

  const pending = await countPending(supabase);
  console.log(
    `Pending links left: ${pending}` +
      (cutoff.since === null
        ? ""
        : ", those first seen before the cut-off included"),
  );

  if (collectOutcome === null) {
    console.log(
      "Run record: not written — COLLECT_OUTCOME is unset, as in every local run",
    );
    return;
  }
  const run = toRunRow({
    startedAt,
    finishedAt: new Date().toISOString(),
    collectOutcome,
    outcomes,
    pending,
  });
  await recordRun(supabase, run);
  console.log(`Run record: written, outcome ${run.outcome}`);
}

// A failed call is handled above, as a per-post failure or a stop; here we only
// catch failures of the extractor itself outside a link's own work — a missing
// credential, a bad option, a failed read or write before or after the calls.
main().catch((err: unknown) => {
  console.error(`Extraction aborted: ${errorMessage(err)}`);
  process.exitCode = 1;
});
