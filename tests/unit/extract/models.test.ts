/**
 * MODELS ⊆ CANDIDATES: every production model is one the eval measures.
 *
 * The rule is config.mts's own comment on MODELS ("Every model here must have
 * passed the labelled set, because a fallback writes deals too") and this
 * change's plan.md (Phase 5; research.md, "Making the eval a required gate",
 * option D). A model outside CANDIDATES is never run by `npm run
 * extract:eval`, so it could never have passed.
 */
import { describe, expect, it } from "vitest";
import { CANDIDATES, MODELS } from "../../../scripts/extract/config.mts";

describe("MODELS (scripts/extract/config.mts)", () => {
  it("is not empty", () => {
    expect(MODELS.length).toBeGreaterThan(0);
  });

  it.each(MODELS.map((model) => ({ model })))(
    "$model is in CANDIDATES, so the eval measures it",
    ({ model }) => {
      expect(CANDIDATES).toContain(model);
    },
  );
});
