import type { ReactNode } from "react";

/**
 * The frame of `/watchlist`: its heading and one-line intro, above the search
 * and the list. The route's page, loading.tsx and error.tsx all render it, so
 * the heading is the same whatever loads or fails below it, and it paints at
 * once, outside every Suspense boundary.
 *
 * It sits on the header's column (src/app/(app)/layout.tsx), like DealsPage.
 * No hooks and no server-only imports, because error.tsx, a Client Component,
 * renders it too.
 */
export function WatchlistPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Lista obserwowanych
        </h1>
        <p className="text-muted-foreground">
          Gry z katalogu i frazy, których okazje chcesz śledzić — na wybranej
          platformie albo na dowolnej.
        </p>
      </div>
      {children}
    </main>
  );
}
