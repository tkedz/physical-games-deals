import Link from "next/link";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * The header every product view shares: a way in for visitors; for users, a
 * link to their watchlist, who is signed in, and a way out.
 *
 * Reading the session makes every view under this layout dynamic. It happens
 * inside a Suspense boundary, so the rest of the page streams without waiting
 * for Auth (node_modules/next/dist/docs/01-app/02-guides/authentication.md,
 * "Auth and streaming"). The links avoid the outline and destructive button
 * variants, whose focus indicator is an open ui-init finding.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="font-heading font-semibold tracking-tight">
            Okazje na gry pudełkowe
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Suspense fallback={<Skeleton className="h-8 w-48" />}>
              <HeaderAuth />
            </Suspense>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}

/** The part of the header that depends on the session. */
async function HeaderAuth() {
  const user = await getCurrentUser();

  return user ? (
    <>
      <Link href="/watchlist" className={buttonVariants({ variant: "ghost" })}>
        Obserwowane
      </Link>
      <span className="min-w-0 text-sm break-all text-muted-foreground">
        {user.email}
      </span>
      <SignOutButton />
    </>
  ) : (
    <>
      <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
        Zaloguj się
      </Link>
      <Link href="/signup" className={buttonVariants()}>
        Załóż konto
      </Link>
    </>
  );
}
