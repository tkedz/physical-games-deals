import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
// The .mts extension is written out because Node strips the types without
// rewriting the specifier, so this has to be the real file name. TypeScript
// accepts it through "allowImportingTsExtensions" in tsconfig.json.
import { createCollectorClient } from "./supabase.mts";
// The row shape and the write path, shared with import-jsonl.mts so both reach
// collected_posts through the same chunked upsert.
import {
  errorMessage,
  insertPosts,
  toCategories,
  type CollectedPost,
} from "./posts.mts";

const FEEDS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "feeds.json",
);

const TIMEOUT_MS = 20_000;
const CONTENT_LIMIT = 4000;
const USER_AGENT = "cron-collector/0.1 (RSS collector; contact via the repo)";

type Feed = {
  id: string;
  url: string;
  platform: string;
  enabled: boolean;
};

type CustomItem = {
  "content:encoded"?: string;
};

type FeedItem = Parser.Item & CustomItem;

function loadFeeds(): Feed[] {
  const parsed: unknown = JSON.parse(readFileSync(FEEDS_PATH, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("feeds.json must be an array of objects");
  }
  return parsed as Feed[];
}

function makeId(feedId: string, key: string): string {
  return createHash("sha1")
    .update(`${feedId}|${key}`)
    .digest("hex")
    .slice(0, 16);
}

function pickContent(item: FeedItem): string | null {
  const raw =
    item["content:encoded"] ?? item.content ?? item.contentSnippet ?? null;
  if (typeof raw !== "string") return null;
  return raw.slice(0, CONTENT_LIMIT);
}

/**
 * Maps one feed entry to a table row. The only piece of domain logic here, and
 * deliberately pure — no I/O and no clock, `seenAt` is passed in — so it can be
 * called with data the day a test runner arrives.
 *
 * Returns null for an entry with no guid, link or title: there is nothing to
 * hash, and the original collector skipped it too.
 */
export function toCollectedPost(
  feed: Feed,
  item: FeedItem,
  seenAt: string,
): CollectedPost | null {
  const key = item.guid || item.link || item.title;
  if (!key) return null;

  return {
    id: makeId(feed.id, key),
    source: feed.id,
    platform_hint: feed.platform,
    title: item.title ?? null,
    link: item.link ?? null,
    published_at: item.isoDate ?? item.pubDate ?? null,
    categories: toCategories(item.categories),
    content: pickContent(item),
    first_seen_at: seenAt,
  };
}

async function main(): Promise<void> {
  // First, so a missing credential aborts before a single feed is fetched.
  const supabase = createCollectorClient();

  const feeds = loadFeeds();
  const active = feeds.filter((feed) => feed.enabled);
  const skipped = feeds.length - active.length;

  console.log(
    `Feeds in feeds.json: ${feeds.length} (enabled: ${active.length}, disabled: ${skipped})`,
  );

  if (active.length === 0) {
    // Zero enabled feeds is zero succeeding feeds, and feeds.json ships with 15
    // of them: reaching here means the file was edited wrong, not that there
    // was nothing to do.
    console.error(
      'No enabled feeds — fill in the URLs in feeds.json and set "enabled": true.',
    );
    process.exitCode = 1;
    return;
  }

  const parser = new Parser<Record<string, unknown>, CustomItem>({
    timeout: TIMEOUT_MS,
    headers: { "User-Agent": USER_AGENT },
    customFields: { item: ["content:encoded"] },
  });

  // Keyed by id, so a feed returning the same guid twice in one response cannot
  // put two identical rows into one batch. The old in-process Set gave this as
  // a side effect of its dedupe; dropping that would have dropped this too.
  const posts = new Map<string, CollectedPost>();
  let okFeeds = 0;
  let failedFeeds = 0;
  let noKey = 0;

  for (const feed of active) {
    let collectedForFeed = 0;

    try {
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items ?? [];

      for (const item of items) {
        const post = toCollectedPost(feed, item, new Date().toISOString());
        if (post === null) {
          noKey += 1;
          continue;
        }

        posts.set(post.id, post);
        collectedForFeed += 1;
      }

      okFeeds += 1;
      console.log(
        `OK    ${feed.id} — collected: ${collectedForFeed} (items in feed: ${items.length})`,
      );
    } catch (err) {
      failedFeeds += 1;
      console.error(`ERROR ${feed.id} — ${errorMessage(err)}`);
    }
  }

  const rows = [...posts.values()];
  const inserted = rows.length > 0 ? await insertPosts(supabase, rows) : 0;

  console.log("---");
  console.log(
    `Summary: feeds OK ${okFeeds}/${active.length}, failed ${failedFeeds}, ` +
      `rows collected ${rows.length}, new entries ${inserted}` +
      (noKey > 0 ? `, items without a key skipped ${noKey}` : ""),
  );

  // A partly failing run stays green, as the collector's README always treated
  // it. A run in which nothing succeeded must not: that is the failure the
  // original hid by counting failedFeeds and never reaching the exit code.
  if (okFeeds === 0) {
    console.error(`No feed succeeded — all ${active.length} failed.`);
    process.exitCode = 1;
  }
}

// A single feed's error is caught above; here we only catch failures of the
// collector itself — a missing credential, a missing feeds.json, a rejected write.
main().catch((err: unknown) => {
  console.error(`Collector aborted: ${errorMessage(err)}`);
  process.exitCode = 1;
});
