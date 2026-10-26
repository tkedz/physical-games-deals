/**
 * scripts/e2e/accounts.mts, the module that creates and deletes E2E test
 * accounts in the local Supabase stack. The expected behaviour comes from the
 * contract in Phase 1 of context/archive/2026-10-14-testing-main-flow-end-to-end/plan.md:
 * - a generated password passes the app's sign-up rule, signUpSchema of
 *   src/lib/auth/credentials.ts (hasRequiredCharacters and the 8–72 bounds),
 *   imported here rather than copied, so a change to the rule shows up as a
 *   failure;
 * - a generated address is unique, carries its label and ends in
 *   TEST_EMAIL_DOMAIN;
 * - createE2eAdminClient refuses the hosted project, a non-loopback URL and a
 *   missing secret key before any request, with the environment injected;
 * - a failed admin request throws the Auth error code and never the password
 *   or the address, and the account lookup pages through the whole user list,
 *   giving up after 100 pages;
 * - the CLI's create and delete report a taken address and a missing account
 *   as outcomes, not failures, in lines that name neither the address nor the
 *   password.
 *
 * The admin requests run against a stand-in client, so nothing here reaches a
 * network. The credential-shaped values are placeholders, assembled at run
 * time so that no secret scanner reads this file as a leaked key.
 */
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signUpSchema } from "@/lib/auth/credentials";
import { refuseE2eTarget } from "@/lib/env/supabase-target";
import {
  createAccountCommand,
  createE2eAdminClient,
  createTestAccount,
  deleteAccountCommand,
  deleteTestAccount,
  findTestAccountId,
  TEST_EMAIL_DOMAIN,
  TestAccountError,
  testAccountPassword,
  uniqueTestEmail,
} from "../../../scripts/e2e/accounts.mts";
import type { E2eAdminClient } from "../../../scripts/e2e/accounts.mts";

const HOSTED = "https://abcdefghijklmnop.supabase.co";
const LOCAL = "http://127.0.0.1:54321";
const SECRET_KEY = ["sb_", "secret_PLACEHOLDER0000000000000000000"].join("");

const SAMPLES = 200;

describe("testAccountPassword", () => {
  const passwords = Array.from({ length: SAMPLES }, testAccountPassword);

  it("meets the sign-up rule every time", () => {
    for (const password of passwords) {
      const signUp = signUpSchema.safeParse({
        email: `someone@${TEST_EMAIL_DOMAIN}`,
        password,
        passwordRepeat: password,
      });
      // The issues, not a bare false, so a failure says which rule broke.
      expect(signUp.error?.issues).toBeUndefined();
    }
  });

  it("never repeats itself", () => {
    expect(new Set(passwords).size).toBe(SAMPLES);
  });
});

describe("uniqueTestEmail", () => {
  const emails = Array.from({ length: SAMPLES }, () =>
    uniqueTestEmail("main-flow"),
  );

  it("is unique even within one millisecond", () => {
    expect(new Set(emails).size).toBe(SAMPLES);
  });

  it("carries the label and ends in the test domain", () => {
    expect(TEST_EMAIL_DOMAIN).toBe("example.com");
    for (const email of emails) {
      expect(email.startsWith("main-flow-")).toBe(true);
      expect(email.endsWith("@example.com")).toBe(true);
    }
  });
});

describe("createE2eAdminClient", () => {
  // Any request the client made would go through this.
  const fetchSpy = vi.fn();
  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    {
      name: "hosted, the hosted project",
      env: {
        NEXT_PUBLIC_SUPABASE_URL: HOSTED,
        SUPABASE_TARGET: "hosted",
        SUPABASE_SECRET_KEY: SECRET_KEY,
      },
    },
    {
      name: "hosted, the local stack",
      env: {
        NEXT_PUBLIC_SUPABASE_URL: LOCAL,
        SUPABASE_TARGET: "hosted",
        SUPABASE_SECRET_KEY: SECRET_KEY,
      },
    },
    {
      name: "unset, the hosted project",
      env: {
        NEXT_PUBLIC_SUPABASE_URL: HOSTED,
        SUPABASE_SECRET_KEY: SECRET_KEY,
      },
    },
    {
      name: "local, the hosted project",
      env: {
        NEXT_PUBLIC_SUPABASE_URL: HOSTED,
        SUPABASE_TARGET: "local",
        SUPABASE_SECRET_KEY: SECRET_KEY,
      },
    },
    {
      name: "unset, no URL at all",
      env: { SUPABASE_SECRET_KEY: SECRET_KEY },
    },
    {
      name: "hosted, the hosted project and no key: the target comes first",
      env: { NEXT_PUBLIC_SUPABASE_URL: HOSTED, SUPABASE_TARGET: "hosted" },
    },
  ])("refuses $name, before any request", ({ env }) => {
    const refusal = refuseE2eTarget({
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      target: env.SUPABASE_TARGET,
    });
    expect(refusal).toEqual(expect.any(String));
    expect(() => createE2eAdminClient(env)).toThrow(
      new TestAccountError(refusal ?? ""),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    { name: "a missing", key: undefined },
    { name: "an empty", key: "" },
  ])("refuses $name secret key, before any request", ({ key }) => {
    expect(() =>
      createE2eAdminClient({
        NEXT_PUBLIC_SUPABASE_URL: LOCAL,
        SUPABASE_SECRET_KEY: key,
      }),
    ).toThrow(/^SUPABASE_SECRET_KEY is not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("builds a client for the local stack without a request", async () => {
    const client = createE2eAdminClient({
      NEXT_PUBLIC_SUPABASE_URL: LOCAL,
      SUPABASE_TARGET: "local",
      SUPABASE_SECRET_KEY: SECRET_KEY,
    });
    expect(client.auth.admin).toBeDefined();
    // getSession waits for the client's start-up, so a request sent during it
    // has reached the spy by now; with no session stored it sends none itself.
    await client.auth.getSession();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/** A client whose admin API is the given stand-ins and nothing else. */
function standInClient(admin: Record<string, unknown>): E2eAdminClient {
  return { auth: { admin } } as unknown as E2eAdminClient;
}

describe("the admin requests", () => {
  const email = uniqueTestEmail("unit");
  const password = testAccountPassword();

  /** Whether a message shows the attempt's address or password. */
  function leaks(message: string): boolean {
    return message.includes(email) || message.includes(password);
  }

  it("create a confirmed account and return its id", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1", email } },
      error: null,
    });
    await expect(
      createTestAccount(standInClient({ createUser }), { email, password }),
    ).resolves.toEqual({ id: "user-1" });
    expect(createUser).toHaveBeenCalledWith({
      email,
      password,
      email_confirm: true,
    });
  });

  it("throw the Auth error code of a returned error, and never the password or the address", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new AuthApiError(
        `A user with ${email} and ${password} exists`,
        422,
        "email_exists",
      ),
    });
    const failure = await createTestAccount(standInClient({ createUser }), {
      email,
      password,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TestAccountError);
    expect((failure as TestAccountError).code).toBe("email_exists");
    expect((failure as TestAccountError).message).toBe(
      "Creating the test account failed with Auth error code email_exists.",
    );
    expect(leaks((failure as TestAccountError).message)).toBe(false);
  });

  it("say the stack did not answer when the request never reached it", async () => {
    const deleteUser = vi
      .fn()
      .mockRejectedValue(
        new AuthRetryableFetchError(`fetch failed for ${email}`, 0),
      );
    const failure = await deleteTestAccount(
      standInClient({ deleteUser }),
      "user-1",
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TestAccountError);
    expect((failure as TestAccountError).code).toBeUndefined();
    expect((failure as TestAccountError).message).toContain(
      "npm run local:start",
    );
    expect(leaks((failure as TestAccountError).message)).toBe(false);
  });

  it("leave out the message of an error that is not an Auth error", async () => {
    const deleteUser = vi
      .fn()
      .mockRejectedValue(new Error(`bad id for ${email} ${password}`));
    const failure = await deleteTestAccount(
      standInClient({ deleteUser }),
      "user-1",
    ).catch((error: unknown) => error);
    expect(failure).toEqual(
      new TestAccountError(
        "Deleting the test account failed without an Auth error code.",
      ),
    );
  });

  it("find an account past the first page, whatever the case of its address", async () => {
    const pages = [
      [{ id: "other-1", email: "someone@example.com" }],
      [{ id: "user-2", email: email.toUpperCase() }],
    ];
    const listUsers = vi.fn(async ({ page }: { page: number }) => ({
      data: { users: pages[page - 1] ?? [] },
      error: null,
    }));
    await expect(
      findTestAccountId(standInClient({ listUsers }), email),
    ).resolves.toBe("user-2");
    expect(listUsers.mock.calls.map(([params]) => params.page)).toEqual([1, 2]);
  });

  it("walk to an empty page before reporting no account", async () => {
    const pages = [
      [{ id: "other-1", email: "someone@example.com" }],
      [{ id: "other-2" }],
    ];
    const listUsers = vi.fn(async ({ page }: { page: number }) => ({
      data: { users: pages[page - 1] ?? [] },
      error: null,
    }));
    await expect(
      findTestAccountId(standInClient({ listUsers }), email),
    ).resolves.toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(3);
  });

  it("give up on a user list that never ends", async () => {
    const listUsers = vi.fn(async () => ({
      data: { users: [{ id: "other-1", email: "someone@example.com" }] },
      error: null,
    }));
    await expect(
      findTestAccountId(standInClient({ listUsers }), email),
    ).rejects.toEqual(
      new TestAccountError(
        "Looking up the test account failed: the user list did not end within 100 pages.",
      ),
    );
    expect(listUsers).toHaveBeenCalledTimes(100);
  });
});

describe("the e2e:account subcommands", () => {
  const email = uniqueTestEmail("unit");
  const password = testAccountPassword();
  const taken = new AuthApiError(
    "A user with this email address has already been registered",
    422,
    "email_exists",
  );

  it.each([
    { name: "a new account", error: null, line: /^created: / },
    { name: "a taken address", error: taken, line: /^already exists: / },
  ])(
    "create reports $name as an outcome, not a failure",
    async ({ error, line }) => {
      const createUser = vi.fn().mockResolvedValue({
        data: { user: error === null ? { id: "user-1", email } : null },
        error,
      });
      const printed = await createAccountCommand(
        standInClient({ createUser }),
        { email, password },
      );
      expect(printed).toMatch(line);
      expect(printed).not.toContain(email);
      expect(printed).not.toContain(password);
    },
  );

  it("create fails on any other Auth error", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Password is too weak", 422, "weak_password"),
    });
    await expect(
      createAccountCommand(standInClient({ createUser }), { email, password }),
    ).rejects.toMatchObject({ code: "weak_password" });
  });

  it.each([
    {
      name: "the account it finds",
      users: [{ id: "user-2", email }],
      line: /^deleted: /,
      deleted: ["user-2"],
    },
    {
      name: "no account",
      users: [],
      line: /^nothing to delete: /,
      deleted: [],
    },
  ])(
    "delete reports $name as an outcome, not a failure",
    async ({ users, line, deleted }) => {
      const listUsers = vi.fn(async ({ page }: { page: number }) => ({
        data: { users: page === 1 ? users : [] },
        error: null,
      }));
      const deleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
      const printed = await deleteAccountCommand(
        standInClient({ listUsers, deleteUser }),
        email,
      );
      expect(printed).toMatch(line);
      expect(printed).not.toContain(email);
      expect(deleteUser.mock.calls.map(([id]) => id)).toEqual(deleted);
    },
  );
});
