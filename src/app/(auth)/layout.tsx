import Link from "next/link";

/** The centred single column that /login and /signup share. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        <Link href="/">Okazje na gry pudełkowe</Link>
      </h1>
      {children}
    </main>
  );
}
