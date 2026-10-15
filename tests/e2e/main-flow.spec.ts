// Risks #1, #4 and #6 (context/foundation/test-plan.md, §3 Phase 5), in their
// browser round trip: the PRD's primary flow. A guest is sent to sign in; a
// signed-in user starts with an empty watchlist, watches a deal's title as a
// phrase, finds that deal on /my-deals with its price and links, removes the
// phrase, and signs out, after which the server no longer honours the old
// session.
// Seed: tests/e2e/seed.spec.ts. The test data seeds itself from the public
// deals list on /, so it runs on supabase/seed.sql alone (CI) and on a local
// stack holding the production snapshot.
import {
  expect,
  test as base,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  createE2eAdminClient,
  createTestAccount,
  deleteTestAccount,
  findTestAccountId,
  testAccountPassword,
  uniqueTestEmail,
} from "../../scripts/e2e/accounts.mts";

type Account = { email: string; password: string };

// A fresh account per attempt, so the empty state holds by construction and
// a retry or a parallel run never meets another attempt's entries. Deleting
// it removes its watchlist rows too (on delete cascade), and the deletion is
// asserted, so a cleanup that fails turns the run red. The address is
// recorded on the test to find any residue; the password never is.
const test = base.extend<{ account: Account }>({
  // Playwright reads the fixture's dependencies from this destructuring
  // pattern, so it has to be there even though the fixture needs none. The
  // callback is not called `use`, which the React hooks lint rule would take
  // for React's use().
  account: async ({}, provide, testInfo) => {
    const client = createE2eAdminClient();
    const account = {
      email: uniqueTestEmail("e2e-main-flow"),
      password: testAccountPassword(),
    };
    testInfo.annotations.push({
      type: "test-data",
      description: account.email,
    });
    const { id } = await createTestAccount(client, account);

    await provide(account);

    await deleteTestAccount(client, id);
    expect(await findTestAccountId(client, account.email)).toBeNull();
  },
});

// The test signs in and out itself: sign-out ends the session it is pressed
// in, so it must not be the saved one the other specs load.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A price as the deal card writes it (formatPrice, pl-PL): "129,99 zł",
 * digits grouped by a space from 10 000 on.
 */
const PRICE = /^\d[\d\s]*,\d{2}\s\S+$/;

/** Whether a title can be watched as a phrase: 3 to 100 characters. */
function isWatchable(title: string): boolean {
  const length = Array.from(title).length;
  return length >= 3 && length <= 100;
}

/** The deal card, on / or /my-deals, whose title is `title`. */
function dealCard(page: Page, title: string): Locator {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { level: 2, name: title, exact: true }),
  });
}

/** Where each link on a card leads, in order. */
function linkTargets(card: Locator): Promise<(string | null)[]> {
  return card
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
}

test.describe("main flow", () => {
  test("a watched deal title reaches /my-deals with its price and links, and sign-out ends the session on the server", async ({
    page,
    browser,
    baseURL,
    account,
  }) => {
    // 1. Self-seed: as a guest on /, take the first deal whose title can be
    // watched as a phrase and appears on no other card of the page.
    await page.goto("/");
    const titles = page
      .getByRole("listitem")
      .getByRole("heading", { level: 2 });
    await expect(titles.first()).toBeVisible();
    const allTitles = (await titles.allTextContents()).map((t) => t.trim());
    const title = allTitles.find(
      (t) =>
        isWatchable(t) && allTitles.indexOf(t) === allTitles.lastIndexOf(t),
    );
    if (title === undefined) {
      throw new Error(
        "No deal on / has a unique title of 3 to 100 characters.",
      );
    }
    const listedCard = dealCard(page, title);
    const price = await listedCard.getByText(PRICE).innerText();
    const links = await linkTargets(listedCard);
    expect(links.length).toBeGreaterThan(0);

    // 2. Guest redirect: a guest who opens /watchlist lands on the sign-in
    // form.
    await page.goto("/watchlist");
    await expect(page).toHaveURL("/login");

    // 3. Sign-in. The form is a client component with no method: clicked
    // before it hydrates, the browser submits it natively, as a GET that
    // carries both fields in the URL. So prove it is interactive with nothing
    // typed, as tests/e2e/auth.setup.ts does.
    await expect(async () => {
      await page.getByRole("button", { name: "Zaloguj się" }).click();
      await expect(page.getByText("Podaj hasło.")).toBeVisible({
        timeout: 1_000,
      });
    }).toPass();
    await page.getByLabel("E-mail").fill(account.email);
    await page.getByLabel("Hasło").fill(account.password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(page).toHaveURL("/");
    const signOut = page.getByRole("button", { name: "Wyloguj się" });
    await expect(signOut).toBeVisible();

    // 4. Empty state: a new account watches nothing.
    await page.goto("/my-deals");
    await expect(
      page.getByText("Twoja lista obserwowanych jest pusta"),
    ).toBeVisible();

    // 5. Watch the phrase. The button is targeted by its full name, so the
    // step holds whatever the catalogue answers: the server under test has
    // no RAWG key (playwright.config.ts), and a reused one may have.
    await page.goto("/watchlist");
    await page.getByRole("searchbox", { name: "Tytuł gry" }).fill(title);
    await page.getByRole("button", { name: "Szukaj" }).click();
    await page
      .getByRole("button", { name: `Obserwuj frazę „${title}”`, exact: true })
      .click();
    const entry = page.getByRole("listitem").filter({ hasText: `„${title}”` });
    await expect(entry.getByRole("button", { name: "Usuń" })).toBeVisible();

    // 6. The deal reaches /my-deals: a card with that title, the same price
    // and the same links as on /. Its presence, not a count: on snapshot
    // data the phrase may match more deals.
    await page.goto("/my-deals");
    const matchedCard = dealCard(page, title);
    await expect(matchedCard).toBeVisible();
    await expect(matchedCard.getByText(PRICE)).toHaveText(price);
    await expect.poll(() => linkTargets(matchedCard)).toEqual(links);

    // 7. Removal: "Usuń" on the entry, and /my-deals is empty again.
    await page.goto("/watchlist");
    await entry.getByRole("button", { name: "Usuń" }).click();
    await expect(entry).toBeHidden();
    await page.goto("/my-deals");
    await expect(
      page.getByText("Twoja lista obserwowanych jest pusta"),
    ).toBeVisible();

    // 8. Sign-out. The cookies are recorded first, for step 9. The button
    // does nothing until the page hydrates, so it is pressed until the
    // header offers sign-in, and only while it is still there.
    const signedInCookies = await page.context().cookies();
    const signIn = page.getByRole("link", { name: "Zaloguj się" });
    await expect(async () => {
      if (await signOut.isVisible()) await signOut.click({ timeout: 1_000 });
      await expect(signIn).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await page.goto("/my-deals");
    await expect(page).toHaveURL("/login");

    // 9. Server-side session: a new browser carrying the cookies from before
    // sign-out is a guest too. Were the session only cleared in the browser,
    // these cookies would still open /my-deals.
    const replay = await browser.newContext({ baseURL });
    try {
      await replay.addCookies(signedInCookies);
      const replayPage = await replay.newPage();
      await replayPage.goto("/my-deals");
      await expect(replayPage).toHaveURL("/login");
    } finally {
      await replay.close();
    }
  });
});
