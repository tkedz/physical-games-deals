/**
 * Probes how well the game catalogue knows the titles in probe-titles.json.
 *
 *   npm run catalog:probe
 *
 * For every entry, every query and both modes (editions included, then
 * excluded) it sends one search, one request at a time, and prints a Markdown
 * report the coverage record can quote as printed: the rank of the intended
 * game, the first five results, the latency, the totals and the verdict.
 *
 * Nothing printed carries the key or a request URL: the catalogue client
 * returns a failure as a reason and a status only.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// The .ts and .mts extensions are written out because Node strips the types
// without rewriting the specifier, so these have to be the real file names.
// TypeScript accepts them through "allowImportingTsExtensions" in tsconfig.json.
import {
  createRawgCatalog,
  readRawgApiKey,
} from "../../src/lib/catalog/rawg.ts";
import type {
  CatalogGame,
  CatalogResult,
} from "../../src/lib/catalog/types.ts";
// The decisions live next door, in a module with no top-level side effects —
// this file cannot host them, because it calls main() at the bottom.
import {
  FOUND_WITHIN,
  isFoundRank,
  parseProbeEntries,
  PROBE_KINDS,
  rankOf,
  tallyByKind,
  verdict,
  type EntryOutcome,
  type ProbeEntry,
} from "./coverage.mts";

const TITLES_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "probe-titles.json",
);

const LIMIT = 10;
const SHOWN_RESULTS = 5;
const MODES = [
  { excludeAdditions: false, label: "all" },
  { excludeAdditions: true, label: "exclude additions" },
];

type Row = {
  entry: ProbeEntry;
  query: string;
  mode: string;
  result: CatalogResult<CatalogGame[]>;
  rank: number | null;
  latencyMs: number;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function loadEntries(): ProbeEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(TITLES_PATH, "utf8"));
  } catch (err) {
    throw new Error(`probe-titles.json is unreadable: ${errorMessage(err)}`);
  }

  const parsed = parseProbeEntries(data);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.entries;
}

/** Keeps a value inside its table cell: a `|` or a line break would split it. */
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s*\r?\n\s*/g, " ");
}

function describeGame(game: CatalogGame): string {
  const year = game.released?.slice(0, 4) ?? "no date";
  const platforms = game.platforms.map((platform) => platform.slug).join(", ");
  return `${game.name} (${year}) [${platforms}]`;
}

function describeFailure(result: CatalogResult<unknown>): string {
  if (result.ok) return "";
  return `${result.reason} (status: ${result.status ?? "none"})`;
}

function formatRow(row: Row): string {
  const results = row.result.ok
    ? row.result.value.slice(0, SHOWN_RESULTS).map(describeGame).join("; ") ||
      "no results"
    : `failed: ${describeFailure(row.result)}`;

  return (
    "| " +
    [
      row.entry.title,
      row.query,
      row.mode,
      row.rank === null ? "—" : String(row.rank),
      isFoundRank(row.rank) ? "yes" : "no",
      results,
      `${row.latencyMs} ms`,
    ]
      .map(cell)
      .join(" | ") +
    " |"
  );
}

async function main(): Promise<void> {
  // First, so a missing key aborts before a single request is sent. The one
  // variable is picked out because ProcessEnv declares no RAWG_API_KEY, and
  // TypeScript rejects it against a parameter whose only property is optional.
  const apiKey = readRawgApiKey({ RAWG_API_KEY: process.env.RAWG_API_KEY });
  const entries = loadEntries();
  const catalog = createRawgCatalog({ apiKey, fetch });

  const rows: Row[] = [];
  for (const entry of entries) {
    for (const query of entry.queries) {
      for (const mode of MODES) {
        const started = performance.now();
        const result = await catalog.searchGames(query, {
          limit: LIMIT,
          excludeAdditions: mode.excludeAdditions,
        });
        const latencyMs = Math.round(performance.now() - started);

        rows.push({
          entry,
          query,
          mode: mode.label,
          result,
          rank: result.ok ? rankOf(entry, result.value) : null,
          latencyMs,
        });
      }
    }
  }

  console.log(
    `Probe: ${entries.length} entries, ${rows.length} requests, limit ${LIMIT}, one at a time.`,
  );
  console.log("");
  console.log(
    "| Entry | Query | Mode | Rank | Found | First results | Latency |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) console.log(formatRow(row));
  console.log("");

  // Nothing was measured, so there is no verdict to record: a FAIL printed
  // here would read as the catalogue's answer rather than as an outage.
  if (rows.every((row) => !row.result.ok)) {
    console.error(`No request succeeded — all ${rows.length} failed.`);
    process.exitCode = 1;
    return;
  }

  const outcomes: EntryOutcome[] = entries.map((entry) => ({
    entry,
    ranks: rows.filter((row) => row.entry === entry).map((row) => row.rank),
  }));

  const tally = tallyByKind(outcomes);
  for (const kind of PROBE_KINDS) {
    console.log(
      `- ${kind}: found ${tally[kind].found} of ${tally[kind].total} within the first ${FOUND_WITHIN}`,
    );
  }
  console.log("");
  console.log(`Verdict: ${verdict(outcomes)}`);

  // A call meant to fail, so the record shows the failure path end to end. It
  // is not a measurement and does not count towards the totals above.
  const failurePath = await catalog.searchGames(entries[0].queries[0], {
    timeoutMs: 1,
  });
  console.log(
    failurePath.ok
      ? "Failure path: not triggered — the 1 ms call succeeded"
      : `Failure path: ${describeFailure(failurePath)}`,
  );
}

// A failed request is reported in its row above; here we only catch failures
// of the probe itself — a missing key, an unreadable or malformed title file.
main().catch((err: unknown) => {
  console.error(`Probe aborted: ${errorMessage(err)}`);
  process.exitCode = 1;
});
