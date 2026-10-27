// The catalogue search on /, in the guest paths that hold with no RAWG key
// (context/changes/game-search-and-pages/plan.md, Phase 4): the outcome opens
// in an overlay over the deals list without moving it, a guest is offered
// sign-in where a user would watch, Esc closes the overlay and drops the
// search from the URL, the search and the list's page share the URL, a load
// of an address with a search hydrates cleanly, and Tab past the last result
// closes the overlay rather than move focus under it.
// Results from the live catalogue need a key, which the server under test
// never has (playwright.config.ts, webServer.env); a signed-in user's watch
// buttons in the overlay are checked by hand.
// Seed: tests/e2e/seed.spec.ts. It names no deal and asserts no deal count, so
// it holds on supabase/seed.sql alone (CI) and on the production snapshot.
import { expect, test } from "@playwright/test";

// The risk is a visitor's: this file opts out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A query no earlier run can have stored an answer for, so the search has to
 * ask the catalogue, which fails without a key.
 *
 * Not a fixed query: `next start` keeps the catalogue's answers under
 * `.next/cache`, which `next build` leaves in place, for 24 hours, keyed by
 * the query in lower case with its spaces collapsed. One local
 * `npm run build && npm run start`, which reads the real key from
 * `.env.local`, that searched for it would store the results, and this run
 * would then show them from the cache, as designed, and fail while the app is
 * correct; CI starts from an empty cache and would not see it. A failure is
 * never stored, so searching for a fresh query stores nothing either.
 *
 * Fresh per run, from the clock, as the game page's id is
 * (tests/e2e/game-page.spec.ts). Between 3 and 100 characters, so the phrase
 * offer shows under the catalogue's message.
 */
function unseenQuery(): string {
  return `e2e szukanie ${Date.now()}`;
}

// How React reports a hydration failure: in words in development, and in a
// production build, which this run is, as a minified error with its number
// (https://react.dev/errors/418 and its neighbours).
const HYDRATION_ERROR = /hydrat|react\.dev\/errors\/(418|423|425)\b/i;

test("a guest searches on / in an overlay that leaves the list in place and shares the URL with the list's page", async ({
  page,
}) => {
  const query = unseenQuery();
  // Every error the page reports while the test runs, read after step 8.
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const searchbox = page.getByRole("searchbox", { name: "Tytuł gry" });
  const overlay = page.getByRole("dialog", { name: "Wyniki wyszukiwania" });
  // A deal card is a list item titled by a level-2 heading; the overlay's
  // result rows, which a server with a key would list, have none.
  const firstDeal = page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 2 }) })
    .first();

  // 1. The list as it stands before any search, measured once the header has
  // settled for a guest and the fonts have loaded, so nothing else moves it.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Załóż konto" })).toBeVisible();
  await expect(firstDeal).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const listBefore = await firstDeal.boundingBox();
  expect(listBefore).not.toBeNull();

  // 2. A search shows the catalogue's one message in the overlay, and the
  // URL carries it.
  await searchbox.fill(query);
  await page.getByRole("button", { name: "Szukaj" }).click();
  await expect(
    overlay.getByText("Katalog gier jest chwilowo niedostępny"),
  ).toBeVisible();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === query);

  // 3. The overlay lies over the list: the first deal has not moved.
  expect(await firstDeal.boundingBox()).toEqual(listBefore);

  // 4. Esc closes the overlay, and the URL loses the search.
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
  await expect(page).toHaveURL("/");

  // 5. A guest is offered sign-in where a user would watch the phrase. The
  // field still holds the query, so Enter searches for it again.
  await searchbox.press("Enter");
  await overlay
    .getByRole("link", { name: "Zaloguj się, aby obserwować" })
    .click();
  await expect(page).toHaveURL("/login");

  // 6. A search from page 2 of the list stays on page 2, and closing it
  // drops only the search. The URL is asserted, not the cards: how many
  // pages the list has depends on the data.
  await page.goto("/?page=2");
  await searchbox.fill(query);
  await searchbox.press("Enter");
  await expect(overlay).toBeVisible();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/" &&
      url.searchParams.get("page") === "2" &&
      url.searchParams.get("q") === query,
  );
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
  await expect(page).toHaveURL("/?page=2");

  // 7. An address that carries a search, loaded afresh: the overlay opens as
  // the page hydrates, next to the list, which streams in on its own.
  const errorsBefore = pageErrors.length;
  await page.goto(`/?q=${encodeURIComponent(query)}`);
  const lastControl = overlay.getByRole("link", {
    name: "Zaloguj się, aby obserwować",
  });
  await expect(lastControl).toBeVisible();
  await expect(firstDeal).toBeVisible();

  // 8. Shift+Tab from the overlay's first control goes back to the form and
  // keeps the overlay open. Tab past its last control closes it, as Esc
  // does, and goes on to the first deal's first link, which nothing covers.
  await overlay
    .getByRole("button", { name: "Zamknij wyniki wyszukiwania" })
    .focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Szukaj" })).toBeFocused();
  await expect(overlay).toBeVisible();
  await lastControl.focus();
  await page.keyboard.press("Tab");
  await expect(overlay).toBeHidden();
  await expect(page).toHaveURL("/");
  const firstDealLink = firstDeal.getByRole("link").first();
  await expect(firstDealLink).toBeFocused();
  await expect(firstDealLink).toBeVisible();
  expect(
    await firstDealLink.evaluate((link) => {
      const box = link.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return top !== null && link.contains(top);
    }),
  ).toBe(true);

  // The load in step 7 hydrated with no error, read once the close in step 8
  // has rendered the page again, so every part of it has hydrated by then.
  expect(
    pageErrors.slice(errorsBefore).filter((text) => HYDRATION_ERROR.test(text)),
  ).toEqual([]);

  // No cleanup: the test creates no data, and a failed search stores nothing.
});
