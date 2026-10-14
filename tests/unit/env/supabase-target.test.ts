/**
 * refuseSupabaseTarget, the guard that keeps local runs off the hosted
 * Supabase project unless SUPABASE_TARGET=hosted says otherwise. Both
 * createCollectorClient() and `next dev` (next.config.ts) throw what it
 * returns.
 *
 * The expected decisions come from the contract in Phase 3 of
 * context/changes/local-supabase-stack/plan.md: unset or `local` takes a
 * loopback URL only (127.0.0.1, localhost or [::1], any port), `hosted` takes
 * anything else; a missing or unparsable URL and any other target are
 * refused. Lookalike hosts are not loopback, and a host is matched whatever
 * its case. The documented choices of src/lib/env/supabase-target.ts are
 * pinned too: the target is matched case-sensitively, an empty one counts as
 * unset, and only http and https URLs parse.
 *
 * The credential-shaped values are placeholders, assembled at run time so
 * that no secret scanner reads this file as a leaked key.
 */
import { describe, expect, it } from "vitest";
import { refuseSupabaseTarget } from "@/lib/env/supabase-target";

const HOSTED = "https://abcdefghijklmnop.supabase.co";
const LOCAL = "http://127.0.0.1:54321";

const SB = "sb_";
const SECRET = `${SB}secret_PLACEHOLDER0000000000000000000`;
const JWT = [
  ["ey", "JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"].join(""),
  "eyJyb2xlIjoic2VydmljZV9yb2xlIn0",
  "PLACEHOLDER",
].join(".");

describe("refuseSupabaseTarget: allowed pairs", () => {
  it.each([
    { name: "unset, 127.0.0.1", url: LOCAL, target: undefined },
    {
      name: "unset, localhost",
      url: "http://localhost:54321",
      target: undefined,
    },
    { name: "unset, [::1]", url: "http://[::1]:54321", target: undefined },
    { name: "unset, no port", url: "http://localhost", target: undefined },
    {
      name: "unset, LOCALHOST is loopback whatever its case",
      url: "http://LOCALHOST:54321",
      target: undefined,
    },
    { name: "empty counts as unset", url: LOCAL, target: "" },
    { name: "local, 127.0.0.1", url: LOCAL, target: "local" },
    {
      name: "local, [::1] with another port",
      url: "http://[::1]:3000",
      target: "local",
    },
    { name: "hosted, the hosted project", url: HOSTED, target: "hosted" },
    {
      name: "hosted, 127.0.0.1.example.com is not loopback",
      url: "https://127.0.0.1.example.com",
      target: "hosted",
    },
    {
      name: "hosted, localhost.example is not loopback",
      url: "https://localhost.example",
      target: "hosted",
    },
  ])("$name", ({ url, target }) => {
    expect(refuseSupabaseTarget({ url, target })).toBeNull();
  });
});

describe("refuseSupabaseTarget: refused pairs", () => {
  it.each([
    { name: "unset, the hosted project", url: HOSTED, target: undefined },
    { name: "local, the hosted project", url: HOSTED, target: "local" },
    {
      name: "unset, 127.0.0.1.example.com is not loopback",
      url: "http://127.0.0.1.example.com:54321",
      target: undefined,
    },
    {
      name: "unset, localhost.example is not loopback",
      url: "http://localhost.example:54321",
      target: undefined,
    },
    {
      name: "unset, 0.0.0.0 is not one of the three loopback hosts",
      url: "http://0.0.0.0:54321",
      target: undefined,
    },
    {
      name: "unset, 127.0.0.2 is not one of the three loopback hosts",
      url: "http://127.0.0.2:54321",
      target: undefined,
    },
    { name: "hosted, 127.0.0.1", url: LOCAL, target: "hosted" },
    {
      name: "hosted, localhost",
      url: "http://localhost:54321",
      target: "hosted",
    },
    {
      name: "hosted, LOCALHOST",
      url: "http://LOCALHOST:54321",
      target: "hosted",
    },
    { name: "hosted, [::1]", url: "http://[::1]:54321", target: "hosted" },
    { name: "unset, missing URL", url: undefined, target: undefined },
    { name: "hosted, missing URL", url: undefined, target: "hosted" },
    { name: "unset, empty URL", url: "", target: undefined },
    { name: "hosted, garbage URL", url: "not a url", target: "hosted" },
    {
      name: "unset, a host without a scheme",
      url: "localhost:54321",
      target: undefined,
    },
    {
      name: "hosted, a host without a scheme",
      url: "abcdefghijklmnop.supabase.co",
      target: "hosted",
    },
    {
      name: "unset, a scheme other than http or https",
      url: "ftp://127.0.0.1:54321",
      target: undefined,
    },
    { name: "production, local URL", url: LOCAL, target: "production" },
    { name: "production, hosted URL", url: HOSTED, target: "production" },
    { name: "Hosted, case differs", url: HOSTED, target: "Hosted" },
    { name: "LOCAL, case differs", url: LOCAL, target: "LOCAL" },
    { name: "a padded value", url: HOSTED, target: " hosted" },
  ])("$name", ({ url, target }) => {
    const message = refuseSupabaseTarget({ url, target });
    expect(message).toEqual(expect.any(String));
    // Every refusal names the way out.
    expect(message).toContain("npm run dev:hosted");
    expect(message).toContain("npm run extract:report:hosted");
    expect(message).toContain(".env.example");
  });
});

describe("refuseSupabaseTarget: the message", () => {
  it("names the hosted host a local run was about to reach", () => {
    expect(refuseSupabaseTarget({ url: HOSTED, target: undefined })).toContain(
      "abcdefghijklmnop.supabase.co",
    );
  });

  it("names the local host, port included, a hosted run was about to reach", () => {
    expect(refuseSupabaseTarget({ url: LOCAL, target: "hosted" })).toContain(
      "127.0.0.1:54321",
    );
  });

  it.each([
    {
      name: "credentials and a key in the query of a hosted URL",
      url: `https://${SECRET}:${JWT}@abcdefghijklmnop.supabase.co/?apikey=${SECRET}`,
      target: undefined,
    },
    {
      name: "credentials in a local URL under hosted",
      url: `http://${SECRET}@127.0.0.1:54321/#${JWT}`,
      target: "hosted",
    },
    { name: "a secret key pasted as the URL", url: SECRET, target: undefined },
    { name: "a JWT pasted as the URL", url: JWT, target: "hosted" },
    { name: "a secret key pasted as the target", url: HOSTED, target: SECRET },
  ])("never repeats a key: $name", ({ url, target }) => {
    const message = refuseSupabaseTarget({ url, target });
    expect(message).toEqual(expect.any(String));
    expect(message).not.toContain(SB);
    expect(message).not.toContain("eyJ");
    expect(message).not.toContain("PLACEHOLDER");
  });
});
