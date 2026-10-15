/**
 * Test accounts for the E2E runs: created and deleted in the local Supabase
 * stack through the Auth admin API, so every attempt starts with an empty
 * account and leaves nothing behind. Deleting an account removes its
 * watchlist rows with it (`on delete cascade` on
 * public.watchlist_entries.user_id).
 *
 * Its callers are the account CLI (account.mts, `npm run e2e:account`) and
 * the E2E specs under tests/e2e/. Nothing here has a top-level side effect, so
 * a spec imports it without starting anything, and
 * tests/unit/e2e/accounts.test.ts calls the pure parts with data and the I/O
 * parts with a stand-in client (context/foundation/lessons.md).
 *
 * The admin API needs SUPABASE_SECRET_KEY, which bypasses row-level security.
 * So the client factory lives here, outside src/, beside
 * createCollectorClient(), where a Server Component cannot reach it by
 * import. Unlike that factory it never accepts the hosted project:
 * refuseE2eTarget refuses SUPABASE_TARGET=hosted whatever the URL.
 *
 * Every error it throws is a TestAccountError, whose message is written to be
 * printed: a fixed text, a refusal naming only a host, or an Auth error code.
 * It never carries the password, the address, the key or a request URL.
 */
import { randomBytes, randomInt } from "node:crypto";
import {
  createClient,
  isAuthError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
// The .ts extension is written out because Node strips the types without
// rewriting the specifier, so this has to be the real file name. TypeScript
// accepts it through "allowImportingTsExtensions" in tsconfig.json.
import { refuseE2eTarget } from "../../src/lib/env/supabase-target.ts";

/**
 * The domain of every generated test address. Reserved for examples
 * (RFC 2606), so no mail can reach a real inbox, and the local stack sends
 * none for an account created with a confirmed address anyway.
 */
export const TEST_EMAIL_DOMAIN = "example.com";

/**
 * The account module's only error type. `code` is the Auth error code when
 * the Auth server returned one, and undefined otherwise.
 */
export class TestAccountError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "TestAccountError";
    this.code = code;
  }
}

/**
 * A fresh address for one test attempt: the label, then the time in
 * milliseconds and twelve random hex digits, so parallel attempts and
 * re-runs never collide. The label should be lower case, as the Auth server
 * stores addresses.
 */
export function uniqueTestEmail(label: string): string {
  return `${label}-${Date.now()}-${randomBytes(6).toString("hex")}@${TEST_EMAIL_DOMAIN}`;
}

/**
 * The character sets the sign-up rule requires one character from each of
 * (hasRequiredCharacters in src/lib/auth/credentials.ts). Copied rather than
 * imported, because Node loads this file directly and cannot resolve that
 * module's `@/` imports; tests/unit/e2e/accounts.test.ts proves the generated
 * passwords against the real rule. The symbols are a subset of the rule's,
 * the ones that need no quoting in an env file.
 */
const PASSWORD_SETS = [
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "0123456789",
  "!*-._~",
] as const;

/**
 * ASCII only, so the length in characters is the length in UTF-8 bytes, well
 * inside the rule's 8–72.
 */
const PASSWORD_LENGTH = 24;

/** One character of `set`, drawn uniformly by the CSPRNG. */
function pick(set: string): string {
  return set[randomInt(set.length)];
}

/**
 * A random password the app's sign-up rule accepts: one character from each
 * required set, the rest drawn from all of them, then shuffled, so the
 * guaranteed four do not always lead.
 */
export function testAccountPassword(): string {
  const all = PASSWORD_SETS.join("");
  const characters = [
    ...PASSWORD_SETS.map(pick),
    ...Array.from({ length: PASSWORD_LENGTH - PASSWORD_SETS.length }, () =>
      pick(all),
    ),
  ];
  // Fisher–Yates.
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join("");
}

/**
 * The secret-key client for the local stack, or a TestAccountError before
 * any request: first the target refusal (refuseE2eTarget), then a missing
 * SUPABASE_SECRET_KEY. The target comes first, so a mismatched environment is
 * reported as the mismatch whatever else it lacks. The environment is a
 * parameter so the tests can inject one.
 */
export function createE2eAdminClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const refusal = refuseE2eTarget({ url, target: env.SUPABASE_TARGET });
  if (refusal !== null) throw new TestAccountError(refusal);
  // refuseE2eTarget already refuses a missing URL; this only tells TypeScript.
  if (!url) throw new TestAccountError("NEXT_PUBLIC_SUPABASE_URL is not set.");
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new TestAccountError(
      "SUPABASE_SECRET_KEY is not set — put the local stack's secret key in .env.local, or set it in the command's environment.",
    );
  }

  return createClient(url, secretKey, {
    // There is no session to keep: the secret key is the whole credential, and
    // the process is gone once the run ends.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type E2eAdminClient = ReturnType<typeof createE2eAdminClient>;

/**
 * The error for a failed admin request, built from the Auth error alone: its
 * code, never its message, which is server text that may quote the request.
 */
function authFailure(action: string, error: unknown): TestAccountError {
  // Thrown for a network failure and for a 502, 503 or 504; carries no code.
  if (isAuthRetryableFetchError(error)) {
    return new TestAccountError(
      `${action} failed: the local Auth server did not answer. Is the stack running (npm run local:start)?`,
    );
  }
  const code = isAuthError(error) ? error.code : undefined;
  return code === undefined
    ? new TestAccountError(`${action} failed without an Auth error code.`)
    : new TestAccountError(
        `${action} failed with Auth error code ${code}.`,
        code,
      );
}

/**
 * Runs one admin request and returns its result, or throws a TestAccountError
 * for both ways the client fails: an error it returns, and one it throws
 * (anything that is not an Auth error, such as an invalid id).
 */
async function adminRequest<T extends { error: unknown }>(
  action: string,
  request: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await request();
  } catch (error) {
    throw authFailure(action, error);
  }
  if (result.error) throw authFailure(action, result.error);
  return result;
}

/**
 * Creates an account with a confirmed address, so it can sign in at once.
 * An address already taken fails with the code `email_exists`.
 */
export async function createTestAccount(
  client: E2eAdminClient,
  { email, password }: { email: string; password: string },
): Promise<{ id: string }> {
  const action = "Creating the test account";
  const { data } = await adminRequest(action, () =>
    client.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  if (data.user === null) throw authFailure(action, undefined);
  return { id: data.user.id };
}

/**
 * The id of the account with `email` among `users`, or null. Matched without
 * regard to case, as the Auth server matches addresses.
 */
function accountIdIn(
  users: readonly { id: string; email?: string }[],
  email: string,
): string | null {
  const wanted = email.toLowerCase();
  return users.find((user) => user.email?.toLowerCase() === wanted)?.id ?? null;
}

/** Accounts per page of the user list. */
const PAGE_SIZE = 1000;

/**
 * The id of the account with `email`, or null when there is none.
 *
 * The admin API cannot look an address up, so this walks the user list page
 * by page until the address turns up or a page comes back empty. It counts
 * the pages itself: the client's `nextPage` reads only the first digit of the
 * page number, and a page shorter than PAGE_SIZE would end the walk early
 * should the server cap the page size.
 */
export async function findTestAccountId(
  client: E2eAdminClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; ; page += 1) {
    const { data } = await adminRequest("Looking up the test account", () =>
      client.auth.admin.listUsers({ page, perPage: PAGE_SIZE }),
    );
    if (data.users.length === 0) return null;
    const id = accountIdIn(data.users, email);
    if (id !== null) return id;
  }
}

/** Deletes the account for good, its watchlist rows with it. */
export async function deleteTestAccount(
  client: E2eAdminClient,
  id: string,
): Promise<void> {
  await adminRequest("Deleting the test account", () =>
    client.auth.admin.deleteUser(id),
  );
}
