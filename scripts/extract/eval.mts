/**
 * Measures the extraction candidates on the labelled set, and gates the
 * production models on it.
 *
 *   npm run extract:eval
 *   npm run extract:eval -- --model openai/gpt-4.1-nano
 *
 * The labelled posts are the exported real ones in posts.json and the
 * invented ones in synthetic-posts.json. Every candidate in config.mts is
 * called on every labelled post on its own — `models: [id]`, no fallback, so
 * that every answer is attributable — the candidates side by side, each one's
 * calls one at a time. The whole eval runs RUNS times, because one run varies.
 *
 * The gate (judgeRuns in evaluation.mts) judges the MODELS against the last
 * passing record, scripts/extract/eval/result.json, or BOOTSTRAP_BASELINE
 * while none exists. On a pass the script writes a new result.json — the
 * fingerprints, the models and the per-item outcomes, no post text — and
 * exits 0; on a fail it writes none and exits 1.
 *
 * The script writes the report itself, as UTF-8 Markdown that evaluation.md
 * can quote as written: per post the expected items against the returned
 * ones, then the per-model totals, the ranking and the gate. It goes to
 * scripts/extract/eval/report-v<prompt version>.md, next to posts.json and
 * gitignored like it, because it quotes the posts. The terminal gets the
 * progress, the totals, the ranking, the gate and the report's path.
 *
 * Nothing written or printed carries the key or a request: the client reports
 * a failure as a reason, a status and OpenRouter's own message.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
// The .mts extensions are written out because Node strips the types without
// rewriting the specifier, so these have to be the real file names.
import type { DealRow } from "./deals.mts";
import { errorMessage } from "../collector/posts.mts";
import {
  CANDIDATES,
  MAX_TOKENS,
  MODELS,
  REQUEST_TIMEOUT_MS,
  TEMPERATURE,
} from "./config.mts";
import { labelsFingerprint, promptFingerprint } from "./fingerprint.mts";
import {
  createOpenRouterClient,
  readOpenRouterApiKey,
  type CompletionResult,
  type Failure,
  type OpenRouterClient,
  type ResponseFormat,
} from "./openrouter.mts";
import { describeFailure } from "./pipeline.mts";
import {
  aggregatorOf,
  buildMessages,
  PROMPT_VERSION,
  type PostGroup,
} from "./prompt.mts";
import {
  extractionSchema,
  toResponseFormat,
  type ExtractionOutput,
} from "./schema.mts";
// The decisions live next door, in a module with no top-level side effects —
// this file cannot host them, because it calls main() at the bottom.
import {
  BOOTSTRAP_BASELINE,
  FIELD_NAMES,
  isListableLabel,
  judgeRuns,
  measureCall,
  modelRun,
  parseBaseline,
  parseLabels,
  parsePosts,
  percentile,
  rankModels,
  tallyCalls,
  totalFieldErrors,
  type CallRecord,
  type Comparison,
  type EvalRun,
  type GateRecord,
  type Judgement,
  type Label,
  type LabelItem,
  type MarkedItem,
  type Tally,
} from "./evaluation.mts";

const EVAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "eval");
const POSTS_PATH = resolve(EVAL_DIR, "posts.json");
const SYNTHETIC_PATH = resolve(EVAL_DIR, "synthetic-posts.json");
const LABELS_PATH = resolve(EVAL_DIR, "labels.json");
const RESULT_PATH = resolve(EVAL_DIR, "result.json");

/**
 * Every candidate is run this many times, and each run must pass the gate on
 * its own: at temperature 0 one run still varies (research.md, "Cost and
 * nondeterminism").
 */
const RUNS = 2;

/**
 * A candidate stops after this many systemic failures in a row: its provider
 * is down, and every further call would wait out the timeout twice.
 */
const MAX_SYSTEMIC_IN_A_ROW = 3;

type Case = { label: Label; group: PostGroup };

type Run = Case & {
  /** Null when the call was never sent. */
  result: CompletionResult<ExtractionOutput> | null;
  record: CallRecord;
  comparison: Comparison | null;
};

function readText(path: string, name: string, hint: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`${name} is unreadable — ${hint} (${errorMessage(err)})`);
  }
}

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${errorMessage(err)}`);
  }
}

function readJson(path: string, name: string, hint: string): unknown {
  return parseJson(readText(path, name, hint), name);
}

/**
 * The baseline the gate judges against: the record of the last passing eval,
 * or BOOTSTRAP_BASELINE while none exists. Read before any call, so a broken
 * record aborts the eval before it costs anything.
 */
function loadBaseline(): { baseline: GateRecord; source: string } {
  const name = "scripts/extract/eval/result.json";
  let text: string;
  try {
    text = readFileSync(RESULT_PATH, "utf8");
  } catch (err) {
    if ((err as { code?: unknown }).code === "ENOENT") {
      return {
        baseline: BOOTSTRAP_BASELINE,
        source: `BOOTSTRAP_BASELINE (evaluation.mts), because ${name} does not exist yet`,
      };
    }
    throw new Error(`${name} is unreadable (${errorMessage(err)})`);
  }
  const parsed = parseBaseline(parseJson(text, name));
  if (!parsed.ok) throw new Error(`${name}: ${parsed.reason}`);
  return { baseline: parsed.value, source: name };
}

/**
 * Where the report goes: one file per prompt version, so that a run of the
 * next version never overwrites the last one, and one per model for a
 * --model run, so that it cannot overwrite the full run's.
 */
function reportPath(model: string | undefined): string {
  const suffix =
    model === undefined ? "" : `-${model.replace(/[^A-Za-z0-9.]+/g, "-")}`;
  return resolve(EVAL_DIR, `report-v${PROMPT_VERSION}${suffix}.md`);
}

/**
 * The labelled posts, in label order, and the labels fingerprint of the files
 * they come from. Fails on a label whose post is in neither posts file, and
 * on a post id the two files share.
 */
function loadCases(): {
  cases: Case[];
  unlabelled: number;
  labelsFingerprint: string;
} {
  const posts = parsePosts(
    readJson(
      POSTS_PATH,
      "scripts/extract/eval/posts.json",
      "save the result cell of scripts/extract/eval/export-posts.sql there",
    ),
  );
  if (!posts.ok) throw new Error(posts.reason);
  const syntheticText = readText(
    SYNTHETIC_PATH,
    "scripts/extract/eval/synthetic-posts.json",
    "it is committed next to labels.json",
  );
  const synthetic = parsePosts(
    parseJson(syntheticText, "scripts/extract/eval/synthetic-posts.json"),
    "synthetic-posts.json",
  );
  if (!synthetic.ok) throw new Error(synthetic.reason);
  const labelsText = readText(
    LABELS_PATH,
    "scripts/extract/eval/labels.json",
    "it is committed next to posts.json",
  );
  const labels = parseLabels(
    parseJson(labelsText, "scripts/extract/eval/labels.json"),
  );
  if (!labels.ok) throw new Error(labels.reason);

  const groups = [...posts.value, ...synthetic.value];
  const byId = new Map<string, PostGroup>();
  for (const group of groups) {
    if (byId.has(group.post.id)) {
      throw new Error(
        `post ${group.post.id} is in both posts.json and synthetic-posts.json`,
      );
    }
    byId.set(group.post.id, group);
  }
  const cases = labels.value.map((label): Case => {
    const group = byId.get(label.postId);
    if (group === undefined) {
      throw new Error(
        `labels.json has a label for post ${label.postId}, which neither posts.json nor synthetic-posts.json holds`,
      );
    }
    return { label, group };
  });

  const labelled = new Set(labels.value.map((label) => label.postId));
  const unlabelled = groups.filter(
    (group) => !labelled.has(group.post.id),
  ).length;
  return {
    cases,
    unlabelled,
    labelsFingerprint: labelsFingerprint(labelsText, syntheticText),
  };
}

async function runCandidate(
  model: string,
  runName: string,
  cases: Case[],
  client: OpenRouterClient,
  responseFormat: ResponseFormat,
): Promise<Run[]> {
  const runs: Run[] = [];
  let systemicInARow = 0;
  let lastSystemic: Failure | null = null;

  for (const [index, { label, group }] of cases.entries()) {
    if (lastSystemic !== null && systemicInARow >= MAX_SYSTEMIC_IN_A_ROW) {
      const failure: Failure = {
        ...lastSystemic,
        status: null,
        detail: `not sent: ${model} stopped after ${MAX_SYSTEMIC_IN_A_ROW} systemic failures in a row`,
      };
      runs.push({
        label,
        group,
        result: null,
        record: { outcome: "unmeasured", failure, latencyMs: 0 },
        comparison: null,
      });
      continue;
    }

    const started = performance.now();
    const result = await client.complete({
      messages: buildMessages(group),
      models: [model],
      responseFormat,
      schema: extractionSchema,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    const latencyMs = Math.round(performance.now() - started);

    // The key or the credits: every further call, for every candidate, fails
    // the same way, so there is nothing left to measure.
    if (
      !result.ok &&
      (result.reason === "unauthorized" || result.reason === "payment_required")
    ) {
      throw new Error(`${model}: ${describeFailure(result)}`);
    }

    if (!result.ok && result.scope === "systemic") {
      systemicInARow += 1;
      lastSystemic = result;
    } else {
      systemicInARow = 0;
    }

    const { record, comparison } = measureCall(label, group, result, latencyMs);
    runs.push({ label, group, result, record, comparison });

    if ((index + 1) % 10 === 0 || index + 1 === cases.length) {
      console.error(`${model}, ${runName}: ${index + 1}/${cases.length}`);
    }
  }
  return runs;
}

/** Keeps a value inside its table cell: a `|` or a line break would split it. */
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s*\r?\n\s*/g, " ");
}

function formatPrice(
  price: { amount: number; currency: string } | null,
): string {
  return price === null
    ? "no price"
    : `${price.amount.toFixed(2)} ${price.currency}`;
}

function rowPrice(row: DealRow): { amount: number; currency: string } | null {
  return row.price_amount === null || row.currency === null
    ? null
    : { amount: row.price_amount, currency: row.currency };
}

function describeExpected(item: LabelItem): string {
  const parts = [
    item.kind,
    item.edition,
    `"${item.englishTitle}"`,
    item.platform ?? "no platform",
    formatPrice(item.price),
  ];
  if (item.setWith !== undefined && item.setWith.length > 0) {
    parts.push(
      `set with ${item.setWith.map((name) => `"${name}"`).join(", ")}`,
    );
  }
  if (item.discountPercent !== null) parts.push(`-${item.discountPercent}%`);
  if (item.expiresAt !== null) parts.push(`until ${item.expiresAt}`);
  if (item.shopUrl !== undefined) {
    parts.push(item.shopUrl === null ? "links to the post" : "shop link");
  }
  return parts.join(" · ");
}

function describeReturned({ item, row }: MarkedItem): string {
  const parts = [row.kind, row.edition, `"${row.english_title}"`];
  if (row.title !== row.english_title) parts.push(`as "${row.title}"`);
  parts.push(row.platform ?? "no platform", formatPrice(rowPrice(row)));
  if (row.set_with.length > 0) {
    parts.push(
      `set with ${row.set_with.map((name) => `"${name}"`).join(", ")}`,
    );
  }
  if (row.discount_percent !== null) parts.push(`-${row.discount_percent}%`);
  if (item.expiresOn !== null) {
    parts.push(
      `until ${item.expiresOn}${item.expiresAt === null ? "" : ` ${item.expiresAt}`}`,
    );
  }
  if (row.shop_name !== null) parts.push(`shop ${row.shop_name}`);
  if (item.shopUrl !== null) {
    parts.push(row.shop_url === null ? "shop link dropped" : "shop link kept");
  }
  if (row.edition_evidence !== null) {
    parts.push(`evidence "${row.edition_evidence}"`);
  }
  return parts.join(" · ");
}

function describeMarked(marked: MarkedItem): string {
  // Upper case marks an error; the others are what should happen.
  const mark =
    marked.mark === "listed" ||
    marked.mark === "extra offer" ||
    marked.mark === "rejected"
      ? marked.mark
      : marked.mark.toUpperCase();
  const notes: string[] = [];
  if (marked.fields.length > 0) notes.push(`wrong ${marked.fields.join(", ")}`);
  if (marked.titleDiffers && marked.expected !== null) {
    notes.push(`title differs from "${marked.expected.englishTitle}"`);
  }
  if (marked.why.length > 0) notes.push(marked.why.join(", "));
  return (
    `${mark}: ${describeReturned(marked)}` +
    (notes.length > 0 ? ` — ${notes.join("; ")}` : "")
  );
}

/** One model's call on one post in one run, as the report shows it. */
type Attempt = { name: string; model: string; run: Run };

function caseLines(position: number, run: Case, attempts: Attempt[]): string[] {
  const { label, group } = run;
  const lines = [
    `### ${position}. ${aggregatorOf(group.post.source)} · ${label.postId}`,
    "",
    `- Post: ${cell(group.post.title ?? "(no title)")}`,
    `- Note: ${cell(label.note)}`,
    label.items.length === 0 ? "- Expected: nothing" : "- Expected:",
  ];
  for (const item of label.items) {
    lines.push(
      `  - ${isListableLabel(item) ? "list" : "hide"}: ${describeExpected(item)}`,
    );
  }

  for (const { name, model, run: attempt } of attempts) {
    const { result, comparison, record } = attempt;
    if (result === null || !result.ok || comparison === null) {
      const failure =
        record.outcome === "reply" ? null : describeFailure(record.failure);
      lines.push(`- ${name}: FAILED — ${failure ?? "no result"}`);
      continue;
    }

    const cost =
      result.usage.costUsd === null
        ? "cost not reported"
        : `$${result.usage.costUsd.toFixed(5)}`;
    const answered =
      result.model === model ? "" : `, answered by ${result.model}`;
    lines.push(`- ${name} (${record.latencyMs} ms, ${cost}${answered}):`);
    if (comparison.items.length === 0 && comparison.unpaired.length === 0) {
      lines.push("  - nothing returned");
    }
    for (const marked of comparison.items) {
      lines.push(`  - ${cell(describeMarked(marked))}`);
    }
    for (const item of comparison.unpaired) {
      lines.push(`  - MISSED, not returned: ${describeExpected(item)}`);
    }
  }
  lines.push("");
  return lines;
}

function formatLatency(tally: Tally): string {
  const p50 = percentile(tally.latenciesMs, 0.5);
  const p90 = percentile(tally.latenciesMs, 0.9);
  return p50 === null || p90 === null ? "—" : `${p50} / ${p90} ms`;
}

function totalsLines(tallies: { model: string; tally: Tally }[]): string[] {
  const header = [
    "Model",
    "Replies",
    "Invalid",
    "Unmeasured",
    "Digital leaks",
    "Missed physical",
    "Wrong game",
    ...FIELD_NAMES.map((field) => `Wrong ${field}`),
    "Title differs",
    "Reasoning tokens",
    "Latency p50 / p90",
    "Cost",
    "Cost / reply",
  ];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];

  for (const { model, tally } of tallies) {
    const perReply =
      tally.replies === 0
        ? "—"
        : `$${(tally.costUsd / tally.replies).toFixed(5)}`;
    const cells = [
      model,
      `${tally.replies} of ${tally.posts}`,
      String(tally.invalid),
      String(tally.unmeasured),
      String(tally.leaks),
      `${tally.missed} of ${tally.expectedListable}`,
      String(tally.wrongGame),
      ...FIELD_NAMES.map((field) => String(tally.fields[field])),
      String(tally.titleDiffers),
      String(tally.reasoningTokens),
      formatLatency(tally),
      `$${tally.costUsd.toFixed(4)}`,
      perReply,
    ];
    lines.push(`| ${cells.map(cell).join(" | ")} |`);
  }
  lines.push("");

  for (const { model, tally } of tallies) {
    const answeredBy =
      tally.answeredBy.length === 0 ? "nobody" : tally.answeredBy.join(", ");
    lines.push(
      `- ${model}: answered by ${answeredBy}; tokens ${tally.promptTokens} in, ` +
        `${tally.completionTokens} out, ${tally.reasoningTokens} reasoning`,
    );
    for (const [reason, seen] of Object.entries(tally.failures)) {
      if (seen === undefined) continue;
      lines.push(
        `  - failed ${seen.count}×: ${reason}` +
          (seen.detail === null ? "" : ` — first: ${seen.detail}`),
      );
    }
  }
  lines.push("");
  return lines;
}

function rankingLines(tallies: { model: string; tally: Tally }[]): string[] {
  const lines = [
    "Rule: only a model with zero digital leaks is eligible — and only when it " +
      "answered at all, every post was measured and every reply came from the " +
      "model asked. Then the fewest missed physical deals wins, then the fewest " +
      "field errors, then the lowest cost.",
    "",
  ];
  for (const [index, ranked] of rankModels(tallies).entries()) {
    const standing = ranked.eligible
      ? "eligible"
      : `not eligible: ${ranked.reason}`;
    lines.push(
      `${index + 1}. ${ranked.model} — ${standing}; missed ${ranked.tally.missed}, ` +
        `field errors ${totalFieldErrors(ranked.tally)}, cost $${ranked.tally.costUsd.toFixed(4)}`,
    );
  }
  return lines;
}

function gateLines(judgement: Judgement, baselineSource: string): string[] {
  const lines = [
    `Verdict: ${judgement.verdict === "pass" ? "PASS" : "FAIL"}`,
    "",
    `- Production models (MODELS): ${MODELS.join(", ")}`,
    `- Runs: ${RUNS}, each judged on its own`,
    `- Baseline: ${baselineSource}`,
    "- Blocks on: a leak, an unmeasured post or a reply from another model " +
      "in any run; a production model not evaluated; a missed item, wrong " +
      "game, price, expiry, set or link its baseline entry lacks.",
  ];
  if (judgement.reasons.length > 0) {
    lines.push("", "Reasons:", "");
    for (const reason of judgement.reasons) lines.push(`- ${cell(reason)}`);
  }
  lines.push("");
  return lines;
}

async function main(): Promise<void> {
  // First, so a missing key aborts before a single file is read or request
  // sent. The one variable is picked out because ProcessEnv declares no
  // OPENROUTER_API_KEY, and TypeScript rejects it against a parameter whose
  // only property is optional.
  const apiKey = readOpenRouterApiKey({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  });

  const { values } = parseArgs({ options: { model: { type: "string" } } });
  const models =
    values.model === undefined
      ? [...CANDIDATES]
      : CANDIDATES.filter((candidate) => candidate === values.model);
  if (models.length === 0) {
    throw new Error(
      `--model ${values.model} is not in CANDIDATES (scripts/extract/config.mts)`,
    );
  }

  const { cases, unlabelled, labelsFingerprint } = loadCases();
  const { baseline, source: baselineSource } = loadBaseline();
  const client = createOpenRouterClient({ apiKey, fetch });
  const responseFormat = toResponseFormat();

  // runs[r][m][c]: run r, model m, case c. The runs follow one another; the
  // models run side by side within each.
  const runs: Run[][][] = [];
  for (let r = 0; r < RUNS; r += 1) {
    const runName = `run ${r + 1}`;
    console.error(
      `Run ${r + 1} of ${RUNS}: ${models.length} model(s) on ${cases.length} labelled post(s)…`,
    );
    runs.push(
      await Promise.all(
        models.map((model) =>
          runCandidate(model, runName, cases, client, responseFormat),
        ),
      ),
    );
  }

  const perAggregator = new Map<string, number>();
  for (const { group } of cases) {
    const aggregator = aggregatorOf(group.post.source);
    perAggregator.set(aggregator, (perAggregator.get(aggregator) ?? 0) + 1);
  }

  const attemptName = (model: string, r: number) => `${model} · run ${r + 1}`;
  const tallies = runs.flatMap((byModel, r) =>
    models.map((model, m) => ({
      model: attemptName(model, r),
      tally: tallyCalls(
        model,
        byModel[m].map((run) => run.record),
      ),
    })),
  );

  const evalRuns = runs.map((byModel): EvalRun =>
    Object.fromEntries(
      models.map((model, m) => [model, modelRun(model, byModel[m])]),
    ),
  );
  const judgement = judgeRuns({ baseline, runs: evalRuns, models: MODELS });

  const summary = [
    "## Per model",
    "",
    ...totalsLines(tallies),
    "## Ranking",
    "",
    ...rankingLines(tallies),
    "",
    "## Gate",
    "",
    ...gateLines(judgement, baselineSource),
  ];
  const report = [
    "# Extraction evaluation",
    "",
    `Prompt version ${PROMPT_VERSION} · ${cases.length} labelled posts (` +
      [...perAggregator].map(([name, count]) => `${name} ${count}`).join(", ") +
      `)` +
      (unlabelled > 0 ? ` · ${unlabelled} unlabelled post(s) not run` : "") +
      ` · ${RUNS} runs · each model called on its own, one request at a time · ${new Date().toISOString()}`,
    "",
    "## Per post",
    "",
    ...cases.flatMap((run, index) =>
      caseLines(
        index + 1,
        run,
        runs.flatMap((byModel, r) =>
          models.map((model, m) => ({
            name: attemptName(model, r),
            model,
            run: byModel[m][index],
          })),
        ),
      ),
    ),
    ...summary,
  ].join("\n");

  // The record first: on a pass it is what the paid runs were for.
  const resultName = relative(process.cwd(), RESULT_PATH);
  if (judgement.verdict === "pass") {
    // No post text, timings, costs, build ids or dates: the file is committed,
    // and it changes only when the outcome does.
    const result = {
      promptFingerprint: promptFingerprint(),
      labelsFingerprint,
      promptVersion: PROMPT_VERSION,
      models: [...MODELS],
      runs: RUNS,
      verdict: "pass",
      record: judgement.record,
    };
    writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  } else {
    process.exitCode = 1;
  }

  const path = reportPath(values.model);
  const shownPath = relative(process.cwd(), path);
  try {
    writeFileSync(path, `${report}\n`, "utf8");
  } catch (err) {
    // The run has been paid for: a report that cannot be written goes to the
    // terminal rather than being lost.
    console.log(report);
    throw new Error(
      `the report above could not be written to ${shownPath}: ${errorMessage(err)}`,
    );
  }

  console.log(summary.join("\n"));
  console.log(`Full report, post by post: ${shownPath}`);
  console.log(
    judgement.verdict === "pass"
      ? `Gate passed: ${resultName} written — commit it with the change.`
      : `Gate failed: ${resultName} not written.`,
  );
}

// A failed call is reported in the report, and a failed gate sets exit code 1
// above; here we only catch failures of the evaluation itself — a missing key,
// an unreadable or malformed file, a rejected key or exhausted credits, a
// report or record that could not be written.
main().catch((err: unknown) => {
  console.error(`Evaluation aborted: ${errorMessage(err)}`);
  process.exitCode = 1;
});
