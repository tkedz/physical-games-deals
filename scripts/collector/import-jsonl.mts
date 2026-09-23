/**
 * Loads a JSONL export produced by the old collector into public.collected_posts.
 *
 *   npm run collect:import -- <path to the .jsonl export>
 *
 * Repeatable on purpose: the cutover runs it twice — once as a rehearsal on the
 * staged snapshot, once on a fresh export taken after the old cron's last run.
 * Re-running it is safe because the id is the collector's own hash and the write
 * is `on conflict do nothing`, so a line already in the table is a no-op.
 *
 * The export file itself is never committed — the table is the record.
 */
import { readFileSync } from "node:fs";
// The .mts extension is written out because Node strips the types without
// rewriting the specifier, so this has to be the real file name. TypeScript
// accepts it through "allowImportingTsExtensions" in tsconfig.json.
import { createCollectorClient } from "./supabase.mts";
// The line mapper and the write path live next door, in a module with no
// top-level side effects, shared with collect.mts.
import {
  errorMessage,
  insertPosts,
  parsePostLine,
  type CollectedPost,
} from "./posts.mts";

async function main(): Promise<void> {
  const path = process.argv[2];

  if (path === undefined || path === "") {
    console.error(
      "Usage: npm run collect:import -- <path to a .jsonl export of the old collector>",
    );
    process.exitCode = 1;
    return;
  }

  // First, so a missing credential aborts before the file is even read.
  const supabase = createCollectorClient();

  console.log(`Reading ${path}`);

  // Read whole and split, as the original loader did. The exports are around a
  // megabyte, and a partial read is worse here than a slow one.
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  // Keyed by id, so an export that repeats a record — two files concatenated,
  // say — cannot put two identical rows into one batch. PostgREST's behaviour
  // in that case is unverified, and this removes the need to know it.
  const posts = new Map<string, CollectedPost>();
  let read = 0;
  let blank = 0;
  let skipped = 0;
  let noDate = 0;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === "") {
      // A trailing newline makes the last line blank on every well-formed
      // export, so blank lines are not a defect and are counted separately.
      blank += 1;
      continue;
    }

    read += 1;

    const parsed = parsePostLine(trimmed);
    if (!parsed.ok) {
      skipped += 1;
      console.error(`SKIP  line ${index + 1} — ${parsed.reason}`);
      continue;
    }

    if (parsed.droppedDate) noDate += 1;

    posts.set(parsed.post.id, parsed.post);
  }

  const duplicates = read - skipped - posts.size;

  // An export with no records at all, or none usable, means the wrong file was
  // exported rather than that there was nothing to do — the same call the
  // collector makes when no enabled feed exists. Nothing *inserted*, by
  // contrast, is the expected result of a second run and stays green.
  if (read === 0) {
    console.error(`No records in ${path} — nothing to import.`);
    process.exitCode = 1;
    return;
  }

  if (posts.size === 0) {
    console.error(
      `No usable records in ${path} — all ${read} lines were skipped.`,
    );
    process.exitCode = 1;
    return;
  }

  const inserted = await insertPosts(supabase, [...posts.values()]);

  console.log("---");
  console.log(
    `Summary: lines read ${read}, rows inserted ${inserted}, ` +
      `lines skipped ${skipped}` +
      (noDate > 0 ? `, unreadable dates dropped ${noDate}` : "") +
      (blank > 0 ? `, blank lines ignored ${blank}` : "") +
      (duplicates > 0 ? `, duplicate ids collapsed ${duplicates}` : ""),
  );
}

// A malformed line is handled above; here we only catch failures of the import
// itself — a missing credential, an unreadable file, a rejected write.
main().catch((err: unknown) => {
  console.error(`Import aborted: ${errorMessage(err)}`);
  process.exitCode = 1;
});
