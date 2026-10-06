/**
 * What the model is told about one link: the instructions, and the post as
 * plain text. Pure — a group of rows in, chat messages out — so the evaluation
 * and the pipeline send exactly the same thing.
 *
 * The text is what the collector stored (pickContent in
 * scripts/collector/posts.mts), turned from HTML into plain text with every
 * link target kept inline, so that a shop URL the model returns can be checked
 * against the post's own links.
 */
// Whole-statement type imports: Node erases them entirely.
import type { CollectedPost } from "../collector/posts.mts";
import type { ChatMessage } from "./openrouter.mts";

/**
 * Stored with every extraction. Bump it on any change to the instructions or
 * to schema.mts, so that a reply can always be traced to what produced it.
 */
export const PROMPT_VERSION = 3;

/**
 * Every row sharing one link: the same aggregator post, seen in one feed or
 * several. `post` is the representative row whose text the model reads and
 * whose id the extraction records; `feeds` lists the feed id and platform hint
 * of every row sharing the link, `post` included.
 */
export type PostGroup = {
  post: CollectedPost & { link: string };
  feeds: { source: string; platform_hint: string }[];
};

const INSTRUCTIONS = `You read one post from a Polish video-game deals aggregator and list the offers in it as JSON.

Reply with the JSON object only: {"items": [...]}, one item per offer, in the order the post gives them. An offer is one product, for one platform, at one price, in one shop: the same game for two platforms, or in two shops, is two items, and a digest of several offers gives one item per offer, each judged on its own words. A price given only for comparison — the regular or earlier price, a price comparison site's figure, what used copies usually go for — is not an offer. A post that offers nothing to buy — news, a question, a contest — gives an empty list.

Separately titled games sold together for one price are a set, and a set gives one item per game, each with the set's price and the other games in setWith: "Splatoon Raiders + Star Fox za 354,78 zł" is two items, and so is "Zestaw Forza Horizon 6 + EA SPORTS FC 26 za 317 zł". A "buy two, save the VAT" promotion ("taniej o VAT") is a set too when the post gives one price for two games it names as an example. A collection sold under a title of its own — "Castlevania Anniversary Collection", "Tony Hawk's Pro Skater 1 + 2", "Bau Simulator 2+3" — is one product and one item, however many games it holds. Only games make a set: a console sold with a game is a console bundle, one item.

Fields of an item:

title: the product as the post names it, without its price, shop or platform.

englishTitle: the game's original title, as its publisher names it internationally — usually English. "Wiedźmin 3: Dziki Gon" is "The Witcher 3: Wild Hunt". Leave out edition words (Deluxe, GOTY, Edycja Kolekcjonerska), the platform and the price, but keep every word that tells the game apart from others in its series: "Elden Ring Nightreign" is not "Elden Ring". When you are not sure of the original title — a new or little-known game — copy the title as the post gives it. Never write the title of another game. For a product that is not a game, its name.

alternativeTitles: other names the post uses for the same product, such as a Polish title or an abbreviation, repeating neither title nor englishTitle. Empty when there are none.

kind: "game" for a copy of a video game in any edition — standard, deluxe, GOTY, a collector's edition that includes the game, a pre-order, a used copy, or a collection of several games sold under a title of its own. A collector's edition ("Edycja Kolekcjonerska", "kolekcjonerka") with the game inside is "game", however many figures, artbooks or steelbooks come with it. "not_game" for everything else: consoles and console bundles, controllers and other accessories, figures and other merchandise, soundtracks and books, subscriptions (Game Pass, PlayStation Plus, EA Play, Ubisoft+), gift cards and wallet top-ups, DLC, season passes and in-game currency.

editionEvidence: the words from the post, quoted exactly and briefly (at most about 15 words), that decide the edition. null when nothing in the post decides it.

edition: whether the offer is for a physical copy.
- "physical": a boxed copy on disc or cartridge. The post says so ("pudełko", "wersja pudełkowa", "pudełkowa", "płyta", "na płycie", "kartridż", "Typ: Pudełko"), or the item is a collector's edition with the game in the box, or the offer is shipped — a courier, a parcel locker, a pickup point, a shipping cost ("wysyłka", "paczkomat", "do punktu DHL", "dostawa od 9,99 zł") — which a code never is, or the shop is a retailer of boxed games (Media Expert, RTV Euro AGD, MediaMarkt, x-kom, Empik, Morele, Neonet and the like) and nothing in the post points to a key or a download.
- "digital": a key, a code for the game, or a download. The post says so ("klucz", "kod do gry", "kod aktywacyjny", "do pobrania", "wersja cyfrowa", "cyfrowa", "digital"), or the shop is a digital store (Steam, GOG, Epic Games Store, PlayStation Store, Microsoft Store, Xbox Store, Nintendo eShop, Battle.net, Ubisoft Store, EA app) or a key shop (Eneba, Kinguin, G2A, Instant Gaming, CDKeys, Gamivo, K4G, Fanatical, Humble, GameBillet and the like).
- "unclear": the post does not settle it. Choose "unclear" over a guess: a wrong "physical" costs more than a missed deal.

Traps:
- "pudełko" counts only when it is the game's box. A "pudełko do pizzy" in a pack of in-game items is not.
- "kod rabatowy", "z kodem" and "kupon" are discount codes: they say nothing about the edition. Only a code for the game itself means digital.
- Amazon and Allegro sell both boxes and codes, so there the shop decides nothing.
- A digital store or a key shop makes the offer digital, whatever its edition is called: a "Gold Edition", "Edycja Gry Roku" or "Edycja Kompletna" on Steam is still a download.
- A game available "w Game Pass" or "w PS Plus" is not an offer of a copy of it.
- A feed hint of "boxed" means the aggregator files the post under boxed-game offers, and "collectors" under collector's editions. Take it as support for "physical" unless the post's own words point elsewhere.

platform: the platform of this offer, as the post states it — in its title, body, categories or feeds: "ps5", "ps4", "xbox-series" (Xbox Series X or S), "xbox-one", "switch" (Nintendo Switch), "switch-2" (Nintendo Switch 2), "pc", or "other" for any other platform. A copy that also plays on a newer console (a PS4 disc with a free PS5 upgrade) takes the platform on its box. The feed hints "playstation" and "mixed" name no single platform. null when the post states none — never infer it from what you know about the game.

setWith: for a game in a set, the titles of the other games in it, as the post names them; its price is then the whole set's price, never a share of it. Empty for an item sold on its own, a collection included.

price: {"amount", "currency"}: the price the post states for this item now — not the earlier price — with the currency as an ISO 4217 code ("zł" is "PLN", "€" is "EUR"). When the post gives the price in złoty and in another currency, take the złoty one. With a discount code, the price after the code. null when the post states no price for this item.

discountPercent: a percentage cut from an earlier price, as the post states it ("-30%", "taniej o 30%", "Rabat: 30%"), as a whole number. null otherwise; never compute one from two prices. In cenograj's template only "Rabat" states a discount: when the post has "Przewaga cenowa" — the price advantage over the next-cheapest offer — the discount is null, even though the title repeats that percentage in brackets.

expiresOn: the last day of the offer, as YYYY-MM-DD, when the post states one. Resolve relative phrases ("tylko dziś", "do jutra", "do niedzieli", "do końca tygodnia") against the publication date and its weekday. A date without a year takes the year that puts it on or after the publication date. null when the post states no end.

expiresAt: the hour the offer ends on that day, as HH:MM ("do 23:59" is "23:59"), when the post states one. null otherwise.

shopName: the shop selling this item, as the post names it. null when it names none.

shopUrl: a link to this item's offer in the shop, copied character for character from the post, where links appear as [text](url). Never a link to the aggregator (pepper.pl, lowcygier.pl, cenograj.pl). null when the post has none.`;

/** What the model is told about each aggregator, keyed by the feed id's prefix. */
const AGGREGATORS: Record<string, string> = {
  pepper:
    "pepper.pl — deals posted by its community; the body usually opens with the price and the shop.",
  lowcygier:
    "lowcygier.pl — deal articles; the feed carries only the start of each article.",
  cenograj:
    "cenograj.pl — a price tracker for boxed games: one game per post, in a fixed template.",
};

/** The aggregator a feed belongs to: its id's prefix, "pepper" for "pepper-ps5". */
export function aggregatorOf(source: string): string {
  return source.split("-")[0];
}

// Named entities as HTML5 spells them, the Polish letters among them. A Map
// rather than an object literal, so that a name such as "constructor" cannot
// reach Object.prototype.
const NAMED_ENTITIES = new Map(
  Object.entries({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    shy: "",
    hellip: "…",
    ndash: "–",
    mdash: "—",
    bull: "•",
    middot: "·",
    lsquo: "‘",
    rsquo: "’",
    sbquo: "‚",
    ldquo: "“",
    rdquo: "”",
    bdquo: "„",
    laquo: "«",
    raquo: "»",
    euro: "€",
    pound: "£",
    copy: "©",
    reg: "®",
    trade: "™",
    deg: "°",
    times: "×",
    aogon: "ą",
    Aogon: "Ą",
    cacute: "ć",
    Cacute: "Ć",
    eogon: "ę",
    Eogon: "Ę",
    lstrok: "ł",
    Lstrok: "Ł",
    nacute: "ń",
    Nacute: "Ń",
    oacute: "ó",
    Oacute: "Ó",
    sacute: "ś",
    Sacute: "Ś",
    zacute: "ź",
    Zacute: "Ź",
    zdot: "ż",
    Zdot: "Ż",
  }),
);

const ENTITY =
  /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g;

/** Decodes character references once. An unknown name is left as written. */
function decodeEntities(text: string): string {
  return text.replace(
    ENTITY,
    (whole, decimal?: string, hex?: string, name?: string) => {
      if (name !== undefined) return NAMED_ENTITIES.get(name) ?? whole;
      const code =
        decimal !== undefined ? Number(decimal) : parseInt(hex ?? "", 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}

// The three ways an attribute value can be written: double-quoted,
// single-quoted, or bare.
const HREF = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const LINK =
  /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
const DROPPED = /<(script|style)\b[\s\S]*?<\/\1\s*>/gi;
// A list item opens its own line, so its closing tag adds none.
const LIST_ITEM = /<li\b[^>]*>/gi;
const LINE_BREAK =
  /<(?:br|\/p|\/div|\/ul|\/ol|\/h[1-6]|\/tr|\/table|\/blockquote)\b[^>]*>/gi;
const TAG = /<[^>]*>/g;

/** Collapses runs of spaces, trims every line, keeps at most one blank line. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The stored HTML as plain text. Each link becomes `[text](url)`, with the
 * target entity-decoded exactly as postHrefs decodes it, so a URL the model
 * copies from the text can be found among the post's own links. Line-level
 * tags become line breaks and list items dashes; every other tag is dropped.
 */
export function postText(content: string | null): string {
  if (content === null) return "";

  const text = content
    .replace(DROPPED, " ")
    .replace(
      LINK,
      (
        _whole: string,
        doubleQuoted: string | undefined,
        singleQuoted: string | undefined,
        bare: string | undefined,
        inner: string,
      ) => {
        const href = (doubleQuoted ?? singleQuoted ?? bare ?? "").trim();
        const label = inner.replace(TAG, " ").replace(/\s+/g, " ").trim();
        if (href === "") return ` ${label} `;
        return ` [${label === "" ? href : label}](${href}) `;
      },
    )
    .replace(LIST_ITEM, "\n- ")
    .replace(LINE_BREAK, "\n")
    .replace(TAG, " ");

  // Decoded last, and once: the link targets above are still encoded, so a
  // single pass decodes them exactly as it decodes the text around them.
  return tidy(decodeEntities(text));
}

/** The post's link targets, entity-decoded (`&amp;` becomes `&`), in order and without repeats. */
export function postHrefs(content: string | null): string[] {
  if (content === null) return [];
  const hrefs = new Set<string>();
  for (const match of content.matchAll(HREF)) {
    const href = decodeEntities(
      (match[1] ?? match[2] ?? match[3] ?? "").trim(),
    );
    if (href !== "") hrefs.add(href);
  }
  return [...hrefs];
}

const WARSAW_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  weekday: "long",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Monday 2026-09-28 14:05": the weekday lets the model resolve "do niedzieli". */
function warsawDateTime(instant: number): string {
  const part: Record<string, string> = {};
  for (const { type, value } of WARSAW_PARTS.formatToParts(instant)) {
    part[type] = value;
  }
  return `${part.weekday} ${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
}

/** The post's own publication time, falling back to when it was first collected. */
function describePublished(post: PostGroup["post"]): string {
  const published =
    post.published_at === null ? Number.NaN : Date.parse(post.published_at);
  if (Number.isFinite(published)) {
    return `${warsawDateTime(published)}, Warsaw time`;
  }
  const seen = Date.parse(post.first_seen_at);
  if (Number.isFinite(seen)) {
    return `${warsawDateTime(seen)}, Warsaw time — when the post was first collected; the feed gave no date`;
  }
  return "unknown";
}

function describePost(group: PostGroup): string {
  const { post } = group;
  const aggregator = aggregatorOf(post.source);
  const feeds = group.feeds
    .map((feed) => `${feed.source} (hint: ${feed.platform_hint})`)
    .join(", ");

  return [
    `Aggregator: ${AGGREGATORS[aggregator] ?? aggregator}`,
    `Feeds: ${feeds}`,
    `Published: ${describePublished(post)}`,
    `Categories: ${post.categories.length > 0 ? post.categories.join(", ") : "none"}`,
    `Title: ${post.title === null ? "none" : tidy(decodeEntities(post.title))}`,
    `Post link: ${post.link}`,
    "",
    "Body:",
    postText(post.content) || "(empty)",
  ].join("\n");
}

/** The two messages sent for one link: the instructions, then the post. */
export function buildMessages(group: PostGroup): ChatMessage[] {
  return [
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content: describePost(group) },
  ];
}
