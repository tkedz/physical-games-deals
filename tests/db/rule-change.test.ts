/**
 * What a change to the matching rule leaves behind when its migration forgets
 * a duty. create or replace function recomputes neither the keys public.deals
 * stores nor the folded phrase index, so a migration that changes a matching
 * function also runs `update public.deals set title = title`, and, for the
 * fold, settles the phrases that newly fold alike and reindexes
 * watchlist_entries_active_phrase_folded (CLAUDE.md, Deal matching). A
 * forgotten recompute silently drops watched games from /my-deals; a
 * forgotten reindex leaves an index that disagrees with its table.
 *
 * The detectors are consistency properties, with no expected key in them:
 * - D1: every deal stores the match_keys and match_text that deal_match_keys
 *   and deal_match_text compute now;
 * - D2: every btree index in public agrees with its table, by amcheck;
 * - D3: no two active phrases of one user and platform fold alike to a
 *   non-empty text, and of the seeded pair the older stays (the settle rule
 *   of 20261012070050: by created_at, then id).
 * They see only rows that existed before a rule change, so the seed
 * (fixtures/rule-change-seed.ts) goes in before the first matching migration.
 *
 * D4 proves D1 and D2 by breaking them, as lessons.md asks of a gate: a
 * synthetic migration stops folding ł, once without and once with the
 * recompute and the reindex. Its expectation names the seeded deals by the
 * characters in their titles, not by their keys. Each of the three databases
 * lives only as long as its describe block.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FOLD_WITHOUT_L_STROKE } from "./fixtures/fold-without-l-stroke";
import {
  CONTROL_TITLE,
  FIXTURE_LINK,
  FIXTURE_USER,
  NEWER_ALIKE,
  OLDER_ALIKE,
  POKEMON_NFC,
  POKEMON_NFD,
  RULE_CHANGE_SEED,
  SEED_DEALS,
  SEED_PHRASES,
  type SeedDeal,
} from "./fixtures/rule-change-seed";
import {
  buildDatabase,
  describeError,
  type Database,
  type Migration,
} from "./harness/database";

/** Dated after the last real migration and before 20261030000000. */
const SYNTHETIC = "20261029000000_synthetic_fold_without_l_stroke.sql";

/** What a fold change owes the rows it leaves behind, short of the settle. */
const RECOMPUTE_AND_REINDEX = `update public.deals set title = title;
reindex index public.watchlist_entries_active_phrase_folded;`;

/** The one index computed from the fold. */
const FOLDED_INDEX = "public.watchlist_entries_active_phrase_folded";

const L_STROKE = /[łŁ]/;

type StaleDeal = {
  title: string;
  storedKeys: string | null;
  freshKeys: string | null;
  storedText: string | null;
  freshText: string | null;
};

type BrokenIndex = { index: string; error: string };

type UnsettledPhrases = {
  userId: string;
  platform: string | null;
  folded: string;
  phrases: string;
};

/** D1: the deals whose stored keys differ from what the rule computes now. */
async function staleDeals(db: Database): Promise<StaleDeal[]> {
  const { rows } = await db.pg.query<StaleDeal>(
    `select d.title,
       d.match_keys::text as "storedKeys", f.keys::text as "freshKeys",
       d.match_text as "storedText", f.folded as "freshText"
     from public.deals as d
     cross join lateral (
       select public.deal_match_keys(d.title, d.english_title, d.alternative_titles) as keys,
              public.deal_match_text(d.title, d.english_title, d.alternative_titles) as folded
     ) as f
     where d.match_keys is distinct from f.keys or d.match_text is distinct from f.folded
     order by d.id`,
  );
  return rows;
}

/** Every btree index in public, schema-qualified. */
async function publicBtreeIndexes(db: Database): Promise<string[]> {
  const { rows } = await db.pg.query<{ name: string }>(
    `select pg_catalog.format('%I.%I', n.nspname, c.relname) as name
     from pg_catalog.pg_index as i
     join pg_catalog.pg_class as c on c.oid = i.indexrelid
     join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     join pg_catalog.pg_am as a on a.oid = c.relam
     where n.nspname = 'public' and a.amname = 'btree'
     order by c.relname`,
  );
  return rows.map((row) => row.name);
}

/**
 * D2: the indexes amcheck finds out of step with their table. heapallindexed
 * recomputes every index tuple from the heap, so an expression index whose
 * function changed fails. amcheck is the superuser's, one index per call.
 */
async function brokenIndexes(
  db: Database,
  indexes: string[],
): Promise<BrokenIndex[]> {
  const broken: BrokenIndex[] = [];
  for (const index of indexes) {
    try {
      await db.asSuperuser(
        "select extensions.bt_index_check($1::text::regclass, true)",
        [index],
      );
    } catch (error) {
      broken.push({ index, error: describeError(error) });
    }
  }
  return broken;
}

/** D3: the groups of active phrases that fold alike, which the settle owes. */
async function unsettledPhrases(db: Database): Promise<UnsettledPhrases[]> {
  const { rows } = await db.pg.query<UnsettledPhrases>(
    `select user_id::text as "userId", platform,
       public.fold_for_matching(phrase) as folded,
       pg_catalog.string_agg(pg_catalog.quote_literal(phrase), ', ' order by created_at, id) as phrases
     from public.watchlist_entries
     where kind = 'phrase' and removed_at is null and public.fold_for_matching(phrase) <> ''
     group by user_id, platform, public.fold_for_matching(phrase)
     having count(*) > 1
     order by 1, 2, 3`,
  );
  return rows;
}

/** The seeded fixture user's phrases with these spellings, oldest first. */
async function activeAndRemoved(
  db: Database,
  phrases: string[],
): Promise<{ phrase: string; removed: boolean }[]> {
  const { rows } = await db.pg.query<{ phrase: string; removed: boolean }>(
    `select phrase, removed_at is not null as removed
     from public.watchlist_entries
     where user_id = $1 and phrase = any ($2::text[])
     order by created_at, id`,
    [FIXTURE_USER, phrases],
  );
  return rows;
}

/**
 * A value as a failure shows it: whole up to `limit` characters, else cut and
 * measured, so that a title past the 1000-character cap does not flood the
 * report.
 */
function shorten(value: string | null, limit: number): string {
  if (value === null) return "null";
  const characters = Array.from(value);
  return characters.length <= limit
    ? value
    : `${characters.slice(0, limit).join("")}… (${characters.length} characters)`;
}

/** A deal's title as a report names it. */
function titled(title: string): string {
  return `„${shorten(title, 60)}”`;
}

/**
 * Each stale deal with the stored and fresh value of every column that
 * differs. Keys and texts get more room than titles, since they differ late.
 */
function staleReport(rows: StaleDeal[]): string {
  const value = (text: string | null) => shorten(text, 160);
  return [
    `D1: ${rows.length} deal(s) store keys the rule no longer computes`,
    ...rows.map((row) => {
      const columns: string[] = [];
      if (row.storedKeys !== row.freshKeys) {
        columns.push(
          `match_keys stored ${value(row.storedKeys)}, fresh ${value(row.freshKeys)}`,
        );
      }
      if (row.storedText !== row.freshText) {
        columns.push(
          `match_text stored „${value(row.storedText)}”, fresh „${value(row.freshText)}”`,
        );
      }
      return `  ${titled(row.title)}: ${columns.join("; ")}`;
    }),
  ].join("\n");
}

function brokenReport(broken: BrokenIndex[]): string {
  return [
    `D2: ${broken.length} index(es) disagree with their table`,
    ...broken.map((entry) => `  ${entry.index}: ${entry.error}`),
  ].join("\n");
}

function unsettledReport(groups: UnsettledPhrases[]): string {
  return [
    `D3: ${groups.length} group(s) of active phrases fold alike`,
    ...groups.map(
      (group) =>
        `  user ${group.userId}, platform ${group.platform ?? "any"}, „${group.folded}”: ${group.phrases}`,
    ),
  ].join("\n");
}

function holdsLStroke(deal: SeedDeal): boolean {
  return [deal.title, deal.englishTitle, ...deal.alternativeTitles].some(
    (title) => L_STROKE.test(title),
  );
}

function foldChange(recompute: boolean): Migration {
  return {
    name: SYNTHETIC,
    sql: recompute
      ? `${FOLD_WITHOUT_L_STROKE}\n${RECOMPUTE_AND_REINDEX}`
      : FOLD_WITHOUT_L_STROKE,
  };
}

describe("after the repository's migrations", () => {
  let db: Database;

  beforeAll(async () => {
    db = await buildDatabase({ seed: RULE_CHANGE_SEED });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("holds every seeded deal and phrase", async () => {
    const { rows } = await db.pg.query<{ deals: number; phrases: number }>(
      `select
         (select count(*)::integer from public.deals where link = $1) as deals,
         (select count(*)::integer from public.watchlist_entries
          where user_id = $2 and kind = 'phrase') as phrases`,
      [FIXTURE_LINK, FIXTURE_USER],
    );
    expect(SEED_DEALS.length).toBeGreaterThan(0);
    expect(SEED_PHRASES.length).toBeGreaterThan(0);
    expect(rows[0]).toEqual({
      deals: SEED_DEALS.length,
      phrases: SEED_PHRASES.length,
    });
  });

  it("D1: every deal stores the keys the rule computes now", async () => {
    const stale = await staleDeals(db);
    expect(stale.length, staleReport(stale)).toBe(0);
  });

  it("D2: every btree index in public agrees with its table", async () => {
    const indexes = await publicBtreeIndexes(db);
    expect(indexes).toContain(FOLDED_INDEX);
    expect(indexes).toContain("public.deals_pkey");
    const broken = await brokenIndexes(db, indexes);
    expect(broken.length, brokenReport(broken)).toBe(0);
  });

  it("D3: no two active phrases of one user and platform fold alike", async () => {
    const unsettled = await unsettledPhrases(db);
    expect(unsettled.length, unsettledReport(unsettled)).toBe(0);
  });

  it("D3: of two seeded phrases that fold alike, the settle kept the older", async () => {
    expect(await activeAndRemoved(db, [OLDER_ALIKE, NEWER_ALIKE])).toEqual([
      { phrase: OLDER_ALIKE, removed: false },
      { phrase: NEWER_ALIKE, removed: true },
    ]);
  });

  it("D3: of the seeded Pokémon in NFC and in NFD, the fold's settle kept the older, NFC one (review F5)", async () => {
    expect(await activeAndRemoved(db, [POKEMON_NFC, POKEMON_NFD])).toEqual([
      { phrase: POKEMON_NFC, removed: false },
      { phrase: POKEMON_NFD, removed: true },
    ]);
  });
});

describe("D4: a fold change that stops folding ł, without the recompute and the reindex", () => {
  let db: Database;

  beforeAll(async () => {
    db = await buildDatabase({
      seed: RULE_CHANGE_SEED,
      extraMigrations: [foldChange(false)],
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("D1 lists the seeded deals with ł or Ł in a title, and only those", async () => {
    // Titles as a report names them, so that a long one cannot flood the diff.
    const expected = SEED_DEALS.filter(holdsLStroke)
      .map((deal) => titled(deal.title))
      .sort();
    expect(expected.length, "the seed holds deals with ł or Ł").toBeGreaterThan(
      0,
    );
    const stale = await staleDeals(db);
    const titles = stale.map((row) => titled(row.title)).sort();
    expect(titles, staleReport(stale)).toEqual(expected);
    expect(titles).not.toContain(titled(CONTROL_TITLE));
  });

  it("D2 fails on the folded phrase index, and on no other", async () => {
    expect(
      SEED_PHRASES.some((entry) => L_STROKE.test(entry.phrase)),
      "the seed holds a phrase with ł or Ł",
    ).toBe(true);
    const broken = await brokenIndexes(db, await publicBtreeIndexes(db));
    expect(
      broken.map((entry) => entry.index),
      brokenReport(broken),
    ).toEqual([FOLDED_INDEX]);
  });
});

describe("D4: the same fold change with the recompute and the reindex", () => {
  let db: Database;

  beforeAll(async () => {
    db = await buildDatabase({
      seed: RULE_CHANGE_SEED,
      extraMigrations: [foldChange(true)],
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("D1 is clean", async () => {
    const stale = await staleDeals(db);
    expect(stale.length, staleReport(stale)).toBe(0);
  });

  it("D2 is clean", async () => {
    const broken = await brokenIndexes(db, await publicBtreeIndexes(db));
    expect(broken.length, brokenReport(broken)).toBe(0);
  });
});
