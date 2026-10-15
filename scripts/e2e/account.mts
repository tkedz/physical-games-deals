/**
 * Creates or deletes the E2E test account in the local Supabase stack.
 *
 *   npm run e2e:account -- create
 *   npm run e2e:account -- delete
 *
 * The account is the one E2E_USERNAME names; `create` gives it E2E_PASSWORD
 * and a confirmed address. CI runs `create` for the per-run user that
 * tests/e2e/auth.setup.ts signs in as. Locally the same command restores the
 * E2E user after `npm run local:reset`, which deletes it, and `delete`
 * removes a probe account.
 *
 * npm loads .env.local with --env-file-if-exists, and a variable already set
 * in the command's environment wins over the file. The target guard of
 * createE2eAdminClient() runs first: a URL other than the local stack's, or
 * SUPABASE_TARGET=hosted, stops the command before a single request.
 *
 * It prints one line, naming neither the address nor the password, and exits
 * 0 on "created", "already exists", "deleted" and "nothing to delete". Any
 * other outcome exits 1 with a message that carries at most the Auth error
 * code.
 */
// The .mts extension is written out because Node strips the types without
// rewriting the specifier, so this has to be the real file name.
import {
  createE2eAdminClient,
  createTestAccount,
  deleteTestAccount,
  findTestAccountId,
  TestAccountError,
} from "./accounts.mts";
import type { E2eAdminClient } from "./accounts.mts";

/** The variable's value, or a TestAccountError naming the variable. */
function requiredVariable(name: "E2E_USERNAME" | "E2E_PASSWORD"): string {
  const value = process.env[name];
  if (!value) {
    throw new TestAccountError(
      `${name} is not set — put it in .env.local, or set it in the command's environment.`,
    );
  }
  return value;
}

async function create(
  client: E2eAdminClient,
  email: string,
  password: string,
): Promise<string> {
  try {
    await createTestAccount(client, { email, password });
  } catch (error) {
    if (error instanceof TestAccountError && error.code === "email_exists") {
      return "already exists: the E2E_USERNAME account was left as it is, its password included.";
    }
    throw error;
  }
  return "created: the E2E_USERNAME account is in the local stack, with E2E_PASSWORD and a confirmed address.";
}

async function remove(client: E2eAdminClient, email: string): Promise<string> {
  const id = await findTestAccountId(client, email);
  if (id === null) {
    return "nothing to delete: the local stack holds no E2E_USERNAME account.";
  }
  await deleteTestAccount(client, id);
  return "deleted: the E2E_USERNAME account is gone from the local stack, its watchlist with it.";
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== "create" && command !== "delete") {
    throw new TestAccountError(
      "name a subcommand: npm run e2e:account -- create | delete",
    );
  }
  // Ahead of the variables, so a mismatched environment is reported as the
  // mismatch whatever else it lacks. It makes no request.
  const client = createE2eAdminClient();
  const email = requiredVariable("E2E_USERNAME");
  console.log(
    command === "create"
      ? await create(client, email, requiredVariable("E2E_PASSWORD"))
      : await remove(client, email),
  );
}

main().catch((error: unknown) => {
  // Every error accounts.mts and this file throw is a TestAccountError, whose
  // message is written to be printed. Anything else is named by its class
  // alone, because its message may quote a request.
  const message =
    error instanceof TestAccountError
      ? error.message
      : `an unexpected ${error instanceof Error ? error.name : "failure"}; its message is left out, because it may quote a request.`;
  console.error(`e2e:account aborted: ${message}`);
  process.exitCode = 1;
});
