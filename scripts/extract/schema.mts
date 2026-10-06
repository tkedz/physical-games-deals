/**
 * The shape the model must return for one post, written once in zod. It
 * generates the JSON schema sent as `response_format`, and it validates every
 * reply, because strict mode is not guaranteed on every endpoint.
 *
 * Every field is required, and nullable where a value can be absent — never
 * `.optional()`, which leaves a field out of `required`, and strict modes
 * commonly want every property listed there. What each field means is written
 * in the instructions (prompt.mts), not here: not every endpoint shows the
 * schema to the model.
 */
import { z } from "zod";
// Whole-statement type imports on purpose: Node erases them entirely, while a
// value or inline `type` import would survive stripping.
import type { DealKind, Edition, Platform } from "../../src/lib/deals/types.ts";
import type { ResponseFormat } from "./openrouter.mts";

// Enum-like objects checked against the shared unions: `satisfies` rejects a
// word the vocabulary does not have, and flags a word it gained that is
// missing here.
const KINDS = { game: "game", not_game: "not_game" } as const satisfies {
  [K in DealKind]: K;
};

const EDITIONS = {
  physical: "physical",
  digital: "digital",
  unclear: "unclear",
} as const satisfies { [E in Edition]: E };

const PLATFORMS = {
  ps5: "ps5",
  ps4: "ps4",
  "xbox-series": "xbox-series",
  "xbox-one": "xbox-one",
  switch: "switch",
  "switch-2": "switch-2",
  pc: "pc",
  other: "other",
} as const satisfies { [P in Platform]: P };

export const kindSchema = z.enum(KINDS);
export const editionSchema = z.enum(EDITIONS);
export const platformSchema = z.enum(PLATFORMS);

export const priceSchema = z.object({
  amount: z.number(),
  currency: z.string(),
});

// The field order is the order a model decoding against the schema writes
// them in. The item is named first, and `editionEvidence` precedes `edition`,
// so the quote that settles the edition is written before the verdict on it.
// `setWith` precedes `price` for the same reason: what the price buys — this
// game alone, or a set — is settled before the price is written.
const itemSchema = z.object({
  title: z.string(),
  englishTitle: z.string(),
  alternativeTitles: z.array(z.string()),
  kind: kindSchema,
  editionEvidence: z.string().nullable(),
  edition: editionSchema,
  platform: platformSchema.nullable(),
  setWith: z.array(z.string()),
  price: priceSchema.nullable(),
  discountPercent: z.int().nullable(),
  expiresOn: z.string().nullable(),
  expiresAt: z.string().nullable(),
  shopName: z.string().nullable(),
  shopUrl: z.string().nullable(),
});

/** Zero or more items per post: a digest carries several, a news post none. */
export const extractionSchema = z.object({ items: z.array(itemSchema) });

export type ExtractionOutput = z.infer<typeof extractionSchema>;
export type ExtractedItem = ExtractionOutput["items"][number];

/**
 * The `response_format` for one extraction call. The schema goes out exactly
 * as zod generates it, its `$schema` key and integer bounds included: no
 * endpoint had been tested against either before the first live call, and
 * that call is what decides whether they stay (evaluation.md in
 * context/changes/physical-deals-from-real-posts/).
 */
export function toResponseFormat(): ResponseFormat {
  return {
    type: "json_schema",
    json_schema: {
      name: "post_deals",
      strict: true,
      schema: z.toJSONSchema(extractionSchema),
    },
  };
}
