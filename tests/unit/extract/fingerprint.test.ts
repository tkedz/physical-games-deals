/**
 * The two fingerprints that bind an eval record to the code, and the refusal
 * check that compares a record with them.
 *
 * The rows come from this change's plan.md (Phase 5, test specification, and
 * Key Discoveries): the prompt fingerprint covers everything the request body
 * carries — the messages, MODELS in its order, the reply format, max tokens,
 * the temperature — and PROMPT_VERSION; the labels fingerprint covers both
 * label files as parsed JSON, so line endings and key spacing do not count. A
 * fingerprint is only ever compared with another fingerprint here, never with
 * a hash literal computed by the code under test.
 *
 * No record file is read: checkRecord gets hand-written record texts.
 */
import { describe, expect, it } from "vitest";
import {
  checkRecord,
  labelsFingerprint,
  promptFingerprint,
  promptFingerprintOf,
  promptInputs,
  type PromptInputs,
} from "../../../scripts/extract/fingerprint.mts";

describe("promptFingerprint", () => {
  it("gives the same hash for the same inputs", () => {
    expect(promptFingerprint()).toBe(promptFingerprint());
    expect(promptFingerprintOf(promptInputs())).toBe(promptFingerprint());
  });

  it("is a sha256 hex digest", () => {
    expect(promptFingerprint()).toMatch(/^[0-9a-f]{64}$/);
  });

  // Each row changes one thing the request body or the record's version
  // carries; a fingerprint that misses a field would keep its hash.
  const CHANGES: {
    name: string;
    change: (inputs: PromptInputs) => PromptInputs;
  }[] = [
    {
      name: "one changed character of the instructions",
      change: (inputs) => ({
        ...inputs,
        messages: inputs.messages.map((message, index) =>
          index === 0
            ? { ...message, content: message.content.replace(/\.$/, "!") }
            : message,
        ),
      }),
    },
    {
      name: "one changed character of the post's message",
      change: (inputs) => ({
        ...inputs,
        messages: inputs.messages.map((message, index) =>
          index === 1
            ? { ...message, content: `${message.content} ` }
            : message,
        ),
      }),
    },
    {
      name: "a model added to MODELS",
      change: (inputs) => ({
        ...inputs,
        models: [...inputs.models, "openai/gpt-4.1-nano"],
      }),
    },
    {
      name: "another temperature",
      change: (inputs) => ({ ...inputs, temperature: 0.2 }),
    },
    {
      name: "another max tokens",
      change: (inputs) => ({ ...inputs, maxTokens: inputs.maxTokens + 1 }),
    },
    {
      name: "another reply format",
      change: (inputs) => ({
        ...inputs,
        responseFormat: {
          ...inputs.responseFormat,
          json_schema: { ...inputs.responseFormat.json_schema, name: "other" },
        },
      }),
    },
    {
      name: "another PROMPT_VERSION",
      change: (inputs) => ({
        ...inputs,
        promptVersion: inputs.promptVersion + 1,
      }),
    },
  ];

  it.each(CHANGES)("changes with $name", ({ change }) => {
    expect(promptFingerprintOf(change(promptInputs()))).not.toBe(
      promptFingerprint(),
    );
  });

  it("changes when two models swap places in MODELS", () => {
    const twoModels: PromptInputs = {
      ...promptInputs(),
      models: ["example/first", "example/second"],
    };
    const swapped: PromptInputs = {
      ...twoModels,
      models: ["example/second", "example/first"],
    };
    expect(promptFingerprintOf(swapped)).not.toBe(
      promptFingerprintOf(twoModels),
    );
  });
});

describe("labelsFingerprint", () => {
  const LABELS = `[
  {
    "postId": "a",
    "note": "n",
    "items": [{ "englishTitle": "Test Game", "expiresAt": null }]
  }
]
`;
  const SYNTHETIC = `[{ "post": { "id": "synthetic-01" }, "feeds": [] }]\n`;

  it("gives the same hash for the same files", () => {
    expect(labelsFingerprint(LABELS, SYNTHETIC)).toBe(
      labelsFingerprint(LABELS, SYNTHETIC),
    );
  });

  it("ignores line endings (a Windows checkout against CI's)", () => {
    expect(
      labelsFingerprint(
        LABELS.replace(/\n/g, "\r\n"),
        SYNTHETIC.replace(/\n/g, "\r\n"),
      ),
    ).toBe(labelsFingerprint(LABELS, SYNTHETIC));
  });

  it("ignores key spacing and key order", () => {
    const respaced =
      '[{"items":[{"expiresAt":null,"englishTitle":"Test Game"}],"note":"n","postId":"a"}]';
    expect(labelsFingerprint(respaced, SYNTHETIC)).toBe(
      labelsFingerprint(LABELS, SYNTHETIC),
    );
  });

  it("changes when a label changes", () => {
    expect(
      labelsFingerprint(LABELS.replace("Test Game", "Test Gam3"), SYNTHETIC),
    ).not.toBe(labelsFingerprint(LABELS, SYNTHETIC));
  });

  it("changes when a synthetic post changes", () => {
    expect(
      labelsFingerprint(
        LABELS,
        SYNTHETIC.replace("synthetic-01", "synthetic-02"),
      ),
    ).not.toBe(labelsFingerprint(LABELS, SYNTHETIC));
  });

  it("tells the two files apart", () => {
    expect(labelsFingerprint(SYNTHETIC, LABELS)).not.toBe(
      labelsFingerprint(LABELS, SYNTHETIC),
    );
  });
});

describe("checkRecord (hand-written record texts)", () => {
  const PROMPT = "a".repeat(64);
  const LABELS = "b".repeat(64);
  const record = (fields: Record<string, unknown> = {}) =>
    JSON.stringify({
      promptFingerprint: PROMPT,
      labelsFingerprint: LABELS,
      promptVersion: 3,
      models: ["mistralai/mistral-small-3.2-24b-instruct"],
      runs: 2,
      verdict: "pass",
      record: {},
      ...fields,
    });

  const REFUSALS: {
    name: string;
    text: string | null;
    current: { prompt: string; labels?: string };
    cause: RegExp;
  }[] = [
    {
      name: "a missing record",
      text: null,
      current: { prompt: PROMPT },
      cause: /result\.json is missing/,
    },
    {
      name: "an unparsable record",
      text: '{ "verdict": "pass", ',
      current: { prompt: PROMPT },
      cause: /result\.json is not valid JSON/,
    },
    {
      name: "a record without its fingerprints",
      text: JSON.stringify({ verdict: "pass" }),
      current: { prompt: PROMPT },
      cause: /lacks its fingerprints/,
    },
    {
      name: "a record whose verdict is not a pass",
      text: record({ verdict: "fail" }),
      current: { prompt: PROMPT },
      cause: /records the verdict "fail", not a pass/,
    },
    {
      name: "a prompt fingerprint mismatch",
      text: record(),
      current: { prompt: "c".repeat(64) },
      cause: /prompt fingerprint differs/,
    },
    {
      name: "a labels fingerprint mismatch",
      text: record(),
      current: { prompt: PROMPT, labels: "d".repeat(64) },
      cause: /labels fingerprint differs/,
    },
  ];

  it.each(REFUSALS)(
    "refuses $name, naming the cause and the command",
    ({ text, current, cause }) => {
      const check = checkRecord(text, current);
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.reason).toMatch(cause);
      expect(check.reason).toContain("npm run extract:eval");
    },
  );

  it("accepts a matching pass record", () => {
    expect(checkRecord(record(), { prompt: PROMPT, labels: LABELS })).toEqual({
      ok: true,
    });
  });

  it("accepts a matching pass record without a labels check (the extractor's case)", () => {
    expect(checkRecord(record(), { prompt: PROMPT })).toEqual({ ok: true });
  });
});
