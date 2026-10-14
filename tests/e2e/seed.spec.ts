// Seed: the pattern every generated E2E test copies.
// Risk #6 (context/foundation/test-plan.md), its browser round trip: an access
// change opens a private view to guests. A guest who opens /my-deals must land
// on the sign-in form, not on the view.
import { expect, test } from "@playwright/test";

// The risk is the signed-out path, so this file opts out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test("a guest who opens /my-deals is sent to sign in instead", async ({
  page,
}) => {
  await page.goto("/my-deals");

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeVisible();

  // No cleanup: the test creates no data and signs nobody out.
});
