import { expect, test as setup } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("sign in once and save the session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "Set E2E_USERNAME and E2E_PASSWORD in .env.local (see context/foundation/test-stack.md, ## E2E)",
    );
  }

  await page.goto("/login");
  // The sign-in form is a client component with no method: clicked before it
  // hydrates, the browser submits it natively, as a GET that carries both
  // fields in the URL. So prove it is interactive with nothing typed. Only the
  // hydrated form answers an empty submit with its own message, and an early
  // native submit of empty fields is harmless.
  await expect(async () => {
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await expect(page.getByText("Podaj hasło.")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();

  await page.getByLabel("E-mail").fill(username);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  // Signing in lands on /, where only a signed-in user's header offers a way
  // out. Wrong credentials keep the form on /login with an alert instead —
  // npm run local:reset deletes the test user.
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
