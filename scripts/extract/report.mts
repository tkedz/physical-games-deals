/**
 * Writes a random sample of the extracted links out for review.
 *
 *   npm run extract:report -- --sample 100
 *
 * It reads every extracted link from public.post_extractions, a page of 1,000
 * at a time, draws the sample in the script, and then reads the sampled links'
 * deals and posts. The report is UTF-8 Markdown: per link the aggregator, the
 * post's title, link and text as the model read it, and each item the model
 * returned with its kind, edition, evidence, price and platform and whether it
 * is listed; then the counts per aggregator. It goes to
 * scripts/extract/review/, gitignored, because it quotes the posts. The
 * terminal gets the progress, the counts and the report's path.
 *
 * It needs the Supabase credentials only: nothing here calls a model.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
// The .mts extensions are written out because Node strips the types without
// rewriting the specifier, so these have to be the real file names.
import { errorMessage } from "../collector/posts.mts";
import { createCollectorClient } from "../collector/supabase.mts";
import { parseCount } from "./pipeline.mts";
// The decisions live next door, in a module with no top-level side effects —
// this file cannot host them, because it calls main() at the bottom.
import {
  buildReview,
  countByAggregator,
  countsTable,
  drawSample,
  formatReview,
  reportFileName,
} from "./review.mts";
import { loadDeals, loadExtractedLinks, loadPosts } from "./store.mts";

const REVIEW_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "review");

async function main(): Promise<void> {
  // First, so that a missing credential aborts before anything is read.
  const supabase = createCollectorClient();

  const { values } = parseArgs({ options: { sample: { type: "string" } } });
  if (values.sample === undefined) {
    throw new Error(
      "--sample is required: npm run extract:report -- --sample <n>",
    );
  }
  const size = parseCount("--sample", values.sample);
  if (!size.ok) throw new Error(size.reason);

  console.error("Reading the extracted links…");
  const extracted = await loadExtractedLinks(supabase);
  if (extracted.length === 0) {
    throw new Error(
      "public.post_extractions holds no extracted link yet — run npm run extract first",
    );
  }

  const sample = drawSample(extracted, size.value, Math.random);
  console.error(
    `Drew ${sample.length} of ${extracted.length} link(s); reading their deals and posts…`,
  );
  const [deals, posts] = await Promise.all([
    loadDeals(
      supabase,
      sample.map((entry) => entry.link),
    ),
    loadPosts(
      supabase,
      sample.map((entry) => entry.post_id),
    ),
  ]);

  const drawnAt = new Date().toISOString();
  const entries = buildReview(sample, posts, deals);
  const report = formatReview(entries, { total: extracted.length, drawnAt });

  const path = resolve(REVIEW_DIR, reportFileName(drawnAt));
  mkdirSync(REVIEW_DIR, { recursive: true });
  writeFileSync(path, `${report}\n`, "utf8");

  console.log(countsTable(countByAggregator(entries)).join("\n"));
  console.log("");
  console.log(`Full report, link by link: ${relative(process.cwd(), path)}`);
}

// Here we only catch failures of the report itself — a missing credential, a
// bad option, a failed read, a report that could not be written.
main().catch((err: unknown) => {
  console.error(`Report aborted: ${errorMessage(err)}`);
  process.exitCode = 1;
});
