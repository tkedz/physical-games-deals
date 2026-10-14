/**
 * The two fingerprints that bind an eval record to the code, and the check
 * that decides whether a record matches.
 *
 * - The prompt fingerprint hashes the request body production sends —
 *   requestBody() from openrouter.mts applied to buildMessages() of a fixed
 *   synthetic post — together with PROMPT_VERSION. It therefore covers the
 *   instructions, the aggregator descriptions, the post formatting, the reply
 *   schema, MODELS in its order, the temperature, max tokens and the provider
 *   pin. A comment edit does not move it.
 * - The labels fingerprint hashes labels.json and synthetic-posts.json as
 *   parsed JSON, so line endings and key spacing cannot tell a Windows
 *   checkout from CI's.
 *
 * Imports only node:crypto, zod and the extract modules, so the collect job,
 * installed with --omit=dev, can run it. No file system access: callers read
 * the files.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
// Whole-statement type imports: Node erases them entirely.
import type { ChatMessage, ResponseFormat } from "./openrouter.mts";
import type { PostGroup } from "./prompt.mts";
import { MAX_TOKENS, MODELS, TEMPERATURE } from "./config.mts";
import { requestBody } from "./openrouter.mts";
import { buildMessages, PROMPT_VERSION } from "./prompt.mts";
import { extractionSchema, toResponseFormat } from "./schema.mts";

/** The command that makes a new record; every refusal names it. */
export const EVAL_COMMAND = "npm run extract:eval";

const RECORD_FILE = "scripts/extract/eval/result.json";

/**
 * The post whose messages the prompt fingerprint hashes. Invented, never a
 * real post; its content only has to exercise the post formatting.
 */
export const SAMPLE_GROUP: PostGroup = {
  post: {
    id: "fingerprint-sample",
    source: "pepper-ps5",
    platform_hint: "ps5",
    title: "Gra Przykładowa (PS5, pudełko) za 149 zł",
    link: "https://www.pepper.pl/promocje/gra-przykladowa-ps5-0",
    published_at: "2026-10-21T10:00:00+00:00",
    categories: ["Gry"],
    content:
      '<p>Gra Przykładowa w wersji pudełkowej za 149 zł w <a href="https://sklep.example/gra-przykladowa">Sklep Example</a>.</p><ul><li>Wysyłka od 9,99 zł</li></ul>',
    first_seen_at: "2026-10-21T10:05:00+00:00",
  },
  feeds: [{ source: "pepper-ps5", platform_hint: "ps5" }],
};

/** Everything the prompt fingerprint covers, as production sets it. */
export type PromptInputs = {
  promptVersion: number;
  messages: ChatMessage[];
  models: readonly string[];
  responseFormat: ResponseFormat;
  maxTokens: number;
  temperature: number;
};

/** The current inputs: what extract.mts sends for SAMPLE_GROUP. */
export function promptInputs(): PromptInputs {
  return {
    promptVersion: PROMPT_VERSION,
    messages: buildMessages(SAMPLE_GROUP),
    models: MODELS,
    responseFormat: toResponseFormat(),
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  };
}

/** A value with every object's keys sorted, recursively; arrays keep their order. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** JSON with every object's keys sorted: one text for one value. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The prompt fingerprint of the given inputs. */
export function promptFingerprintOf(inputs: PromptInputs): string {
  const { promptVersion, ...request } = inputs;
  return sha256(
    canonicalJson({
      promptVersion,
      body: requestBody({ ...request, schema: extractionSchema }),
    }),
  );
}

/** The prompt fingerprint of the code as it stands. */
export function promptFingerprint(): string {
  return promptFingerprintOf(promptInputs());
}

/**
 * The labels fingerprint: both files parsed, so that only their content
 * counts. Throws when either is not JSON.
 */
export function labelsFingerprint(
  labelsText: string,
  syntheticText: string,
): string {
  return sha256(
    canonicalJson({
      labels: JSON.parse(labelsText) as unknown,
      synthetic: JSON.parse(syntheticText) as unknown,
    }),
  );
}

// The fields the check reads. Not strict, and the per-item record is left to
// parseBaseline in evaluation.mts, which the eval alone needs.
const recordHeaderSchema = z.object({
  promptFingerprint: z.string(),
  labelsFingerprint: z.string(),
  verdict: z.string(),
});

export type RecordCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a record lets the current code run: it exists, parses, records a
 * pass, and carries the current prompt fingerprint and, when `labels` is
 * given, the current labels fingerprint. A refusal names its cause and the
 * command that makes a new record.
 */
export function checkRecord(
  recordText: string | null,
  current: { prompt: string; labels?: string },
): RecordCheck {
  const fix = `Run \`${EVAL_COMMAND}\` and commit the ${RECORD_FILE} it writes on a pass.`;
  if (recordText === null) {
    return { ok: false, reason: `${RECORD_FILE} is missing. ${fix}` };
  }

  let data: unknown;
  try {
    data = JSON.parse(recordText);
  } catch {
    return { ok: false, reason: `${RECORD_FILE} is not valid JSON. ${fix}` };
  }
  const parsed = recordHeaderSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `${RECORD_FILE} lacks its fingerprints or verdict. ${fix}`,
    };
  }

  const record = parsed.data;
  if (record.verdict !== "pass") {
    return {
      ok: false,
      reason: `${RECORD_FILE} records the verdict "${record.verdict}", not a pass. ${fix}`,
    };
  }
  if (record.promptFingerprint !== current.prompt) {
    return {
      ok: false,
      reason:
        `The prompt fingerprint differs from ${RECORD_FILE}: what is sent to ` +
        "the model (the instructions, the reply schema, MODELS, the " +
        "temperature, max tokens or PROMPT_VERSION) changed without a passing " +
        `eval. ${fix}`,
    };
  }
  if (
    current.labels !== undefined &&
    record.labelsFingerprint !== current.labels
  ) {
    return {
      ok: false,
      reason:
        `The labels fingerprint differs from ${RECORD_FILE}: labels.json or ` +
        `synthetic-posts.json changed without a passing eval. ${fix}`,
    };
  }
  return { ok: true };
}
