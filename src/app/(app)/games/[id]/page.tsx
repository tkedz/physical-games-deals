import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  GameDealsSection,
  GameDealsSkeleton,
} from "@/components/games/game-deals-section";
import { GameHeader } from "@/components/games/game-header";
import { GamePage } from "@/components/games/game-page";
import { GameUnavailable } from "@/components/games/game-unavailable";
import {
  GameWatchControl,
  GameWatchSkeleton,
} from "@/components/games/game-watch-control";
import { parsePage } from "@/lib/deals/page";
import { getCatalogGame } from "@/lib/games/catalog";
import { parseGameId } from "@/lib/games/rules";
import { addGameEntry, removeEntry } from "../../_watchlist/actions";

// Kept out of search results on every outcome: the pages are public, and each
// crawl of an unseen id would spend the shared catalogue quota (the planning
// interview of 2026-10-26, context/changes/game-search-and-pages/change.md).
const ROBOTS: Metadata["robots"] = { index: false, follow: false };

/**
 * The tab's title: the game's name, or a generic one when the id names no
 * game the catalogue can give. The lookup is the page's own, shared through
 * React `cache` (src/lib/games/catalog.ts), so it costs no second request.
 */
export async function generateMetadata({
  params,
}: PageProps<"/games/[id]">): Promise<Metadata> {
  const id = parseGameId((await params).id);
  const lookup = id === null ? null : await getCatalogGame(id);
  const game = lookup?.ok ? lookup.value : null;

  return {
    title: game === null ? "Okazje na grę" : `${game.name} — okazje`,
    robots: ROBOTS,
  };
}

/**
 * `/games/<id>`: one catalogue game, public, with the listed deals that a
 * watchlist entry for it with no platform would match, newest first, a page
 * at a time, and the control to watch it, or to remove it from the list.
 *
 * The order keeps a real 404. notFound() answers with status 404 only while
 * the response has not started streaming, so both calls come before any
 * Suspense boundary, and the segment has no loading.tsx, whose boundary would
 * start the stream before this body runs
 * (node_modules/next/dist/docs/01-app/02-guides/streaming.md, "The HTTP
 * contract"):
 * 1. an id parseGameId refuses is a 404 at once, with no catalogue request;
 * 2. the catalogue's answer: a failure renders GameUnavailable, with status
 *    200; no such game is a 404;
 * 3. otherwise the page. The header paints with the shell, and the watch
 *    control and the deals stream in boundaries of their own. The deals'
 *    boundary is keyed by the page, as on `/`, so moving to another page
 *    brings their skeleton back. A `?page=` that cannot be read is page 1 —
 *    parsePage says why it is not a 404.
 *
 * A game the catalogue answered before is served from the stored answer, even
 * while the catalogue is down; only a game never seen fails
 * (src/lib/games/catalog.ts).
 */
export default async function GameRoute({
  params,
  searchParams,
}: PageProps<"/games/[id]">) {
  const id = parseGameId((await params).id);
  if (id === null) notFound();

  const lookup = await getCatalogGame(id);
  if (!lookup.ok) {
    return (
      <GamePage>
        <GameUnavailable />
      </GamePage>
    );
  }
  const game = lookup.value;
  if (game === null) notFound();

  const page = parsePage((await searchParams).page);

  return (
    <GamePage>
      <GameHeader game={game} />
      <Suspense fallback={<GameWatchSkeleton />}>
        <GameWatchControl
          game={game}
          addGameAction={addGameEntry}
          removeAction={removeEntry}
        />
      </Suspense>
      <Suspense key={page} fallback={<GameDealsSkeleton />}>
        <GameDealsSection game={game} page={page} />
      </Suspense>
    </GamePage>
  );
}
