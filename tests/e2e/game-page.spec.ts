// The game page, /games/<id>, in the guest paths that hold with no RAWG key
// (context/changes/game-search-and-pages/plan.md, Phase 3): a game the
// catalogue cannot name shows the one catalogue message, a way back to every
// deal and the RAWG credit, and a malformed id answers a real 404. The success
// path needs the live catalogue, which the server under test never calls
// (playwright.config.ts, webServer.env), and is proven below the browser and
// by hand.
// Seed: tests/e2e/seed.spec.ts.
import { expect, test } from "@playwright/test";

// The risk is a visitor's: this file opts out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A catalogue id no earlier run can have stored an answer for, so the page
 * has to ask the catalogue, which fails without a key.
 *
 * Not a fixed id such as 3498: `next start` keeps the catalogue's answers
 * under `.next/cache`, which `next build` leaves in place, for 7 days. One
 * local `npm run build && npm run start`, which reads the real key from
 * `.env.local`, that opened the id would store the game, and this run would
 * then render it from the cache, as designed, and fail while the app is
 * correct; CI starts from an empty cache and would not see it. A failure is
 * never stored, so asking about a fresh id stores nothing either.
 *
 * Fresh per run, from the clock, as the main flow's addresses are. It stays
 * between 1,000,000,000 and 1,999,999,999: a whole number parseGameId accepts
 * (src/lib/games/rules.ts), and far above any id RAWG has given out, so no one
 * opens it by hand. The clock comes back to an id only after 11.5 days, past
 * the 7 days an answer is kept, so even a run against a server holding a key,
 * which stores "no such game", leaves nothing a later run could read.
 */
function unseenGameId(): number {
  return 1_000_000_000 + (Date.now() % 1_000_000_000);
}

test("a guest gets the catalogue message for a game it cannot name, and a real 404 for a malformed id", async ({
  page,
}) => {
  // 1. A game never seen while the catalogue fails: the one message, and no
  // deals, because without the game's name nothing can be matched.
  await page.goto(`/games/${unseenGameId()}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Nie możemy teraz pokazać tej gry",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Katalog gier jest chwilowo niedostępny"),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(0);

  // 2. The RAWG credit, in the footer every app page shares.
  await expect(
    page
      .getByRole("contentinfo")
      .getByRole("link", { name: /^Dane gier: RAWG/ }),
  ).toHaveAttribute("href", "https://rawg.io");

  // 3. The way back to every deal.
  await page.getByRole("link", { name: "Zobacz wszystkie okazje" }).click();
  await expect(page).toHaveURL("/");

  // 4. A malformed id is a 404 with the status to match, not a page that
  // says so under a 200: the route calls notFound() before anything streams.
  const response = await page.goto("/games/abc");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This page could not be found." }),
  ).toBeVisible();

  // No cleanup: the test creates no data, and a failed lookup stores nothing.
});
