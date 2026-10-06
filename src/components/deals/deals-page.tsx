import type { ReactNode } from "react";

/**
 * The frame of `/`: its heading and one-line intro, above the list or
 * whatever stands in for it. page.tsx, loading.tsx and error.tsx all render
 * it, so the heading is the same whether the list is loading, shown or
 * failed, and it paints at once, outside the list's Suspense boundary.
 *
 * It sits on the header's column (src/app/(app)/layout.tsx). No hooks and no
 * server-only imports, because error.tsx, a Client Component, renders it too.
 */
export function DealsPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Okazje na gry pudełkowe
        </h1>
        <p className="text-muted-foreground">
          Promocje na pudełkowe wydania gier z polskich serwisów z okazjami, od
          najnowszych.
        </p>
      </div>
      {children}
    </main>
  );
}
