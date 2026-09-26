import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * The header every product view shares: a way in for visitors, and who is
 * signed in plus a way out for users.
 *
 * Reading the session makes every view under this layout dynamic. The links
 * avoid the outline and destructive button variants, whose focus indicator is
 * an open ui-init finding.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="font-heading font-semibold tracking-tight">
            Okazje na gry pudełkowe
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {user ? (
              <>
                <span className="min-w-0 text-sm break-all text-muted-foreground">
                  {user.email}
                </span>
                <SignOutButton />
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Zaloguj się
                </Link>
                <Link href="/signup" className={buttonVariants()}>
                  Załóż konto
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
