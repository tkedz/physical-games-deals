import type { ReactNode } from "react";

/**
 * The frame of a game's page, `/games/<id>`: the column every state of the
 * page sits in — the game with its deals, or the catalogue's failure. Unlike
 * DealsPage it holds no heading, because the heading is the game's name,
 * which only the found game has.
 *
 * It sits on the header's column (src/app/(app)/layout.tsx), like DealsPage.
 * No hooks and no server-only imports, so any state may render it.
 */
export function GamePage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      {children}
    </main>
  );
}
