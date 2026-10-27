/**
 * pageHref and searchClosedHref (src/lib/deals/page.ts): the addresses of a
 * list's pages, and of `/` with the catalogue search beside the list.
 *
 * On `/` the list's page and the search share the URL, so each link has to
 * keep the other's state: paging with the search open keeps the results, a
 * search keeps the list's page, and closing the search drops only `q` and
 * `platform`. A link that drops the wrong one loses the visitor's place with
 * no error anywhere. The expected values come from the plan
 * (context/changes/game-search-and-pages/plan.md, Phase 4: "Page 1 omits
 * `page`, and a null query omits `q` and `platform`. Example:
 * `/?page=2&q=elden&platform=ps5`") and from the planning interview of
 * 2026-10-26 ("closing the overlay drops `q` and `platform`"). Expected
 * addresses are literals.
 */
import { describe, expect, it } from "vitest";
import { pageHref, searchClosedHref } from "@/lib/deals/page";
import type { SearchState } from "@/lib/watchlist/types";

const ELDEN_PS5: SearchState = { query: "elden", platform: "ps5" };
const ELDEN_ANY: SearchState = { query: "elden", platform: null };
const NO_QUERY: SearchState = { query: null, platform: null };

describe("pageHref", () => {
  it.each([
    {
      name: "plan: page 1 without a search is the bare path, its only address",
      page: 1,
      basePath: "/",
      search: undefined,
      href: "/",
    },
    {
      name: "plan: page 2 without a search",
      page: 2,
      basePath: "/",
      search: undefined,
      href: "/?page=2",
    },
    {
      name: "plan: page 2 keeps the search and its platform, the plan's example",
      page: 2,
      basePath: "/",
      search: ELDEN_PS5,
      href: "/?page=2&q=elden&platform=ps5",
    },
    {
      name: "plan: page 1 with a search omits page and keeps q and platform",
      page: 1,
      basePath: "/",
      search: ELDEN_PS5,
      href: "/?q=elden&platform=ps5",
    },
    {
      name: "a search on any platform carries no platform",
      page: 2,
      basePath: "/",
      search: ELDEN_ANY,
      href: "/?page=2&q=elden",
    },
    {
      name: "plan: a null query omits q, on page 1",
      page: 1,
      basePath: "/",
      search: NO_QUERY,
      href: "/",
    },
    {
      name: "plan: a null query omits q and platform, on page 2",
      page: 2,
      basePath: "/",
      search: NO_QUERY,
      href: "/?page=2",
    },
    {
      name: "plan: a null query omits a chosen platform too",
      page: 2,
      basePath: "/",
      search: { query: null, platform: "switch" },
      href: "/?page=2",
    },
    {
      name: "another list's page 1 is its bare path",
      page: 1,
      basePath: "/my-deals",
      search: undefined,
      href: "/my-deals",
    },
    {
      name: "another list's later page",
      page: 3,
      basePath: "/games/3498",
      search: undefined,
      href: "/games/3498?page=3",
    },
  ] as const)("$name", ({ page, basePath, search, href }) => {
    expect(pageHref(page, basePath, search)).toBe(href);
  });

  it("encodes the query as a submitted form does: a space as +, a Polish letter and a quote as escapes", () => {
    // The form sends `q` as application/x-www-form-urlencoded, so a link to
    // the same search reads the same in the address bar.
    expect(
      pageHref(2, "/", { query: "wiedźmin & „dziki gon”", platform: null }),
    ).toBe("/?page=2&q=wied%C5%BAmin+%26+%E2%80%9Edziki+gon%E2%80%9D");
  });

  it("keeps a query that looks like another parameter inside q", () => {
    // An injected `&page=9` must stay text, not a second page parameter.
    const href = pageHref(2, "/", { query: "elden&page=9", platform: null });
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.getAll("page")).toEqual(["2"]);
    expect(params.get("q")).toBe("elden&page=9");
  });
});

describe("searchClosedHref", () => {
  it.each([
    {
      name: "plan: closing on page 1 leads to the bare list",
      page: 1,
      href: "/",
    },
    {
      name: "plan: closing on page 2 keeps page 2",
      page: 2,
      href: "/?page=2",
    },
  ])("$name", ({ page, href }) => {
    expect(searchClosedHref(page)).toBe(href);
  });
});
