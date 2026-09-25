import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { isKitchenSinkVisible } from "@/lib/kitchen-sink";

export const metadata: Metadata = {
  title: "Kitchen sink",
};

// Both button rows render this list, so the disabled row always holds the same
// six variants as the default one.
const buttonSamples = [
  { variant: "default", label: "Zapisz" },
  { variant: "outline", label: "Anuluj" },
  { variant: "secondary", label: "Więcej" },
  { variant: "ghost", label: "Pomiń" },
  { variant: "destructive", label: "Usuń" },
  { variant: "link", label: "Szczegóły" },
] as const;

/**
 * Every named state of src/components/ui, with Polish sample copy: the visual
 * check for theme changes and a reference for new views.
 *
 * The guard stays first, outside any Suspense boundary: notFound() thrown after
 * streaming starts is a soft 404 served as 200
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md).
 * Nothing here reads request-time data, so a production build prerenders the
 * page as a static 404.
 */
export default function KitchenSinkPage() {
  if (
    !isKitchenSinkVisible({
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    })
  ) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Kitchen sink
        </h1>
        <p className="text-sm text-muted-foreground">
          Strona robocza — widoczna tylko lokalnie i na podglądach PR.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Typografia
        </h2>
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-2xl font-semibold tracking-tight">
            Okazje na gry pudełkowe
          </h3>
          <p>
            Silent Hill 2 w wersji pudełkowej na PS5 kosztuje teraz 129,99 zł
            zamiast 199,99 zł.
          </p>
          <p className="text-sm text-muted-foreground">
            Źródło: Pepper · dziś, 12:05
          </p>
          <p className="font-mono text-sm">199,99 zł → 129,99 zł</p>
          <p className="text-xl">Zażółć gęślą jaźń</p>
          <p className="font-mono text-xl">Zażółć gęślą jaźń</p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Przyciski
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {buttonSamples.map(({ variant, label }) => (
            <Button key={variant} variant={variant}>
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {buttonSamples.map(({ variant, label }) => (
            <Button key={variant} variant={variant} disabled>
              {label}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Plakietki
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">−35%</Badge>
          <Badge variant="secondary">PS5</Badge>
          <Badge variant="outline">Pepper</Badge>
          <Badge variant="destructive">Wygasła</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Karta
        </h2>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Silent Hill 2</CardTitle>
            <CardDescription>PS5 · Pepper · 2 godz. temu</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <p className="font-heading text-3xl font-semibold tracking-tight">
              129,99 zł
            </p>
            <Badge>−35%</Badge>
          </CardContent>
          <CardFooter>
            <Button>Przejdź do okazji</Button>
          </CardFooter>
        </Card>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Stany
        </h2>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Wczytywanie</h3>
          <div role="status" className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Wczytujemy okazje…</p>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Pusty stan</h3>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Brak okazji dla Twojej listy</EmptyTitle>
              <EmptyDescription>
                Ostatnie odświeżenie danych: dziś, 14:05.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Błąd</h3>
          <div className="flex flex-col items-start gap-3">
            <Alert variant="destructive">
              <AlertTitle>Nie udało się wczytać okazji</AlertTitle>
              <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
            </Alert>
            <Button variant="outline">Spróbuj ponownie</Button>
          </div>
        </div>
      </section>
    </main>
  );
}
