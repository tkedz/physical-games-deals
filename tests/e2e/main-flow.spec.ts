// Risks #1, #4 and #6 (context/foundation/test-plan.md, §3 Phase 5), in their
// browser round trip: the PRD's primary flow. A guest is sent to sign in; a
// signed-in user starts with an empty watchlist, watches a deal's title as a
// phrase from the search on /, finds the phrase in the list on /my-deals and
// that deal among the matched ones with its price and links, edits the
// phrase there into one that matches nothing and back again, the matched
// deals following each edit, removes the phrase, and signs out, after which
// the server no longer honours the old session. /watchlist, the list's
// address before it moved into /my-deals, sends a guest to sign in and a
// signed-in user to /my-deals.
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
// recorded on the test to find any residue. The password is not, though the
// report still shows it in the fill step: a throwaway for the local stack.
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

/** The deal cards, on / or /my-deals, whose title is `title`. */
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

    // 2. Guest redirect: a guest who opens /watchlist, the list's old
    // address, lands on the sign-in form.
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

    // 4. Empty state: a new account watches nothing, as the list says.
    await page.goto("/my-deals");
    await expect(page.getByText("Twoja lista jest pusta")).toBeVisible();

    // 5. Watch the phrase, from the search on /, whose outcome opens in an
    // overlay over the deals list. The button is targeted by its full name,
    // so the step holds whatever the catalogue answers: the server under
    // test has no RAWG key (playwright.config.ts), and a reused one may have.
    // The add re-renders the page with the overlay still open, where the
    // offer then reads that the phrase is on the list: the write has landed
    // before the next step leaves the page.
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Tytuł gry" }).fill(title);
    await page.getByRole("button", { name: "Szukaj" }).click();
    const overlay = page.getByRole("dialog", { name: "Wyniki wyszukiwania" });
    await overlay
      .getByRole("button", { name: `Obserwuj frazę „${title}”`, exact: true })
      .click();
    await expect(
      overlay.getByRole("button", { name: "Ta fraza jest już na liście" }),
    ).toBeVisible();

    // 6. On /my-deals the list comes first and the matched deals under it:
    // the two sections' headings read in that order. The deal cards' titles
    // are level-2 headings too, so only the sections' two are kept. The
    // phrase is in the list, with its "Usuń", and the deal is among the
    // matched ones: a card with that title, the same price and the same
    // links as on /. Its presence, not a count: on snapshot data the phrase
    // may match more deals, and a deal with the same title may sit beyond
    // the first page of /, so one of the cards carrying the title has to
    // match.
    await page.goto("/my-deals");
    await expect(
      page
        .getByRole("main")
        .getByRole("heading", { level: 2 })
        .filter({ hasText: /^(Twoja lista|Okazje z Twojej listy)$/ }),
    ).toHaveText(["Twoja lista", "Okazje z Twojej listy"]);
    const entry = page.getByRole("listitem").filter({ hasText: `„${title}”` });
    await expect(entry.getByRole("button", { name: "Usuń" })).toBeVisible();
    const matchedCards = dealCard(page, title);
    await expect(matchedCards.first()).toBeVisible();
    await expect
      .poll(async () =>
        Promise.all(
          (await matchedCards.all()).map(async (card) => ({
            price: await card.getByText(PRICE).innerText(),
            links: await linkTargets(card),
          })),
        ),
      )
      .toContainEqual({ price, links });

    // 6a. Edit: "Edytuj" on the entry opens a form holding the phrase, for
    // any platform. It becomes a text unique to this run, which matches no
    // deal, pinned to PC. An edit replaces the entry, so the title's row goes
    // and a row with the new text and a "PC" badge comes; refresh() renders
    // the list and the matched deals in one response, so once the rows have
    // changed the matched deals are empty. "Edytuj" does nothing until the
    // page hydrates and is gone once the form is open, so it is pressed until
    // the form shows, and only while it is still there.
    const editPhrase = `e2e-edit-${Date.now()}`;
    const editButton = entry.getByRole("button", { name: "Edytuj" });
    const phraseField = entry.getByLabel("Fraza");
    await expect(async () => {
      if (await editButton.isVisible())
        await editButton.click({ timeout: 1_000 });
      await expect(phraseField).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(phraseField).toHaveValue(title);
    const platformField = entry.getByLabel("Platforma");
    // "Dowolna platforma" is the empty value.
    await expect(platformField).toHaveValue("");
    await phraseField.fill(editPhrase);
    await platformField.selectOption({ label: "PC" });
    await entry.getByRole("button", { name: "Zapisz" }).click();
    const editedEntry = page
      .getByRole("listitem")
      .filter({ hasText: `„${editPhrase}”` });
    await expect(editedEntry.getByText("PC", { exact: true })).toBeVisible();
    await expect(entry).toBeHidden();
    await expect(
      page.getByText("Brak okazji na gry z Twojej listy"),
    ).toBeVisible();

    // 6b. Edit back: the title again, for any platform. The title's row
    // returns with its pin, the edited one goes, and the deal is among the
    // matched ones again, with the same price and links as on /. A refused
    // save comes first: a two-character phrase answers with the length line,
    // and the form keeps both what was typed and the PC pin, so the save that
    // follows posts only what the user chose.
    const editedButton = editedEntry.getByRole("button", { name: "Edytuj" });
    const editedPhraseField = editedEntry.getByLabel("Fraza");
    await expect(async () => {
      if (await editedButton.isVisible()) {
        await editedButton.click({ timeout: 1_000 });
      }
      await expect(editedPhraseField).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await editedPhraseField.fill("ab");
    await editedEntry.getByRole("button", { name: "Zapisz" }).click();
    await expect(
      editedEntry.getByText("Fraza musi mieć od 3 do 100 znaków."),
    ).toBeVisible();
    await expect(editedPhraseField).toHaveValue("ab");
    await expect(editedEntry.getByLabel("Platforma")).toHaveValue("pc");
    await editedPhraseField.fill(title);
    await editedEntry
      .getByLabel("Platforma")
      .selectOption({ label: "Dowolna platforma" });
    await editedEntry.getByRole("button", { name: "Zapisz" }).click();
    await expect(
      entry.getByText("Dowolna platforma", { exact: true }),
    ).toBeVisible();
    await expect(editedEntry).toBeHidden();
    await expect(matchedCards.first()).toBeVisible();
    await expect
      .poll(async () =>
        Promise.all(
          (await matchedCards.all()).map(async (card) => ({
            price: await card.getByText(PRICE).innerText(),
            links: await linkTargets(card),
          })),
        ),
      )
      .toContainEqual({ price, links });

    // 7. Removal: "Usuń" on the entry in /my-deals's list, and /my-deals is
    // empty again on a fresh load. That load opens /watchlist, the list's old
    // address, which sends a signed-in user to /my-deals.
    await entry.getByRole("button", { name: "Usuń" }).click();
    await expect(entry).toBeHidden();
    await page.goto("/watchlist");
    await expect(page).toHaveURL("/my-deals");
    await expect(page.getByText("Twoja lista jest pusta")).toBeVisible();

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
