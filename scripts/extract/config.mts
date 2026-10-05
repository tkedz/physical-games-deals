/**
 * The values a model or pace change touches, in one checked-in place, so that
 * such a change goes through the evaluation and the review like any other
 * commit.
 */

/** The models `npm run extract:eval` measures, each called on its own. */
export const CANDIDATES: readonly string[] = [
  "mistralai/mistral-small-3.2-24b-instruct",
  "openai/gpt-4.1-nano",
];

/**
 * The production list, primary first, sent as one OpenRouter `models` list: a
 * model further down answers only when those above it fail. Every model here
 * must have passed the labelled set, because a fallback writes deals too — so
 * it holds one model: gpt-4.1-nano leaked digital editions in both runs that
 * evaluation.md in context/changes/physical-deals-from-real-posts/ records.
 */
export const MODELS: readonly string[] = [
  "mistralai/mistral-small-3.2-24b-instruct",
];

/** A post whose reply fails this many counted times is given up. */
export const MAX_ATTEMPTS = 3;

/** Extraction wants the likeliest reading of a post, not a varied one. */
export const TEMPERATURE = 0;

/** Room for a digest of a dozen offers; a reply that runs away stops here. */
export const MAX_TOKENS = 4_096;

/**
 * One request, reply included. A transient failure gets one retry. Long enough
 * for a reply that runs to MAX_TOKENS at about 25 tokens a second, because a
 * timeout stops the whole run as an outage: on 2026-10-05 two digests of
 * dozens of Steam offers took longer than the 60 seconds this used to be, and
 * stopped every run that reached them. A reply that long now ends by itself,
 * in a success or in `truncated`, which counts against its post.
 */
export const REQUEST_TIMEOUT_MS = 180_000;

/**
 * A run stops starting links after this long and lets the calls in flight
 * finish. Added to a worst-case collection of about 5 minutes, it has to fit
 * the collect job's timeout-minutes in .github/workflows/collect.yml.
 */
export const RUN_BUDGET_MS = 8 * 60_000;

/** At most this many links per run, however much budget is left. */
export const RUN_LINK_CAP = 400;

/** Links extracted at once. */
export const CONCURRENCY = 4;
