/**
 * The decisions of the local stack wrappers, start.mts and reset.mts: the
 * arguments they hand the Supabase CLI, and which of its output may reach the
 * terminal.
 *
 * A module of its own rather than code in those two files, because each of
 * them calls main() at the top level — the split scripts/catalog/coverage.mts
 * makes. Nothing here has a side effect, so tests/unit/local/commands.test.ts
 * calls every decision with data.
 *
 * The output needs deciding because `supabase start` prints the local stack's
 * publishable and secret keys, the legacy JWTs, the JWT secret and the
 * database URL with its password — as one line of JSON or as a table,
 * depending on how the CLI judges its caller — and an agent reads whatever
 * these wrappers print (CLAUDE.md, Secrets). So the CLI's stdout is never
 * echoed. A start that succeeds prints only the API and Studio URLs picked out
 * of it; every other line — stderr as it arrives, stdout after a failure —
 * passes screenLine, which drops any line that may carry a credential.
 */

/** The services `supabase start` leaves out: the app uses none of them. */
export const EXCLUDED_SERVICES = [
  "realtime",
  "storage-api",
  "imgproxy",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
] as const;

/** The arguments of `supabase start`. */
export const START_ARGS: readonly string[] = [
  "start",
  "-x",
  EXCLUDED_SERVICES.join(","),
];

/**
 * The production snapshot, from the repository root. Made by hand with
 * `supabase db dump --linked --data-only`, gitignored, and loaded by a reset
 * when it exists.
 */
export const SNAPSHOT_FILE = "supabase/snapshot.sql";

/**
 * The arguments of `supabase db reset`.
 *
 * `--local` is always written out, although it is the CLI's default, because
 * `--linked` would wipe the hosted project; neither `--linked` nor `--db-url`
 * is ever added. Each `--sql-paths` is relative to supabase/ and force-enables
 * seeding for this reset alone, which is why `[db.seed]` in config.toml can
 * stay disabled. The snapshot goes first and the seed after it, because the
 * seed is written to apply on top of a snapshot.
 */
export function resetArgs(snapshotExists: boolean): string[] {
  return [
    "db",
    "reset",
    "--local",
    ...(snapshotExists ? ["--sql-paths", "./snapshot.sql"] : []),
    "--sql-paths",
    "./seed.sql",
  ];
}

/** What a finished CLI run left behind, as scripts/local/cli.mts reports it. */
export type CliRun = {
  /** The CLI's exit code; 1 when it could not start or a signal ended it. */
  exitCode: number;
  /** Everything the CLI wrote to stdout. Never print it as it is. */
  stdout: string;
  /** How many stderr lines screenLine held back while the CLI ran. */
  withheld: number;
};

// Escape sequences: OSC first (terminal hyperlinks among them), then CSI
// (colours), then any other two-character escape.
const ESCAPES =
  /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-?]*[ -/]*[@-~]|\u001b[@-_]/g;

// Control characters left after the escapes, tab excepted. A carriage return
// goes too, so a line the CLI redraws is judged and printed as one line.
const CONTROLS = /[\u0000-\u0008\u000a-\u001f\u007f]/g;

/**
 * A line as it may be printed: without escape sequences and control
 * characters, so that neither can split a credential past the checks below or
 * redraw what the terminal shows.
 */
export function plainText(line: string): string {
  return line.replace(ESCAPES, "").replace(CONTROLS, "");
}

/** Text that marks a line as carrying, or naming, a credential. */
const CREDENTIAL_MARKS: readonly RegExp[] = [
  // The publishable and secret keys.
  /sb_(?:publishable|secret)_/i,
  // A JWT, as the legacy anon and service_role keys are: base64url of `{"`.
  /eyJ[\w-]/,
  // The database URL, with or without its password.
  /postgres(?:ql)?:\/\//i,
  // Any URL that carries a user, and so possibly a password.
  /[a-z][\w+.-]*:\/\/[^\s/?#@]*@/i,
  // A label naming a credential, as the JSON keys and the table rows do:
  // SECRET_KEY, JWT_SECRET, "Publishable", password=…
  /secret|passw|token|jwt|credential|publishable/i,
  // "key" or "keys" as a word or between underscores: ANON_KEY,
  // S3_PROTOCOL_ACCESS_KEY_ID, "Access Key", "Authentication Keys".
  /(?:^|[^a-z])keys?(?:[^a-z]|$)/i,
  // 32 or more hex digits in a row: the S3 keys, a token, a digest.
  /[0-9a-f]{32}/i,
];

/** A run of 32 or more characters base64, base64url or a JWT secret may use. */
const LONG_RUN = /[\w+/=-]{32,}/g;

/**
 * A long run mixing upper case, lower case and digits reads as random, as a
 * generated secret does. Migration names, container names and URL paths are
 * long too, but carry no upper case, so they stay readable.
 */
function looksRandom(run: string): boolean {
  return /[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run);
}

/** Whether a line, as plainText leaves it, may carry a credential. */
export function mayCarryCredential(line: string): boolean {
  return (
    CREDENTIAL_MARKS.some((mark) => mark.test(line)) ||
    (line.match(LONG_RUN) ?? []).some(looksRandom)
  );
}

/**
 * The line as it may be printed, or null when it may carry a credential. A
 * whole line is dropped rather than masked: a mask has to find the end of
 * every secret, and a missed end prints the rest of it.
 */
export function screenLine(line: string): string | null {
  const plain = plainText(line);
  return mayCarryCredential(plain) ? null : plain;
}

/**
 * Splits what arrived on a stream into whole lines and the unfinished rest,
 * which waits for the next chunk. A credential split across two chunks is
 * therefore judged as one line. Only a line feed ends a line; a carriage
 * return stays inside it, and plainText removes it.
 */
export function takeLines(
  pending: string,
  chunk: string,
): { lines: string[]; rest: string } {
  const lines = (pending + chunk).split("\n");
  const rest = lines.pop() ?? "";
  return { lines, rest };
}

/** The printable, non-blank lines of a text, and how many were held back. */
export function screenText(text: string): {
  lines: string[];
  withheld: number;
} {
  const lines: string[] = [];
  let withheld = 0;
  for (const line of text.split("\n")) {
    const shown = screenLine(line);
    if (shown === null) withheld += 1;
    else if (shown.trim() !== "") lines.push(shown);
  }
  return { lines, withheld };
}

/** The two URLs a start prints: the API's, which the app is pointed at, and Studio's. */
export type StackUrls = { api: string | null; studio: string | null };

/**
 * The labels each URL goes by, lowercased, with underscores read as spaces:
 * API_URL and STUDIO_URL in the JSON, "Project URL" and "Studio" in the table,
 * "API URL" and "Studio URL" in the CLI's older text output.
 */
const URL_LABELS: Record<keyof StackUrls, readonly string[]> = {
  api: ["api url", "project url"],
  studio: ["studio url", "studio"],
};

/**
 * An http(s) URL of a host, an optional port and an optional path, the only
 * value the success path prints: no user, no query and no fragment, so it
 * cannot carry a key.
 */
const PRINTABLE_URL = /^https?:\/\/[\w.:[\]-]+(?:\/[\w.~/-]*)?$/;

function fieldOf(label: string): keyof StackUrls | null {
  const normalised = label
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");
  for (const field of ["api", "studio"] as const) {
    if (URL_LABELS[field].includes(normalised)) return field;
  }
  return null;
}

/** The string members of a JSON object, or nothing when the text is not one. */
function jsonPairs(text: string): [string, string][] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

/**
 * The label and value a line of the CLI's output holds, in any of its shapes:
 * a JSON object on one line, a table row (`│ Studio │ http://… │`), or
 * `KEY=value`, `KEY="value"` and `Label: value`.
 */
function linePairs(line: string): [string, string][] {
  const plain = plainText(line).trim();
  if (plain.startsWith("{")) return jsonPairs(plain);

  const cells = plain
    .split(/[│┃|]/)
    .map((cell) => cell.trim())
    .filter((cell) => cell !== "");
  if (cells.length === 2) return [[cells[0], cells[1]]];

  const match = /^([A-Za-z][\w ]*?)\s*[:=]\s*"?([^\s"]+)"?$/.exec(plain);
  return match ? [[match[1], match[2]]] : [];
}

/**
 * The API and Studio URLs in the stdout of `supabase start` or `status`,
 * whichever shape it took, and whatever else it holds. A value counts only
 * when it is a printable URL that screenLine would pass; anything else under
 * those labels is ignored, so the result is safe to print.
 */
export function findStackUrls(stdout: string): StackUrls {
  const urls: StackUrls = { api: null, studio: null };
  // The whole text first, in case the JSON came indented over several lines.
  const pairs = [
    ...jsonPairs(plainText(stdout.replace(/\r?\n/g, " "))),
    ...stdout.split("\n").flatMap(linePairs),
  ];
  for (const [label, value] of pairs) {
    const field = fieldOf(label);
    if (
      field !== null &&
      urls[field] === null &&
      PRINTABLE_URL.test(value) &&
      !mayCarryCredential(value)
    ) {
      urls[field] = value;
    }
  }
  return urls;
}

/**
 * What `npm run local:start` prints once the stack runs. Every line of it
 * would pass screenLine as it is.
 */
export function startedReport(urls: StackUrls): string[] {
  const missing = "not found in the CLI's output";
  return [
    "The local Supabase stack is running.",
    `  API:    ${urls.api ?? missing}`,
    `  Studio: ${urls.studio ?? missing}`,
    "The rest of the CLI's output is not printed.",
  ];
}

/** What `npm run local:reset` prints once the reset has finished. */
export function resetReport(snapshotLoaded: boolean): string[] {
  return [
    snapshotLoaded
      ? `The local database was reset: migrations applied, then ${SNAPSHOT_FILE} and supabase/seed.sql loaded.`
      : `The local database was reset: migrations applied, then supabase/seed.sql loaded. There is no ${SNAPSHOT_FILE} to load.`,
  ];
}

/**
 * The line a wrapper prints after its report when the screen held lines back,
 * on success as on failure. The screen also drops harmless lines — a migration
 * whose name holds "key" — so the count keeps a missing line from reading as a
 * step that never ran.
 */
export function withheldNote(withheld: number): string[] {
  return withheld > 0
    ? [
        `${withheld} line(s) of the CLI's output were left out, because they may carry a credential.`,
      ]
    : [];
}

/**
 * What a wrapper prints after the CLI failed: its stdout, screened, then the
 * command and its exit code. Its stderr has already been shown, screened, as
 * it arrived. The count of held-back lines tells a quiet failure from one
 * whose explanation was dropped.
 */
export function failureReport(args: readonly string[], run: CliRun): string[] {
  const screened = screenText(run.stdout);
  return [
    ...screened.lines,
    `supabase ${args.join(" ")} failed with exit code ${run.exitCode}.`,
    ...withheldNote(run.withheld + screened.withheld),
  ];
}

/** The message a wrapper prints when it fails itself, screened like the CLI's lines. */
export function abortReport(script: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const shown = screenText(message).lines.join(" ");
  return `${script} aborted: ${shown || "its error is left out, because it may carry a credential"}`;
}
