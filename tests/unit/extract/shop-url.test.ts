/**
 * The stored shop link, `deals.shop_url`: one of the post's own off-site
 * http(s) links, copied exactly, or null, in which case the card links to the
 * post. Post content is untrusted input — anyone can write a pepper post — so
 * most rows are an attack, and each names its threat.
 *
 * The rows run end to end through toDealRows, from post HTML through
 * postHrefs and verifyShopUrl, with a one-item reply standing in for the
 * model's choice of link. A smaller table calls verifyShopUrl directly.
 *
 * The expected values come from what the product settled, never from running
 * verifyShopUrl: PRD Guardrails (the link leads to the deal's origin, never to
 * another offer) and Business Logic (the shop's link when the post carries
 * it, otherwise the aggregator post), the shop_url column comment in
 * create_deals.sql (one of the post's own link targets, http or https, off the
 * aggregator's site), and the decisions of 2026-10-13 in this change's
 * plan.md: no collected aggregator's site and no userinfo, while a lookalike
 * host is kept because code cannot tell it from a shop.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Feed } from "../../../scripts/collector/posts.mts";
import {
  AGGREGATOR_SITES,
  toDealRows,
  verifyShopUrl,
} from "../../../scripts/extract/deals.mts";
import type { PostGroup } from "../../../scripts/extract/prompt.mts";
import type { ExtractedItem } from "../../../scripts/extract/schema.mts";

const PEPPER_POST = "https://www.pepper.pl/promocje/gra-testowa-ps5-1";
const LOWCYGIER_POST = "https://lowcygier.pl/promocje-pudelkowe/gra-testowa/";

/** An invented post with the given HTML. */
function group(
  content: string | null,
  link = PEPPER_POST,
  source = "pepper-ps5",
): PostGroup {
  return {
    post: {
      id: "00000000-0000-4000-8000-000000000002",
      source,
      platform_hint: "ps5",
      title: "Gra testowa (PS5) za 199 zł",
      link,
      published_at: "2026-10-21T08:00:00.000Z",
      categories: [],
      content,
      first_seen_at: "2026-10-21T08:05:00.000Z",
    },
    feeds: [{ source, platform_hint: "ps5" }],
  };
}

/** A physical game for 199 PLN whose model-chosen link is `shopUrl`. */
function item(shopUrl: string | null, title = "Gra testowa"): ExtractedItem {
  return {
    title,
    englishTitle: title,
    alternativeTitles: [],
    kind: "game",
    editionEvidence: "w pudełku",
    edition: "physical",
    platform: "ps5",
    setWith: [],
    price: { amount: 199, currency: "PLN" },
    discountPercent: null,
    expiresOn: null,
    expiresAt: null,
    shopName: null,
    shopUrl,
  };
}

/** The shop_url stored for a one-item reply naming `shopUrl`. */
function storedShopUrl(shopUrl: string | null, post: PostGroup): string | null {
  const [row] = toDealRows({ items: [item(shopUrl)] }, post);
  return row.shop_url;
}

type Row = {
  /** The threat or the rule, citing where its answer was settled. */
  name: string;
  /** The post's stored HTML. */
  content: string | null;
  /** The link the model returned for the item. */
  shopUrl: string | null;
  /** The post's own link; a pepper post unless stated. */
  link?: string;
  source?: string;
  /** The stored shop_url. */
  stored: string | null;
};

const ROWS: Row[] = [
  // Membership: the post's own link target, character for character.
  {
    name: "Business Logic: a shop link the post carries is kept as written, its &amp; decoded once",
    content: `<p>Za 199 zł w <a href="https://sklep.example/gra?x=1&amp;y=2">Sklep</a>.</p>`,
    shopUrl: "https://sklep.example/gra?x=1&y=2",
    stored: "https://sklep.example/gra?x=1&y=2",
  },
  {
    name: "membership is exact: the model kept the entity, so it is not the post's link",
    content: `<p>Za 199 zł w <a href="https://sklep.example/gra?x=1&amp;y=2">Sklep</a>.</p>`,
    shopUrl: "https://sklep.example/gra?x=1&amp;y=2",
    stored: null,
  },
  {
    name: "membership is exact: the model changed the host's case",
    content: `<p>Za 199 zł w <a href="https://sklep.example/gra?x=1&amp;y=2">Sklep</a>.</p>`,
    shopUrl: "https://SKLEP.example/gra?x=1&y=2",
    stored: null,
  },
  {
    name: "Guardrails: a URL the post never contained is not stored",
    content: `<p>Za 199 zł w <a href="https://sklep.example/gra">Sklep</a>.</p>`,
    shopUrl: "https://sklep.example/inna-gra",
    stored: null,
  },
  {
    name: "Business Logic: plain-text content carries no link target, so the deal links to the post",
    content: "Gra testowa za 199 zł w https://sklep.example/gra",
    shopUrl: "https://sklep.example/gra",
    stored: null,
  },

  // Schemes: only http and https, however the post spells the others.
  {
    name: "XSS: a single-quoted javascript: href",
    content: `<a href='javascript:alert(1)'>Kup</a>`,
    shopUrl: "javascript:alert(1)",
    stored: null,
  },
  {
    name: "XSS: a bare javascript: href",
    content: `<a href=javascript:alert(1)>Kup</a>`,
    shopUrl: "javascript:alert(1)",
    stored: null,
  },
  {
    name: "XSS: javascript: in upper case, padded with a space",
    content: `<a href=" JAVASCRIPT:alert(2)">Kup</a>`,
    shopUrl: " JAVASCRIPT:alert(2)",
    stored: null,
  },
  {
    name: "XSS: javascript: hidden behind a decimal entity",
    content: `<a href="&#106;avascript:alert(3)">Kup</a>`,
    shopUrl: "javascript:alert(3)",
    stored: null,
  },
  {
    name: "XSS: javascript: hidden behind a hex entity",
    content: `<a href="&#x6A;avascript:alert(3)">Kup</a>`,
    shopUrl: "javascript:alert(3)",
    stored: null,
  },
  {
    name: "XSS: javascript: split by an encoded tab, which URL parsing strips",
    content: `<a href="java&#x09;script:alert(4)">Kup</a>`,
    shopUrl: "java\tscript:alert(4)",
    stored: null,
  },
  {
    name: "XSS: javascript: split by an encoded newline, which URL parsing strips",
    content: `<a href="java&#x0A;script:alert(5)">Kup</a>`,
    shopUrl: "java\nscript:alert(5)",
    stored: null,
  },
  {
    name: "XSS: a data: URL, which React does not block",
    content: `<a href="data:text/html,hi">Kup</a>`,
    shopUrl: "data:text/html,hi",
    stored: null,
  },
  {
    name: "XSS: a data: URL in upper case",
    content: `<a href="DATA:text/html,hi">Kup</a>`,
    shopUrl: "DATA:text/html,hi",
    stored: null,
  },
  {
    name: "XSS: a vbscript: URL",
    content: `<a href="vbscript:msgbox(1)">Kup</a>`,
    shopUrl: "vbscript:msgbox(1)",
    stored: null,
  },
  {
    name: "column comment: mailto: is not http or https",
    content: `<a href="mailto:sklep@sklep.example">Napisz</a>`,
    shopUrl: "mailto:sklep@sklep.example",
    stored: null,
  },
  {
    name: "column comment: ftp: is not http or https",
    content: `<a href="ftp://sklep.example/gra">Pobierz</a>`,
    shopUrl: "ftp://sklep.example/gra",
    stored: null,
  },
  {
    name: "column comment: a relative link names no shop",
    content: `<a href="/promo">Promocja</a>`,
    shopUrl: "/promo",
    stored: null,
  },
  {
    name: "column comment: a protocol-relative link names no scheme",
    content: `<a href="//sklep.example/x">Sklep</a>`,
    shopUrl: "//sklep.example/x",
    stored: null,
  },

  // Off the aggregators' sites.
  {
    name: "column comment: the post's own site is not a shop",
    content: `<a href="https://www.pepper.pl/x">Wątek</a>`,
    shopUrl: "https://www.pepper.pl/x",
    stored: null,
  },
  {
    name: "column comment: the post's own site without www. is not a shop",
    content: `<a href="https://pepper.pl/x">Wątek</a>`,
    shopUrl: "https://pepper.pl/x",
    stored: null,
  },
  {
    name: "column comment: a subdomain of the post's own site is not a shop",
    content: `<a href="https://m.pepper.pl/x">Wątek</a>`,
    shopUrl: "https://m.pepper.pl/x",
    stored: null,
  },
  {
    name: "decision 2026-10-13: another collected aggregator, lowcygier, is another offer",
    content: `<a href="https://lowcygier.pl/x">lowcygier</a>`,
    shopUrl: "https://lowcygier.pl/x",
    stored: null,
  },
  {
    name: "decision 2026-10-13: another collected aggregator, cenograj with www., is another offer",
    content: `<a href="https://www.cenograj.pl/x">cenograj</a>`,
    shopUrl: "https://www.cenograj.pl/x",
    stored: null,
  },
  {
    name: "decision 2026-10-13: cenograj in a lowcygier post is another offer",
    content: `<a href="https://cenograj.pl/x">cenograj</a>`,
    shopUrl: "https://cenograj.pl/x",
    link: LOWCYGIER_POST,
    source: "lowcygier-promocje-pudelkowe",
    stored: null,
  },

  // Userinfo.
  {
    name: "decision 2026-10-13: userinfo that reads as pepper.pl hides evil.example",
    content: `<a href="https://pepper.pl@evil.example/">pepper.pl</a>`,
    shopUrl: "https://pepper.pl@evil.example/",
    stored: null,
  },
  {
    name: "decision 2026-10-13: a URL carrying a username and password",
    content: `<a href="https://user:pass@sklep.example/">Sklep</a>`,
    shopUrl: "https://user:pass@sklep.example/",
    stored: null,
  },

  // What stays.
  {
    name: "decision 2026-10-13: a lookalike host is kept, as code cannot tell it from a shop",
    content: `<a href="https://pepper.pl.evil.example/x">Sklep</a>`,
    shopUrl: "https://pepper.pl.evil.example/x",
    stored: "https://pepper.pl.evil.example/x",
  },
  {
    name: "column comment: plain http is kept",
    content: `<a href="http://sklep.example/x">Sklep</a>`,
    shopUrl: "http://sklep.example/x",
    stored: "http://sklep.example/x",
  },

  // An unknown post host.
  {
    name: "verifyShopUrl docstring: a post link that does not parse leaves its site unknown, so nothing is kept",
    content: `<a href="https://sklep.example/gra">Sklep</a>`,
    shopUrl: "https://sklep.example/gra",
    link: "not a url",
    stored: null,
  },
];

describe("shop_url from post HTML, through toDealRows", () => {
  it.each(ROWS)("$name", ({ content, shopUrl, link, source, stored }) => {
    expect(storedShopUrl(shopUrl, group(content, link, source))).toBe(stored);
  });

  it("model-side limit: shop B's link given to shop A's item is kept; pairing is the eval's to score", () => {
    const post = group(
      `<ul>` +
        `<li>Gra A za 99 zł w <a href="https://sklep-a.example/gra-a">Sklep A</a></li>` +
        `<li>Gra B za 89 zł w <a href="https://sklep-b.example/gra-b">Sklep B</a></li>` +
        `</ul>`,
    );
    const [row] = toDealRows(
      { items: [item("https://sklep-b.example/gra-b", "Gra A")] },
      post,
    );
    expect(row.shop_url).toBe("https://sklep-b.example/gra-b");
  });
});

describe("verifyShopUrl, with literal link lists", () => {
  const HREFS = [
    "https://sklep.example/a",
    "https://forum.cenograj.pl/watek",
    "https://jan@sklep.example/a",
    "https://okazje.example/watek",
  ];

  it.each([
    {
      name: "a shop link the post carries is kept",
      url: "https://sklep.example/a",
      postHost: "www.pepper.pl",
      kept: "https://sklep.example/a",
    },
    {
      name: "no link chosen is no link",
      url: null,
      postHost: "www.pepper.pl",
      kept: null,
    },
    {
      name: "an unknown post host keeps nothing",
      url: "https://sklep.example/a",
      postHost: null,
      kept: null,
    },
    {
      name: "decision 2026-10-13: a subdomain of another aggregator is that aggregator",
      url: "https://forum.cenograj.pl/watek",
      postHost: "www.pepper.pl",
      kept: null,
    },
    {
      name: "decision 2026-10-13: a username alone is userinfo",
      url: "https://jan@sklep.example/a",
      postHost: "www.pepper.pl",
      kept: null,
    },
    {
      // Every own-site row above is also on AGGREGATOR_SITES; this one is not.
      name: "column comment: the post's own site is not a shop, even for an aggregator not on the list",
      url: "https://okazje.example/watek",
      postHost: "www.okazje.example",
      kept: null,
    },
  ])("$name", ({ url, postHost, kept }) => {
    expect(verifyShopUrl(url, HREFS, postHost)).toBe(kept);
  });
});

describe("feed drift: every collected aggregator is on the list", () => {
  const feeds = JSON.parse(
    readFileSync(
      new URL("../../../scripts/collector/feeds.json", import.meta.url),
      "utf8",
    ),
  ) as Feed[];
  const hosts = [
    ...new Set(
      feeds
        .filter((feed) => feed.enabled)
        .map((feed) => new URL(feed.url).hostname.toLowerCase()),
    ),
  ];

  it("reads at least one enabled feed", () => {
    expect(hosts.length).toBeGreaterThan(0);
  });

  // The same site: the host itself or a subdomain of it, www. included.
  it.each(hosts)("%s is the same site as an AGGREGATOR_SITES entry", (host) => {
    expect(
      AGGREGATOR_SITES.some(
        (site) => host === site || host.endsWith(`.${site}`),
      ),
    ).toBe(true);
  });
});
