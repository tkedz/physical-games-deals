/**
 * closesSearchOverlay and searchOverlayFocusAnswer (src/lib/search/overlay.ts):
 * which interactions close the search overlay on `/`. Closing drops `q` and
 * `platform` from the URL, so a close nobody meant loses the results, and an
 * overlay that will not close keeps covering the deals list, and with it
 * whatever keyboard focus moves to there.
 *
 * The expected values come from the plan
 * (context/changes/game-search-and-pages/plan.md, Phase 4: the overlay closes
 * on "Esc, a click outside, ×", and "paging with the overlay open keeps the
 * results"), from what makes a click outside: a click into the search's own
 * query is how the query is edited, not a dismissal, and from the
 * orchestrator's decision after the Phase 4 manual checks (2026-10-27): focus
 * that moves out of the overlay anywhere but the search form closes it, as
 * Esc does, so Tab past the last result leaves nothing covered, while
 * Shift+Tab back to the form keeps it open.
 */
import { describe, expect, it } from "vitest";
import {
  closesSearchOverlay,
  searchOverlayFocusAnswer,
  type FocusLanding,
  type OverlayExit,
} from "@/lib/search/overlay";

describe("closesSearchOverlay", () => {
  it.each<{ name: string; reason: string; landsOn: OverlayExit }>([
    {
      name: "plan: Esc, with focus in the query",
      reason: "escape-key",
      landsOn: "search",
    },
    {
      name: "plan: Esc, with focus in the results",
      reason: "escape-key",
      landsOn: "elsewhere",
    },
    {
      name: "plan: a click outside, on the deals list's empty space",
      reason: "outside-press",
      landsOn: "elsewhere",
    },
    {
      name: "focus moved out onto the deals list, as a press outside would be",
      reason: "focus-out",
      landsOn: "elsewhere",
    },
    {
      name: "focus moved out onto a deal's link",
      reason: "focus-out",
      landsOn: "link",
    },
  ])("closes: $name", ({ reason, landsOn }) => {
    expect(closesSearchOverlay(reason, landsOn)).toBe(true);
  });

  it.each<{ name: string; reason: string; landsOn: OverlayExit }>([
    {
      name: "a click into the query, to edit it",
      reason: "outside-press",
      landsOn: "search",
    },
    {
      name: "plan: a click on a pagination link, which keeps the search in its address",
      reason: "outside-press",
      landsOn: "link",
    },
    {
      name: "focus moved out back to the search form",
      reason: "focus-out",
      landsOn: "search",
    },
    {
      name: "a reason the overlay never asks for: it has no trigger",
      reason: "trigger-press",
      landsOn: "elsewhere",
    },
    {
      name: "an imperative close, which nothing here sends",
      reason: "imperative-action",
      landsOn: "elsewhere",
    },
  ])("stays open: $name", ({ reason, landsOn }) => {
    expect(closesSearchOverlay(reason, landsOn)).toBe(false);
  });
});

describe("searchOverlayFocusAnswer", () => {
  it.each<{
    name: string;
    landing: FocusLanding;
    byKeyboard: boolean;
    answer: ReturnType<typeof searchOverlayFocusAnswer>;
  }>([
    {
      name: "decision: Tab past the last result closes, and focus goes on to the list",
      landing: "past-results",
      byKeyboard: true,
      answer: "close-and-move-on",
    },
    {
      name: "decision: Tab onto a link outside the search, a deal's say, closes",
      landing: "link",
      byKeyboard: true,
      answer: "close",
    },
    {
      name: "decision: Tab onto anything else outside the search closes",
      landing: "elsewhere",
      byKeyboard: true,
      answer: "close",
    },
    {
      name: "decision: Shift+Tab from the first result back to the form stays open",
      landing: "search-block",
      byKeyboard: true,
      answer: "stay",
    },
    {
      name: "plan: a click on a pagination link focuses it, and the press, not the focus, decides",
      landing: "link",
      byKeyboard: false,
      answer: "stay",
    },
    {
      name: "a click elsewhere that gives focus is answered as a press too",
      landing: "elsewhere",
      byKeyboard: false,
      answer: "stay",
    },
    {
      name: "a click into the query stays open",
      landing: "search-block",
      byKeyboard: false,
      answer: "stay",
    },
  ])("$name", ({ landing, byKeyboard, answer }) => {
    expect(searchOverlayFocusAnswer(landing, byKeyboard)).toBe(answer);
  });
});
