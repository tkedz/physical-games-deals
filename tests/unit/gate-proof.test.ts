/**
 * Fails on purpose: the throwaway pull request of the testing-matching-rule-
 * protection plan, step 1.7, proving that a failing unit test stops `verify`
 * and that `deploy` never starts. Never merge it.
 */
import { expect, it } from "vitest";

it("fails on purpose, to prove the CI gate", () => {
  expect(1 + 1).toBe(3);
});
