/**
 * Where a deal's card links to. Pure, so a future test runner can call it
 * with data.
 */

export type DealLink = {
  /** `shop` is the shop's page for the offer; `post` is the aggregator post. */
  kind: "shop" | "post";
  href: string;
};

export type DealLinks = {
  /** The shop when the post carries its URL, otherwise the post itself. */
  primary: DealLink | null;
  /** The post, when the primary link is the shop, so the source stays one click away. */
  secondary: DealLink | null;
};

/**
 * The URL as the browser resolves it, when it uses http: or https:, otherwise
 * null. The extractor keeps only such shop URLs and the collector stores the
 * feeds' own links, but the check is repeated where a URL becomes an href,
 * because a `javascript:` URL there would run in the page.
 */
function webUrl(url: string | null): string | null {
  if (url === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? parsed.href
    : null;
}

/**
 * A deal's links. With a `shop_url` that passes the check, the shop is the
 * primary link and the post the secondary one; otherwise the post is the only
 * link. A URL that fails the check is left out, so a bad shop URL falls back
 * to the post, and a deal whose post URL fails too has no link at all.
 */
export function dealLinks(deal: {
  link: string;
  shop_url: string | null;
}): DealLinks {
  const shop = webUrl(deal.shop_url);
  const post = webUrl(deal.link);
  const postLink: DealLink | null =
    post === null ? null : { kind: "post", href: post };

  if (shop === null) return { primary: postLink, secondary: null };
  return { primary: { kind: "shop", href: shop }, secondary: postLink };
}
