/**
 * Measures the extraction candidates on the labelled set.
 *
 *   npm run extract:eval
 *   npm run extract:eval -- --model openai/gpt-4.1-nano
 *
 * Every candidate in config.mts is called on every labelled post on its own —
 * `models: [id]`, no fallback, so that every answer is attributable — the
 * candidates side by side, each one's calls one at a time.
 *
 * The script writes the report itself, as UTF-8 Markdown that evaluation.md
 * can quote as written: per post the expected items against the returned
 * ones, then the per-model totals and the ranking. It goes to
 * scripts/extract/eval/report-v<prompt version>.md, next to posts.json and
 * gitignored like it, because it quotes the posts. The terminal gets the
 * progress, the totals, the ranking and the report's path.
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
  REQUEST_TIMEOUT_MS,
  TEMPERATURE,
} from "./config.mts";
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
  FIELD_NAMES,
  isListableLabel,
  measureCall,
  parseLabels,
  parsePosts,
  percentile,
  rankModels,
  tallyCalls,
  totalFieldErrors,
  type CallRecord,
  type Comparison,
  type Label,
  type LabelItem,
  type MarkedItem,
  type Tally,
} from "./evaluation.mts";

const EVAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "eval");
const POSTS_PATH = resolve(EVAL_DIR, "posts.json");
const LABELS_PATH = resolve(EVAL_DIR, "labels.json");

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

function readJson(path: string, name: string, hint: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`${name} is unreadable — ${hint} (${errorMessage(err)})`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${errorMessage(err)}`);
  }
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

/** The labelled posts, in label order. Fails on a label whose post is not in posts.json. */
function loadCases(): { cases: Case[]; unlabelled: number } {
  const posts = parsePosts(
    readJson(
      POSTS_PATH,
      "scripts/extract/eval/posts.json",
      "save the sample query's result cell there",
    ),
  );
  if (!posts.ok) throw new Error(posts.reason);
  const labels = parseLabels(
    readJson(
      LABELS_PATH,
      "scripts/extract/eval/labels.json",
      "it is committed next to posts.json",
    ),
  );
  if (!labels.ok) throw new Error(labels.reason);

  const byId = new Map(posts.value.map((group) => [group.post.id, group]));
  const cases = labels.value.map((label): Case => {
    const group = byId.get(label.postId);
    if (group === undefined) {
      throw new Error(
        `labels.json has a label for post ${label.postId}, which posts.json does not hold`,
      );
    }
    return { label, group };
  });

  const labelled = new Set(labels.value.map((label) => label.postId));
  const unlabelled = posts.value.filter(
    (group) => !labelled.has(group.post.id),
  ).length;
  return { cases, unlabelled };
}

async function runCandidate(
  model: string,
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
      console.error(`${model}: ${index + 1}/${cases.length}`);
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
  if (item.discountPercent !== null) parts.push(`-${item.discountPercent}%`);
  if (item.expiresOn !== null) parts.push(`until ${item.expiresOn}`);
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

function caseLines(
  position: number,
  run: Case,
  byModel: Map<string, Run>,
): string[] {
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

  for (const [model, modelRun] of byModel) {
    const { result, comparison, record } = modelRun;
    if (result === null || !result.ok || comparison === null) {
      const failure =
        record.outcome === "reply" ? null : describeFailure(record.failure);
      lines.push(`- ${model}: FAILED — ${failure ?? "no result"}`);
      continue;
    }

    const cost =
      result.usage.costUsd === null
        ? "cost not reported"
        : `$${result.usage.costUsd.toFixed(5)}`;
    const answered =
      result.model === model ? "" : `, answered by ${result.model}`;
    lines.push(`- ${model} (${record.latencyMs} ms, ${cost}${answered}):`);
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

  const { cases, unlabelled } = loadCases();
  const client = createOpenRouterClient({ apiKey, fetch });
  const responseFormat = toResponseFormat();

  console.error(
    `Running ${models.length} model(s) on ${cases.length} labelled post(s)…`,
  );
  const runsByModel = await Promise.all(
    models.map((model) => runCandidate(model, cases, client, responseFormat)),
  );

  const perAggregator = new Map<string, number>();
  for (const { group } of cases) {
    const aggregator = aggregatorOf(group.post.source);
    perAggregator.set(aggregator, (perAggregator.get(aggregator) ?? 0) + 1);
  }

  const tallies = models.map((model, m) => ({
    model,
    tally: tallyCalls(
      model,
      runsByModel[m].map((run) => run.record),
    ),
  }));

  const summary = [
    "## Per model",
    "",
    ...totalsLines(tallies),
    "## Ranking",
    "",
    ...rankingLines(tallies),
  ];
  const report = [
    "# Extraction evaluation",
    "",
    `Prompt version ${PROMPT_VERSION} · ${cases.length} labelled posts (` +
      [...perAggregator].map(([name, count]) => `${name} ${count}`).join(", ") +
      `)` +
      (unlabelled > 0 ? ` · ${unlabelled} unlabelled post(s) not run` : "") +
      ` · each model called on its own, one request at a time · ${new Date().toISOString()}`,
    "",
    "## Per post",
    "",
    ...cases.flatMap((run, index) =>
      caseLines(
        index + 1,
        run,
        new Map(models.map((model, m) => [model, runsByModel[m][index]])),
      ),
    ),
    ...summary,
  ].join("\n");

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
  console.log("");
  console.log(`Full report, post by post: ${shownPath}`);
}

// A failed call is reported in the report; here we only catch failures of the
// evaluation itself — a missing key, an unreadable or malformed file, a
// rejected key or exhausted credits, a report that could not be written.
main().catch((err: unknown) => {
  console.error(`Evaluation aborted: ${errorMessage(err)}`);
  process.exitCode = 1;
});
