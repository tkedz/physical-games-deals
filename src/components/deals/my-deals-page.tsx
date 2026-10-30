import type { ReactNode } from "react";

/**
 * The frame of `/my-deals`: its heading and one-line intro, above the user's
 * watchlist and the matched deals below it, or whatever stands in for them.
 * The route's page, loading.tsx and error.tsx all render it, so the heading
 * is the same whether they are loading, shown or failed, and it paints at
 * once, outside every Suspense boundary.
 *
 * It sits on the header's column (src/app/(app)/layout.tsx), like DealsPage.
 * No hooks and no server-only imports, because error.tsx, a Client Component,
 * renders it too.
 */
export function MyDealsPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Moje okazje
        </h1>
        <p className="text-muted-foreground">
          Twoja lista obserwowanych, a pod nią okazje na gry i frazy z niej, od
          najnowszych.
        </p>
      </div>
      {children}
    </main>
  );
}
