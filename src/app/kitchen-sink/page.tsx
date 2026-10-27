import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DealList } from "@/components/deals/deal-list";
import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsError, DealsResults } from "@/components/deals/deals-section";
import { FreshnessNote } from "@/components/deals/freshness-note";
import {
  MyDealsError,
  MyDealsNoEntries,
  MyDealsResults,
  MyDealsSkeleton,
} from "@/components/deals/my-deals-section";
import {
  GameDealsResults,
  GameDealsSkeleton,
} from "@/components/games/game-deals-section";
import { GameHeader } from "@/components/games/game-header";
import { GameUnavailable } from "@/components/games/game-unavailable";
import {
  GameWatchSkeleton,
  GameWatchView,
} from "@/components/games/game-watch-control";
import { SearchOverlay } from "@/components/search/search-overlay";
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
import { CatalogSearchForm } from "@/components/watchlist/catalog-search-form";
import { RawgAttribution } from "@/components/watchlist/rawg-attribution";
import { SearchResultRow } from "@/components/watchlist/search-result-row";
import {
  CatalogUnavailable,
  SearchNoResults,
  SearchResultsList,
  SearchResultsSkeleton,
} from "@/components/watchlist/search-results";
import {
  WatchlistEmpty,
  WatchlistEntries,
  WatchlistError,
  WatchlistSkeleton,
} from "@/components/watchlist/watchlist-entries";
import type { CatalogGame, CatalogPlatform } from "@/lib/catalog/types";
import type { Freshness } from "@/lib/deals/freshness";
import type { ListedDeal } from "@/lib/deals/queries";
import { isKitchenSinkVisible } from "@/lib/kitchen-sink";
import type { WatchlistEntry } from "@/lib/watchlist/types";

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
//   context/archive/2026-09-28-physical-deals-from-real-posts/review.md).
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

// "Moje okazje" shows the same sample deals, split across its two pages of
// results. They take ids of their own, because a card's title id is built from
// the deal's id and "Okazje" already shows every sample deal: element ids must
// stay unique on the page.
const myDealsSamples: ListedDeal[] = sampleDeals.map((deal) => ({
  ...deal,
  id: deal.id + 100,
}));

// The freshness line's three states, decided already: passed in as data, not
// worked out from the clock.
const freshSample: Freshness = {
  state: "fresh",
  finishedAt: "2026-10-06T06:07:00.000Z",
};

const staleSample: Freshness = {
  state: "stale",
  finishedAt: "2026-10-05T18:07:00.000Z",
};

const freshnessSamples: Freshness[] = [
  freshSample,
  staleSample,
  { state: "never" },
];

// Sample catalogue answers and list entries for "Lista obserwowanych", in the
// shapes the catalogue and the list's read return. The platforms carry RAWG's
// names; the game and entry ids are made up. Between them they hold every
// variant of a row:
// - a result the list holds for the chosen platform (Fire Emblem Engage, on
//   the list for any platform), and results it does not;
// - a result without a release date (Ys Memoire), and one with four
//   platforms, long enough to wrap at 375 px (Ys X);
// - a phrase the list already holds ("fire emblem" against "Fire Emblem");
// - entries for a game on any platform, a game pinned to PS5, a phrase on any
//   platform and a pinned phrase, newest first, as the read orders them.
const catalogPlatforms = {
  pc: { id: 4, slug: "pc", name: "PC" },
  ps5: { id: 187, slug: "playstation5", name: "PlayStation 5" },
  ps4: { id: 18, slug: "playstation4", name: "PlayStation 4" },
  switch: { id: 7, slug: "nintendo-switch", name: "Nintendo Switch" },
} as const satisfies Record<string, CatalogPlatform>;

const fireEmblemResults: CatalogGame[] = [
  {
    id: 900101,
    slug: "fire-emblem-three-houses",
    name: "Fire Emblem: Three Houses",
    released: "2019-07-26",
    platforms: [catalogPlatforms.switch],
    imageUrl: null,
  },
  {
    id: 900102,
    slug: "fire-emblem-engage",
    name: "Fire Emblem Engage",
    released: "2023-01-20",
    platforms: [catalogPlatforms.switch],
    imageUrl: null,
  },
  {
    id: 900103,
    slug: "fire-emblem-warriors-three-hopes",
    name: "Fire Emblem Warriors: Three Hopes",
    released: "2022-06-24",
    platforms: [catalogPlatforms.switch],
    imageUrl: null,
  },
];

const ysResults: CatalogGame[] = [
  {
    id: 900201,
    slug: "ys-x-nordics",
    name: "Ys X: Nordics",
    released: "2024-10-25",
    platforms: [
      catalogPlatforms.ps5,
      catalogPlatforms.ps4,
      catalogPlatforms.switch,
      catalogPlatforms.pc,
    ],
    imageUrl: null,
  },
  {
    id: 900202,
    slug: "ys-viii-lacrimosa-of-dana",
    name: "Ys VIII: Lacrimosa of DANA",
    released: "2017-09-12",
    platforms: [
      catalogPlatforms.ps4,
      catalogPlatforms.switch,
      catalogPlatforms.pc,
    ],
    imageUrl: null,
  },
  {
    id: 900203,
    slug: "ys-memoire-revelations-in-celceta",
    name: "Ys Memoire: Revelations in Celceta",
    released: null,
    platforms: [catalogPlatforms.ps5, catalogPlatforms.switch],
    imageUrl: null,
  },
];

const sampleEntries: WatchlistEntry[] = [
  {
    id: 4,
    kind: "game",
    platform: null,
    game_id: 900102,
    game_slug: "fire-emblem-engage",
    game_name: "Fire Emblem Engage",
    game_released: "2023-01-20",
  },
  {
    id: 3,
    kind: "game",
    platform: "ps5",
    game_id: 900301,
    game_slug: "silent-hill-2",
    game_name: "Silent Hill 2",
    game_released: "2024-10-08",
  },
  { id: 2, kind: "phrase", platform: null, phrase: "Fire Emblem" },
  { id: 1, kind: "phrase", platform: "switch-2", phrase: "Wiedźmin" },
];

// "Strona gry" shows one game, Fire Emblem Engage, which the sample list
// holds for any platform: with that list its watch control reads "Na liście",
// and with an empty one it offers "Obserwuj". Every control is described by
// the one header's name. Its deals take ids of their own, for the reason
// myDealsSamples gives.
const gamePageSample: CatalogGame = fireEmblemResults[1];

const gameDealsSamples: ListedDeal[] = sampleDeals
  .slice(0, 2)
  .map((deal) => ({ ...deal, id: deal.id + 200 }));

/**
 * The short list of deals "Wyszukiwarka nad okazjami" opens one overlay over,
 * the first three sample deals. Each overlay's list takes ids of its own, for
 * the reason myDealsSamples gives: `offset` 300 gives 401–403, 310 gives
 * 411–413, and so on.
 */
function overlayDealSamples(offset: number): ListedDeal[] {
  return sampleDeals
    .slice(0, 3)
    .map((deal) => ({ ...deal, id: deal.id + offset }));
}

/**
 * Every named state of src/components/ui and of the deals, search, watchlist
 * and game views' components in src/components/deals, src/components/search,
 * src/components/watchlist and src/components/games, with Polish sample copy:
 * the visual check for theme changes and a reference for new views.
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

      {/* The search on `/`, its overlay open over a list of deals, in each
          state of its outcome, from the sample data above: the visual gate
          before the search on `/` depends on them. No action is passed, so
          every button renders inert, and no close address either, so the
          overlays stay open: Esc, a press outside and × do nothing here.
          Nothing reaches Supabase or the catalogue. Each overlay hangs from
          its own form and covers the list under it. */}
      <section className="flex flex-col gap-6">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Wyszukiwarka nad okazjami
        </h2>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Wyniki dla zalogowanego
          </h3>
          <div className="flex flex-col gap-6">
            <SearchOverlay
              form={
                <CatalogSearchForm
                  defaultQuery="fire emblem"
                  defaultPlatform={null}
                />
              }
              open
              closeHref={null}
            >
              <SearchResultsList
                query="fire emblem"
                platform={null}
                signedIn
                games={fireEmblemResults}
                entries={sampleEntries}
              />
            </SearchOverlay>
            <DealList deals={overlayDealSamples(300)} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Wyniki dla gościa
          </h3>
          <div className="flex flex-col gap-6">
            <SearchOverlay
              form={
                <CatalogSearchForm defaultQuery="ys x" defaultPlatform="ps5" />
              }
              open
              closeHref={null}
            >
              <SearchResultsList
                query="ys x"
                platform="ps5"
                signedIn={false}
                games={ysResults}
                entries={[]}
              />
            </SearchOverlay>
            <DealList deals={overlayDealSamples(310)} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Brak wyników</h3>
          <div className="flex flex-col gap-6">
            <SearchOverlay
              form={
                <CatalogSearchForm
                  defaultQuery="fortune's weave"
                  defaultPlatform="switch-2"
                />
              }
              open
              closeHref={null}
            >
              <SearchNoResults
                query="fortune's weave"
                platform="switch-2"
                signedIn
                entries={sampleEntries}
              />
            </SearchOverlay>
            <DealList deals={overlayDealSamples(320)} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Katalog niedostępny, gość
          </h3>
          <div className="flex flex-col gap-6">
            <SearchOverlay
              form={
                <CatalogSearchForm
                  defaultQuery="silent hill"
                  defaultPlatform={null}
                />
              }
              open
              closeHref={null}
            >
              <CatalogUnavailable
                query="silent hill"
                platform={null}
                signedIn={false}
                entries={[]}
              />
            </SearchOverlay>
            <DealList deals={overlayDealSamples(330)} />
          </div>
        </div>
      </section>

      {/* The `/my-deals` view's components in every state they can be in,
          from the sample data above: the visual gate before `/my-deals`
          depends on them. Nothing here reaches Supabase. */}
      <section className="flex flex-col gap-6">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Moje okazje
        </h2>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Lista ze starszą stroną
          </h3>
          <MyDealsResults
            page={1}
            freshness={freshSample}
            deals={myDealsSamples.slice(0, 3)}
            hasOlder
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Strona 2: nowsze i starsze
          </h3>
          <MyDealsResults
            page={2}
            freshness={freshSample}
            deals={myDealsSamples.slice(3)}
            hasOlder
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Brak dopasowań, dane aktualne
          </h3>
          <MyDealsResults
            page={1}
            freshness={freshSample}
            deals={[]}
            hasOlder={false}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Brak dopasowań, dane nieaktualne
          </h3>
          <MyDealsResults
            page={1}
            freshness={staleSample}
            deals={[]}
            hasOlder={false}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Pusta lista obserwowanych
          </h3>
          <MyDealsNoEntries />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Strona za końcem listy
          </h3>
          <MyDealsResults
            page={4}
            freshness={freshSample}
            deals={[]}
            hasOlder={false}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Błąd</h3>
          <MyDealsError />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Wczytywanie</h3>
          <MyDealsSkeleton />
        </div>
      </section>

      {/* The watchlist view's components in every state they can be in, from
          the sample data above: the visual gate before /watchlist depends on
          them. No action is passed, so every add and remove button renders
          inert, and nothing here reaches Supabase or the catalogue. */}
      <section className="flex flex-col gap-6">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Lista obserwowanych
        </h2>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Formularz wyszukiwania
          </h3>
          <CatalogSearchForm
            defaultQuery="fire emblem"
            defaultPlatform={null}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Wyniki: do dodania i już na liście
          </h3>
          <SearchResultsList
            query="fire emblem"
            platform={null}
            signedIn
            games={fireEmblemResults}
            entries={sampleEntries}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Nieudane dodanie
          </h3>
          <SearchResultRow
            game={fireEmblemResults[0]}
            platform={null}
            state="can_watch"
            initialMessage="Nie udało się zapisać zmiany. Spróbuj ponownie."
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Brak wyników</h3>
          <SearchNoResults
            query="fortune's weave"
            platform="switch-2"
            signedIn
            entries={sampleEntries}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Katalog niedostępny
          </h3>
          <CatalogUnavailable
            query="silent hill"
            platform="ps5"
            signedIn
            entries={sampleEntries}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Zapytanie z dwóch znaków, bez frazy
          </h3>
          <SearchResultsList
            query="ys"
            platform={null}
            signedIn
            games={ysResults}
            entries={sampleEntries}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Wczytywanie wyników
          </h3>
          <SearchResultsSkeleton />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Lista</h3>
          <WatchlistEntries entries={sampleEntries} />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Pusta lista</h3>
          <WatchlistEmpty />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Błąd listy</h3>
          <WatchlistError />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Wczytywanie listy
          </h3>
          <WatchlistSkeleton />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Atrybucja RAWG</h3>
          <RawgAttribution />
        </div>
      </section>

      {/* A game's page, `/games/<id>`, in every state it can be in, from the
          sample data above: the visual gate before the page depends on them.
          No action is passed, so "Obserwuj" renders inert, and nothing here
          reaches Supabase or the catalogue. The header and the unavailable
          state each hold the page's h1. */}
      <section className="flex flex-col gap-6">
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          Strona gry
        </h2>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Nagłówek</h3>
          <GameHeader game={gamePageSample} />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Obserwowanie: do dodania
          </h3>
          <GameWatchView game={gamePageSample} signedIn entries={[]} />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Obserwowanie: już na liście
          </h3>
          <GameWatchView
            game={gamePageSample}
            signedIn
            entries={sampleEntries}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Obserwowanie: nieudane dodanie
          </h3>
          <GameWatchView
            game={gamePageSample}
            signedIn
            entries={[]}
            initialMessage="Nie udało się zapisać zmiany. Spróbuj ponownie."
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Obserwowanie: gość
          </h3>
          <GameWatchView game={gamePageSample} signedIn={false} entries={[]} />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Obserwowanie: wczytywanie
          </h3>
          <GameWatchSkeleton />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Okazje ze stronami
          </h3>
          <GameDealsResults
            gameId={gamePageSample.id}
            page={1}
            freshness={freshSample}
            deals={gameDealsSamples}
            hasOlder
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">Brak okazji</h3>
          <GameDealsResults
            gameId={gamePageSample.id}
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
          <GameDealsResults
            gameId={gamePageSample.id}
            page={3}
            freshness={freshSample}
            deals={[]}
            hasOlder={false}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Wczytywanie okazji
          </h3>
          <GameDealsSkeleton />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-medium">
            Katalog niedostępny
          </h3>
          <GameUnavailable />
        </div>
      </section>
    </main>
  );
}
