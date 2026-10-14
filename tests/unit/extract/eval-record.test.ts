/**
 * The committed eval record, scripts/extract/eval/result.json, bound to the
 * code it was made on. A change to what is sent to the model (the
 * instructions, the reply schema, MODELS, the temperature, max tokens or
 * PROMPT_VERSION) or to the labelled set moves a fingerprint, and this test
 * fails until a passing `npm run extract:eval` writes a new record, committed
 * with the change.
 *
 * The record is a speed bump, not proof: a hand edit of result.json defeats
 * it. The paid eval never runs here; only the hashes are compared.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODELS } from "../../../scripts/extract/config.mts";
import {
  checkRecord,
  EVAL_COMMAND,
  labelsFingerprint,
  promptFingerprint,
} from "../../../scripts/extract/fingerprint.mts";

function evalFile(name: string): string {
  return readFileSync(
    new URL(`../../../scripts/extract/eval/${name}`, import.meta.url),
    "utf8",
  );
}

describe("scripts/extract/eval/result.json", () => {
  const recordText = evalFile("result.json");

  it("records a pass for the current prompt and labels", () => {
    const check = checkRecord(recordText, {
      prompt: promptFingerprint(),
      labels: labelsFingerprint(
        evalFile("labels.json"),
        evalFile("synthetic-posts.json"),
      ),
    });
    expect(check, check.ok ? "" : check.reason).toEqual({ ok: true });
  });

  it.each(MODELS.map((model) => ({ model })))(
    "holds an entry for the production model $model",
    ({ model }) => {
      const record = JSON.parse(recordText) as {
        record: Record<string, unknown>;
      };
      expect(
        Object.keys(record.record),
        `${model} has no entry in result.json. Run \`${EVAL_COMMAND}\` and commit the result.json it writes on a pass.`,
      ).toContain(model);
    },
  );
});
