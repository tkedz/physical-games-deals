import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * A game's catalogue art in a fixed 16:9 box, cropped to fill it, or, when the
 * catalogue has none, the same box empty and muted, so rows and headers line
 * up either way. A search result shows the small one, a game's page the wide
 * one; `className` sets the box's width, and the ratio sets its height.
 *
 * - Decorative (`alt=""`): the game's name always stands beside it.
 * - next/image with `unoptimized`: the file is loaded straight from the
 *   catalogue's host, already in the size its use asks for (CatalogImage),
 *   never through the image optimiser at /_next/image, so next.config.ts
 *   needs no `images` key.
 * - `fill`, because the art's own size is unknown: the box sets the size,
 *   as node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
 *   advises for an image of unknown dimensions. No `sizes`: an unoptimized
 *   image has no srcset for it to choose from.
 * - `largest` marks the page's largest image, at the top of the page: it loads
 *   at once and ahead of other images (`loading="eager"`, `fetchPriority`
 *   high), which the same docs prefer to `preload` in most cases. Every other
 *   image loads lazily, as next/image does by default.
 */
export function GameImage({
  url,
  largest = false,
  className,
}: {
  /** The URL for this use, from CatalogImage; null shows the empty box. */
  url: string | null;
  largest?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video shrink-0 overflow-hidden rounded-md bg-muted",
        className,
      )}
    >
      {url !== null && (
        <Image
          src={url}
          alt=""
          fill
          unoptimized
          loading={largest ? "eager" : undefined}
          fetchPriority={largest ? "high" : undefined}
          className="object-cover"
        />
      )}
    </div>
  );
}
