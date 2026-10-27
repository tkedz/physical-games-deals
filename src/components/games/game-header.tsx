import type { CatalogGame } from "@/lib/catalog/types";
import { releaseYear } from "@/lib/watchlist/rules";

/**
 * The id of a game's name on its page, which the watch control's button is
 * described by. Built from the game's id, as a deal card's title id is from
 * the deal's, so the kitchen sink can show several headers on one page.
 */
export function gameNameId(gameId: number): string {
  return `game-${gameId}-name`;
}

/**
 * The top of a game's page: the game's name as the page's heading, then its
 * release year and the catalogue's platform names, as a search result shows
 * them, and a line saying what the page lists. The platform names are
 * information only, not a filter: the page lists the game's deals on every
 * platform.
 */
export function GameHeader({ game }: { game: CatalogGame }) {
  const details = [
    releaseYear(game.released),
    game.platforms.map((catalogPlatform) => catalogPlatform.name).join(", "),
  ]
    .filter((detail) => detail !== null && detail !== "")
    .join(" · ");

  return (
    // wrap-anywhere lets a long unbroken word in a name break instead of
    // pushing the page wider than a 375 px screen, as on the deal card.
    <div className="flex flex-col gap-2 wrap-anywhere">
      <h1
        id={gameNameId(game.id)}
        className="font-heading text-3xl font-semibold tracking-tight"
      >
        {game.name}
      </h1>
      {details !== "" && <p className="text-muted-foreground">{details}</p>}
      <p className="text-muted-foreground">
        Promocje na pudełkowe wydania tej gry z polskich serwisów z okazjami, od
        najnowszych.
      </p>
    </div>
  );
}
