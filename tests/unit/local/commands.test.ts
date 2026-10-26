/**
 * The two safety properties of the local stack wrappers (scripts/local/),
 * from Phase 2 of context/archive/2026-10-14-local-supabase-stack/plan.md:
 * - a reset always targets the local database: its arguments carry
 *   `--local` and never `--linked` or `--db-url`, and load the snapshot before
 *   the seed;
 * - nothing printed carries a credential: over the output of `supabase start`
 *   and `supabase status` in every shape the CLI has used, the success path
 *   prints the API and Studio URLs only, and the line screen passes no line
 *   with a key, a JWT, a secret or the database URL.
 *
 * The samples copy the CLI's real formats as captured on 2026-10-14 (CLI
 * 2.117.0): one line of JSON, with `linked_project` when it comes from
 * `status`; a table drawn with box characters; `-o env`; and the older
 * `Label: value` text. Every value in them is a placeholder. The credential-
 * shaped ones are assembled at run time, so that no secret scanner reads this
 * file as a leaked key.
 */
import { describe, expect, it } from "vitest";
import {
  abortReport,
  failureReport,
  findStackUrls,
  plainText,
  resetArgs,
  resetReport,
  screenLine,
  screenText,
  START_ARGS,
  startedReport,
  takeLines,
  withheldNote,
} from "../../../scripts/local/commands.mts";

const SB = "sb_";
const PUBLISHABLE = `${SB}publishable_PLACEHOLDER0000000000000000`;
const SECRET = `${SB}secret_PLACEHOLDER0000000000000000000`;
const JWT_HEADER = ["ey", "JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"].join("");
const ANON_JWT = [
  JWT_HEADER,
  "eyJwbGFjZWhvbGRlciI6ImFub24ifQ",
  "placeholder",
].join(".");
const SERVICE_JWT = [
  JWT_HEADER,
  "eyJwbGFjZWhvbGRlciI6InNlcnZpY2UifQ",
  "placeholder",
].join(".");
const JWT_SECRET = "placeholder-jwt-secret-with-at-least-32-characters";
const DB_URL = [
  "postgresql:",
  "//postgres:placeholder@127.0.0.1:54322/postgres",
].join("");
const S3_ACCESS_KEY = "0123456789abcdef".repeat(2);
const S3_SECRET_KEY = "fedcba9876543210".repeat(4);
/** A generated secret with no label beside it, as an error might quote one. */
const UNLABELLED_SECRET = "Placeholder0Secret1Base64Value2AbCdEf3";

const CREDENTIALS = [
  PUBLISHABLE,
  SECRET,
  ANON_JWT,
  SERVICE_JWT,
  JWT_SECRET,
  DB_URL,
  S3_ACCESS_KEY,
  S3_SECRET_KEY,
  UNLABELLED_SECRET,
];

const API_URL = "http://127.0.0.1:54321";
const STUDIO_URL = "http://127.0.0.1:54323";

/**
 * The lines that show a credential or a piece of one. Every placeholder holds
 * "placeholder" in some case except the S3 keys, which are checked by value
 * and by their last twelve characters.
 */
function leaks(lines: readonly string[]): string[] {
  return lines.filter(
    (line) =>
      /sb_(?:publishable|secret)_|eyJ|postgres(?:ql)?:\/\/|placeholder/i.test(
        line,
      ) ||
      CREDENTIALS.some(
        (value) => line.includes(value) || line.includes(value.slice(-12)),
      ),
  );
}

const STATUS_FIELDS = {
  DB_URL,
  API_URL,
  REST_URL: `${API_URL}/rest/v1`,
  GRAPHQL_URL: `${API_URL}/graphql/v1`,
  MCP_URL: `${API_URL}/mcp`,
  STUDIO_URL,
  PUBLISHABLE_KEY: PUBLISHABLE,
  SECRET_KEY: SECRET,
  JWT_SECRET,
  ANON_KEY: ANON_JWT,
  SERVICE_ROLE_KEY: SERVICE_JWT,
  MAILPIT_URL: "http://127.0.0.1:54324",
  INBUCKET_URL: "http://127.0.0.1:54324",
};

/** The fields a stack with storage adds. */
const STORAGE_FIELDS = {
  STORAGE_S3_URL: `${API_URL}/storage/v1/s3`,
  S3_PROTOCOL_ACCESS_KEY_ID: S3_ACCESS_KEY,
  S3_PROTOCOL_ACCESS_KEY_SECRET: S3_SECRET_KEY,
  S3_PROTOCOL_REGION: "local",
};

const TABLE = [
  "╭──────────────────────────────────────╮",
  "│ 🔧 Development Tools                 │",
  "├─────────┬────────────────────────────┤",
  `│ Studio  │ ${STUDIO_URL}     │`,
  "│ Mailpit │ http://127.0.0.1:54324     │",
  `│ MCP     │ ${API_URL}/mcp │`,
  "╰─────────┴────────────────────────────╯",
  "",
  "╭─────────────────────────────────────────────────╮",
  "│ 🌐 APIs                                         │",
  "├─────────────┬───────────────────────────────────┤",
  `│ Project URL │ ${API_URL}            │`,
  `│ REST        │ ${API_URL}/rest/v1    │`,
  `│ GraphQL     │ ${API_URL}/graphql/v1 │`,
  "╰─────────────┴───────────────────────────────────╯",
  "",
  "╭───────────────────────────────────────────────────────────────╮",
  "│ ⛁ Database                                                    │",
  "├─────┬─────────────────────────────────────────────────────────┤",
  `│ URL │ ${DB_URL} │`,
  "╰─────┴─────────────────────────────────────────────────────────╯",
  "",
  "╭──────────────────────────────────────────────────────────────╮",
  "│ 🔑 Authentication Keys                                       │",
  "├─────────────┬────────────────────────────────────────────────┤",
  `│ Publishable │ ${PUBLISHABLE} │`,
  `│ Secret      │ ${SECRET}      │`,
  "╰─────────────┴────────────────────────────────────────────────╯",
  "",
  "╭───────────────────────────────────────────────────────────────────────╮",
  "│ 📦 Storage (S3)                                                       │",
  "├────────────┬──────────────────────────────────────────────────────────┤",
  `│ URL        │ ${API_URL}/storage/v1/s3                     │`,
  `│ Access Key │ ${S3_ACCESS_KEY}                         │`,
  `│ Secret Key │ ${S3_SECRET_KEY} │`,
  "│ Region     │ local                                                    │",
  "╰────────────┴──────────────────────────────────────────────────────────╯",
].join("\n");

/** The CLI's output in every shape it has used. */
const SAMPLES: { shape: string; stdout: string }[] = [
  {
    shape: "start as one line of JSON",
    stdout: `${JSON.stringify({ ...STATUS_FIELDS, message: "" })}\n`,
  },
  {
    shape: "status as one line of JSON, linked and with storage",
    stdout: `${JSON.stringify({
      linked_project: {
        project_ref: "placeholderref",
        project_name: "placeholder",
        org_slug: "placeholder",
        org_id: "placeholder",
      },
      ...STATUS_FIELDS,
      ...STORAGE_FIELDS,
      message: "",
    })}\n`,
  },
  {
    shape: "indented JSON",
    stdout: `${JSON.stringify({ ...STATUS_FIELDS, ...STORAGE_FIELDS }, null, 2)}\n`,
  },
  { shape: "the table", stdout: `${TABLE}\n` },
  {
    shape: "the table with colours and terminal hyperlinks",
    stdout:
      TABLE.replace(
        `│ Studio  │ ${STUDIO_URL}`,
        `│ Studio  │ \u001b]8;;${STUDIO_URL}\u001b\\\u001b[36m${STUDIO_URL}\u001b[39m\u001b]8;;\u001b\\`,
      )
        .replace(PUBLISHABLE, `\u001b[2m${PUBLISHABLE}\u001b[22m`)
        .replace(SECRET, `\u001b[2m${SECRET}\u001b[22m`) + "\r\n",
  },
  {
    shape: "-o env",
    stdout:
      Object.entries({ ...STATUS_FIELDS, ...STORAGE_FIELDS })
        .map(([name, value]) => `${name}="${value}"`)
        .join("\n") + "\n",
  },
  {
    shape: "the older Label: value text",
    stdout:
      [
        `         API URL: ${API_URL}`,
        `     GraphQL URL: ${API_URL}/graphql/v1`,
        `          DB URL: ${DB_URL}`,
        `      Studio URL: ${STUDIO_URL}`,
        `      JWT secret: ${JWT_SECRET}`,
        `        anon key: ${ANON_JWT}`,
        `service_role key: ${SERVICE_JWT}`,
        `   S3 Access Key: ${S3_ACCESS_KEY}`,
        `   S3 Secret Key: ${S3_SECRET_KEY}`,
      ].join("\n") + "\n",
  },
];

describe("the start arguments", () => {
  it("start the stack without the services the app never uses", () => {
    expect(START_ARGS).toEqual([
      "start",
      "-x",
      "realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor",
    ]);
  });
});

describe("the reset arguments", () => {
  it.each([false, true])(
    "reset the local database and never a linked or named one (snapshot: %s)",
    (snapshotExists) => {
      const args = resetArgs(snapshotExists);
      expect(args.slice(0, 3)).toEqual(["db", "reset", "--local"]);
      expect(
        args.filter((arg) => /^--(?:linked|db-url)(?:=|$)/.test(arg)),
      ).toEqual([]);
    },
  );

  it("load the seed alone when there is no snapshot", () => {
    expect(resetArgs(false)).toEqual([
      "db",
      "reset",
      "--local",
      "--sql-paths",
      "./seed.sql",
    ]);
  });

  it("load the snapshot first and the seed after it", () => {
    expect(resetArgs(true)).toEqual([
      "db",
      "reset",
      "--local",
      "--sql-paths",
      "./snapshot.sql",
      "--sql-paths",
      "./seed.sql",
    ]);
  });
});

describe("what a start prints", () => {
  it.each(SAMPLES)("finds the API and Studio URLs in $shape", ({ stdout }) => {
    expect(findStackUrls(stdout)).toEqual({ api: API_URL, studio: STUDIO_URL });
  });

  it.each(SAMPLES)("prints no credential from $shape", ({ stdout }) => {
    const report = startedReport(findStackUrls(stdout));
    expect(leaks(report)).toEqual([]);
    expect(report).toContain(`  API:    ${API_URL}`);
    expect(report).toContain(`  Studio: ${STUDIO_URL}`);
    // The report would pass the line screen unchanged.
    expect(report.map(screenLine)).toEqual(report);
  });

  it.each([
    {
      carrying: "a user and a password",
      url: `http://admin:placeholder@127.0.0.1:54321`,
    },
    { carrying: "a key", url: `${API_URL}/?apikey=${SECRET}` },
    // Nothing in this query looks like a credential, so only the URL rule
    // keeps it out: a query is never printed.
    { carrying: "a query", url: `${API_URL}/?apikey=abc` },
    { carrying: "a fragment", url: `${API_URL}/#apikey=abc` },
  ])("ignores a URL that carries $carrying", ({ url }) => {
    const urls = findStackUrls(
      JSON.stringify({ API_URL: url, STUDIO_URL: url }),
    );
    expect(urls).toEqual({ api: null, studio: null });
    expect(startedReport(urls)).toContain(
      "  API:    not found in the CLI's output",
    );
    expect(startedReport(urls).join("\n")).not.toContain("apikey");
    expect(leaks(startedReport(urls))).toEqual([]);
  });

  it("finds nothing in output of another shape, rather than guessing", () => {
    expect(
      findStackUrls("Started supabase local development setup.\n"),
    ).toEqual({ api: null, studio: null });
  });
});

describe("the line screen", () => {
  it.each(SAMPLES)(
    "passes no line of $shape that carries a credential",
    ({ stdout }) => {
      const screened = screenText(stdout);
      expect(leaks(screened.lines)).toEqual([]);
      expect(screened.withheld).toBeGreaterThan(0);
    },
  );

  it.each([
    PUBLISHABLE,
    SECRET,
    ANON_JWT,
    DB_URL,
    S3_ACCESS_KEY,
    S3_SECRET_KEY,
    UNLABELLED_SECRET,
    `JWT secret: ${JWT_SECRET}`,
    `connecting to ${DB_URL}`,
    "connecting to https://admin:placeholder@db.example/",
    "password=placeholder",
  ])("drops %s", (line) => {
    expect(screenLine(line)).toBeNull();
  });

  it.each([
    "Starting database...",
    "Initialising schema...",
    "Applying migration 20261014111929_grant_collected_posts_to_service_role.sql...",
    "Seeding data from supabase/seed.sql...",
    "Stopped services: [supabase_realtime_10x-physical-games-deals supabase_storage_10x-physical-games-deals]",
    "A new version of Supabase CLI is available: v2.120.0 (currently installed v2.117.0)",
    "We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli",
    'ERROR: relation "public.deals" does not exist (SQLSTATE 42P01)',
    "failed to connect to postgres: dial tcp 127.0.0.1:54322: connectex: No connection could be made because the target machine actively refused it.",
    "Finished supabase db reset on branch main.",
  ])("keeps %s", (line) => {
    expect(screenLine(line)).toBe(line);
  });

  it("removes escape codes before it judges a line", () => {
    expect(
      plainText(
        `\u001b[1mStarting\u001b[0m \u001b]8;;${STUDIO_URL}\u001b\\Studio\u001b]8;;\u001b\\`,
      ),
    ).toBe("Starting Studio");
    // Split by a colour code, "eyJ" is still read as the start of a JWT.
    expect(screenLine("e\u001b[0myJabc")).toBeNull();
  });

  it("judges a line the CLI redraws with a carriage return as one line", () => {
    expect(screenLine(`Starting...\r${SECRET}`)).toBeNull();
    expect(screenLine("Starting database...\r")).toBe("Starting database...");
  });

  it("judges a credential split across two chunks as one line", () => {
    const line = `Secret │ ${SECRET}`;
    const first = takeLines("", line.slice(0, 16));
    expect(first).toEqual({ lines: [], rest: line.slice(0, 16) });
    const second = takeLines(
      first.rest,
      `${line.slice(16)}\nStarting database...\nRest`,
    );
    expect(second).toEqual({
      lines: [line, "Starting database..."],
      rest: "Rest",
    });
    expect(second.lines.map(screenLine)).toEqual([
      null,
      "Starting database...",
    ]);
  });
});

describe("what a failure prints", () => {
  const STDERR = [
    "Starting database...",
    `failed to start: DB_URL=${DB_URL}`,
    `JWT_SECRET=${JWT_SECRET}`,
    "failed to start docker container: Error response from daemon: Ports are not available",
    "Try rerunning the command with --debug to troubleshoot the error.",
  ].join("\n");

  it("shows the CLI's error and leaves its credential lines out", () => {
    expect(screenText(STDERR)).toEqual({
      lines: [
        "Starting database...",
        "failed to start docker container: Error response from daemon: Ports are not available",
        "Try rerunning the command with --debug to troubleshoot the error.",
      ],
      withheld: 2,
    });
  });

  it("names the command, its exit code and how many lines were left out", () => {
    const report = failureReport(START_ARGS, {
      exitCode: 1,
      stdout: SAMPLES[0].stdout,
      withheld: 2,
    });
    expect(leaks(report)).toEqual([]);
    expect(report).toEqual([
      "supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor failed with exit code 1.",
      "3 line(s) of the CLI's output were left out, because they may carry a credential.",
    ]);
  });

  it("prints the screened stdout of a reset", () => {
    expect(
      failureReport(resetArgs(false), {
        exitCode: 1,
        stdout: `supabase start is not running.\nanon key: ${ANON_JWT}\n`,
        withheld: 0,
      }),
    ).toEqual([
      "supabase start is not running.",
      "supabase db reset --local --sql-paths ./seed.sql failed with exit code 1.",
      "1 line(s) of the CLI's output were left out, because they may carry a credential.",
    ]);
  });

  it("screens the wrapper's own error too", () => {
    expect(abortReport("local:reset", new Error("spawn EPERM"))).toBe(
      "local:reset aborted: spawn EPERM",
    );
    const leaky = abortReport("local:start", new Error(`no route: ${DB_URL}`));
    expect(leaks([leaky])).toEqual([]);
    expect(leaky).toBe(
      "local:start aborted: its error is left out, because it may carry a credential",
    );
  });
});

describe("the note on held-back lines", () => {
  it("counts a harmless line the screen dropped, so a success does not hide a step", () => {
    // Seen on the first live reset: a migration whose name holds "key" is
    // dropped like a credential line, and only this note says a line is missing.
    const progress = [
      "Applying migration 20261012070050_match_deals_to_watchlist.sql...",
      "Applying migration 20261012130317_bound_game_match_key.sql...",
    ];
    expect(progress.map(screenLine)).toEqual([progress[0], null]);
    expect(withheldNote(1)).toEqual([
      "1 line(s) of the CLI's output were left out, because they may carry a credential.",
    ]);
    expect(leaks(withheldNote(1))).toEqual([]);
  });

  it("says nothing when no line was held back", () => {
    expect(withheldNote(0)).toEqual([]);
  });
});

describe("what a reset prints", () => {
  it("names the files it loaded", () => {
    expect(resetReport(true)).toEqual([
      "The local database was reset: migrations applied, then supabase/snapshot.sql and supabase/seed.sql loaded.",
    ]);
    expect(resetReport(false)).toEqual([
      "The local database was reset: migrations applied, then supabase/seed.sql loaded. There is no supabase/snapshot.sql to load.",
    ]);
  });
});
