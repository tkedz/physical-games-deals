import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsError, DealsResults } from "@/components/deals/deals-section";
import { FreshnessNote } from "@/components/deals/freshness-note";
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Freshness } from "@/lib/deals/freshness";
import type { ListedDeal } from "@/lib/deals/queries";
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

// Sample deals for "Okazje", at fixed times rather than the clock's, so every
// load renders the same. Between them they hold every variant of the card:
// - with and without a discount, and with and without an expiry, stated as a
//   day (101) and as an hour (103);
// - with a shop link (101, 103, 105), and with the post link alone (102, 104);
// - without a platform, and in euro (103);
// - a title long enough to wrap at 375 px, ending in an unbroken word (104);
// - one game of a set offer (105, the case recorded as #58 in
//   context/changes/physical-deals-from-real-posts/review.md).
const sampleDeals: ListedDeal[] = [
  {
    id: 101,
    link: "https://example.com/pepper/silent-hill-2",
    source: "pepper-ps5",
    published_at: "2026-10-06T10:05:00.000Z",
    platform: "ps5",
    title: "Silent Hill 2",
    set_with: [],
    price_amount: 129.99,
    currency: "PLN",
    discount_percent: 35,
    // The end of 12 October in Warsaw.
    expires_at: "2026-10-12T22:00:00.000Z",
    shop_url: "https://example.com/sklep/silent-hill-2",
    shop_name: "Media Expert",
  },
  {
    id: 102,
    link: "https://example.com/lowcygier/zelda-tears-of-the-kingdom",
    source: "lowcygier-promocje-pudelkowe",
    published_at: "2026-10-05T16:40:00.000Z",
    platform: "switch",
    title: "The Legend of Zelda: Tears of the Kingdom",
    set_with: [],
    price_amount: 219,
    currency: "PLN",
    discount_percent: null,
    expires_at: null,
    shop_url: null,
    shop_name: null,
  },
  {
    id: 103,
    link: "https://example.com/cenograj/elden-ring",
    source: "cenograj-pudelkowe-nowe",
    published_at: "2026-10-05T08:15:00.000Z",
    platform: null,
    title: "Elden Ring",
    set_with: [],
    price_amount: 29.9,
    currency: "EUR",
    discount_percent: 40,
    // 12:00 on 10 October in Warsaw.
    expires_at: "2026-10-10T10:00:00.000Z",
    shop_url: "https://example.com/sklep/elden-ring",
    shop_name: "Amazon.de",
  },
  {
    id: 104,
    link: "https://example.com/pepper/space-marine-2",
    source: "pepper-xbox-series-x",
    published_at: "2026-10-04T19:30:00.000Z",
    platform: "xbox-series",
    title:
      "Gra Xbox Series X Warhammer 40,000: Space Marine 2 – Edycja Kolekcjonerska Ultramarines z artbookiem i steelbookiem | Pudełkowa SpaceMarine2UltramarinesCollectorsEdition",
    set_with: [],
    price_amount: 1299,
    currency: "PLN",
    discount_percent: 20,
    expires_at: null,
    shop_url: null,
    shop_name: null,
  },
  {
    id: 105,
    link: "https://example.com/lowcygier/star-fox-splatoon-raiders",
    source: "lowcygier-promocje-pudelkowe",
    published_at: "2026-10-03T07:00:00.000Z",
    platform: "switch-2",
    title: "Splatoon Raiders",
    set_with: ["Star Fox"],
    price_amount: 354.78,
    currency: "PLN",
    discount_percent: null,
    expires_at: null,
    shop_url: "https://example.com/sklep/zestaw-star-fox-splatoon-raiders",
    shop_name: "Ultima",
  },
];

// The freshness line's three states, decided already: passed in as data, not
// worked out from the clock.
const freshSample: Freshness = {
  state: "fresh",
  finishedAt: "2026-10-06T06:07:00.000Z",
};

const freshnessSamples: Freshness[] = [
  freshSample,
  { state: "stale", finishedAt: "2026-10-05T18:07:00.000Z" },
  { state: "never" },
];

/**
 * Every named state of src/components/ui and of the deals view's components
 * in src/components/deals, with Polish sample copy: the visual check for
 * theme changes and a reference for new views.
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

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Formularz
        </h2>
        <FieldGroup className="max-w-sm">
          <Field>
            <FieldLabel htmlFor="sample-email">E-mail</FieldLabel>
            <Input id="sample-email" type="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="sample-password">Hasło</FieldLabel>
            <Input
              id="sample-password"
              type="password"
              aria-describedby="sample-password-description"
            />
            <FieldDescription id="sample-password-description">
              Co najmniej 8 znaków.
            </FieldDescription>
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="sample-email-invalid">E-mail</FieldLabel>
            <Input
              id="sample-email-invalid"
              type="email"
              defaultValue="jan.kowalski@"
              aria-invalid
              aria-describedby="sample-email-invalid-error"
            />
            <FieldError id="sample-email-invalid-error">
              Podaj adres e-mail w poprawnym formacie.
            </FieldError>
          </Field>
          <Field data-disabled="true">
            <FieldLabel htmlFor="sample-email-disabled">E-mail</FieldLabel>
            <Input
              id="sample-email-disabled"
              type="email"
              defaultValue="jan.kowalski@example.com"
              disabled
            />
          </Field>
        </FieldGroup>
      </section>

      {/* The deals view's components in every state they can be in, from
          the sample data above: the visual gate before `/` depends on them. */}
      <section className="flex flex-col gap-6">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Okazje
        </h2>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Lista ze stronami
          </h3>
          <DealsResults
            page={2}
            freshness={freshSample}
            deals={sampleDeals}
            hasOlder
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Odświeżenie danych
          </h3>
          {freshnessSamples.map((freshness) => (
            <FreshnessNote key={freshness.state} freshness={freshness} />
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Wczytywanie</h3>
          <DealListSkeleton />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Pusty stan</h3>
          <DealsResults
            page={1}
            freshness={freshSample}
            deals={[]}
            hasOlder={false}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Strona za końcem listy
          </h3>
          <DealsResults
            page={34}
            freshness={freshSample}
            deals={[]}
            hasOlder={false}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Błąd</h3>
          <DealsError />
        </div>
      </section>
    </main>
  );
}
