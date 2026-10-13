/**
 * dealLinks, the hrefs a deal card renders from the stored `shop_url` and
 * `link`. It is the render-time barrier: React blocks a `javascript:` href,
 * but lets `data:`, `vbscript:`, `blob:` and `file:` through, so this check is
 * the only thing between a bad stored value and a clickable link. The tests
 * call dealLinks with stored values and never render, so React's own
 * sanitiser is not what passes them.
 *
 * The expected links come from PRD Guardrails and Business Logic (the shop
 * when the post carries its link, otherwise the aggregator post; never
 * anything else) and from dealLinks' documented contract in
 * src/lib/deals/links.ts: http or https only, as the browser resolves it, and
 * a failed shop URL falls back to the post. Expected hrefs are literals.
 */
import { describe, expect, it } from "vitest";
import { dealLinks } from "@/lib/deals/links";

const POST = "https://www.pepper.pl/promocje/gra-testowa-ps5-1";

describe("dealLinks", () => {
  it("Business Logic: a valid shop link is primary, and the post stays one click away", () => {
    expect(
      dealLinks({ link: POST, shop_url: "https://sklep.example/a" }),
    ).toEqual({
      primary: { kind: "shop", href: "https://sklep.example/a" },
      secondary: { kind: "post", href: POST },
    });
  });

  it("Business Logic: no shop link leaves the post as the only link", () => {
    expect(dealLinks({ link: POST, shop_url: null })).toEqual({
      primary: { kind: "post", href: POST },
      secondary: null,
    });
  });

  it.each([
    { threat: "XSS: javascript:", shop_url: "javascript:alert(1)" },
    {
      threat: "XSS: javascript: in upper case, padded",
      shop_url: " JAVASCRIPT:alert(1)",
    },
    {
      threat: "XSS: data:, which React lets through",
      shop_url: "data:text/html,hi",
    },
    { threat: "XSS: vbscript:", shop_url: "vbscript:x" },
    { threat: "a blob: URL", shop_url: "blob:https://a.example/1" },
    { threat: "a local file", shop_url: "file:///C:/x" },
    { threat: "a relative link", shop_url: "/relative" },
  ])(
    "$threat as the stored shop link falls back to the post",
    ({ shop_url }) => {
      expect(dealLinks({ link: POST, shop_url })).toEqual({
        primary: { kind: "post", href: POST },
        secondary: null,
      });
    },
  );

  it("XSS: a javascript: post link with no shop link gives no link at all", () => {
    expect(dealLinks({ link: "javascript:alert(1)", shop_url: null })).toEqual({
      primary: null,
      secondary: null,
    });
  });

  it("XSS: a data: post link is dropped, and the valid shop link stays alone", () => {
    expect(
      dealLinks({
        link: "data:text/html,hi",
        shop_url: "https://sklep.example/a",
      }),
    ).toEqual({
      primary: { kind: "shop", href: "https://sklep.example/a" },
      secondary: null,
    });
  });

  it("links.ts: the href is the URL as the browser resolves it, a space encoded", () => {
    expect(
      dealLinks({ link: POST, shop_url: "https://sklep.example/a b" }).primary,
    ).toEqual({ kind: "shop", href: "https://sklep.example/a%20b" });
  });
});
