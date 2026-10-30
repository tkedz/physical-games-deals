"use client";

import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useOptimistic,
  useRef,
  type ReactNode,
} from "react";
import { PendingSearchContext } from "@/components/search/catalog-search-form";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import {
  closesSearchOverlay,
  searchOverlayFocusAnswer,
  type FocusLanding,
  type OverlayExit,
} from "@/lib/search/overlay";

/**
 * Where an interaction that leaves the overlay landed, read from the DOM for
 * closesSearchOverlay: the search form, a link, or anything else.
 */
function exitTarget(
  target: EventTarget | null,
  search: HTMLElement | null,
): OverlayExit {
  if (!(target instanceof Element)) return "elsewhere";
  if (search?.contains(target)) return "search";
  return target.closest("a[href]") === null ? "elsewhere" : "link";
}

/**
 * Where focus went while the overlay is open, read from the DOM for
 * searchOverlayFocusAnswer. `block` holds the form, Base UI's focus guards
 * and the portal; `portal` holds the results and the guards around them.
 * The guard after the results counts as "past-results" only when focus came
 * from the results: Shift+Tab from the list back into the overlay lands on it
 * too, and Base UI then sends focus on to the last result.
 */
function focusLanding(
  event: FocusEvent,
  block: HTMLElement,
  portal: HTMLElement,
  search: HTMLElement | null,
): FocusLanding {
  const target = event.target;
  if (!(target instanceof Element)) return "elsewhere";
  if (!block.contains(target)) {
    return exitTarget(target, search) === "link" ? "link" : "elsewhere";
  }
  const results = portal.querySelector('[role="dialog"]');
  const from = event.relatedTarget;
  const pastResults =
    results !== null &&
    !results.contains(target) &&
    from instanceof Node &&
    results.contains(from) &&
    (results.compareDocumentPosition(target) &
      Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
  return pastResults ? "past-results" : "search-block";
}

// What a browser puts in the tab order: links, enabled form controls, and any
// element with a tabindex of 0 or more.
const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * The first element after `block` in the document that Tab would reach, or
 * null at the end of the page: where Tab past the results goes on to.
 */
function firstTabbableAfter(block: HTMLElement): HTMLElement | null {
  for (const element of block.ownerDocument.querySelectorAll<HTMLElement>(
    TABBABLE,
  )) {
    const follows =
      (block.compareDocumentPosition(element) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    if (
      follows &&
      !block.contains(element) &&
      element.tabIndex >= 0 &&
      element.closest("[inert]") === null &&
      element.checkVisibility()
    ) {
      return element;
    }
  }
  return null;
}

/**
 * The search on `/`: the form, and the results in an overlay hanging from it,
 * over the deals list rather than pushing it down.
 *
 * - The overlay is a Base UI Popover, controlled: open while a query is in the
 *   URL. It has no trigger; it hangs from the form's block, as wide as it, so
 *   on a phone it covers the list below the form and never the form's own
 *   platform select.
 * - Non-modal, and focus stays where it is when it opens (`initialFocus`
 *   false), so the user keeps typing while the results arrive.
 * - Its portal sits right after the form in the DOM, not at the end of
 *   <body>, so the results follow the form in reading order and Tab from the
 *   form's button reaches them. The block is `relative`, the positioner
 *   absolute inside it, so the overlay takes no room in the page.
 * - It closes on Esc, wherever focus is, on a press outside it and on its ×,
 *   as closesSearchOverlay decides, and when keyboard focus leaves the search
 *   for the rest of the page, as searchOverlayFocusAnswer decides, so nothing
 *   it covers can hold focus. Tab past the last result closes it and goes on
 *   to the deals list in one press: Base UI's guard after the results, which
 *   a popover without a trigger has nowhere to send on from, is passed over
 *   here. Shift+Tab back to the form keeps it open.
 * - Closing replaces the URL with the same page of the list, without `q` and
 *   `platform` (searchClosedHref), and keeps the scroll position. The overlay
 *   hides at once, while that navigation runs. A search the form is still
 *   waiting to send is dropped (PendingSearchContext), or it would reopen it.
 * - Its height is bounded by the room below the form and scrolls.
 *
 * The form arrives in `form` and renders in this component's block, outside
 * the Popover; the results arrive as `children`, server-rendered. The overlay
 * must never render inside the form's React subtree: React's submit events
 * bubble through portals, so a watch button's submit would reach next/form's
 * onSubmit and navigate (node_modules/next/dist/client/app-dir/form.js). Here
 * the two are siblings.
 *
 * `closeHref` null keeps every close request unanswered, so the kitchen sink
 * shows the overlay open with its buttons inert.
 */
export function SearchOverlay({
  form,
  open,
  closeHref,
  children,
}: {
  /** The search form, rendered in the block the overlay hangs from. */
  form: ReactNode;
  /** Whether a query is in the URL. */
  open: boolean;
  /** Where closing leads, from searchClosedHref; null, nowhere. */
  closeHref: string | null;
  /** The outcome of the search. */
  children: ReactNode;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  // Set while focus is sent on past the results, so the focus that move
  // gives is not answered a second time.
  const movingOn = useRef(false);
  // Hidden at once on a close, until the navigation that drops the search
  // from the URL completes; then `open` itself is false.
  const [shown, setShown] = useOptimistic(open);
  // The form's search still waiting for the pause, shared with it through
  // PendingSearchContext, so a close can drop it.
  const pendingSearch = useRef<number | undefined>(undefined);

  function close() {
    if (closeHref === null) return;
    window.clearTimeout(pendingSearch.current);
    pendingSearch.current = undefined;
    startTransition(() => {
      setShown(false);
      router.replace(closeHref, { scroll: false });
    });
  }

  function handleOpenChange(
    nextOpen: boolean,
    details: PopoverPrimitive.Root.ChangeEventDetails,
  ) {
    // Focus that moves out says where it went in relatedTarget; a press, in
    // its target.
    const landedOn =
      details.event instanceof FocusEvent
        ? details.event.relatedTarget
        : details.event.target;
    const closes =
      !nextOpen &&
      closeHref !== null &&
      closesSearchOverlay(
        details.reason,
        exitTarget(landedOn, searchRef.current),
      );

    if (closes) {
      // Not cancelled, so Base UI also stops the Esc that closes from
      // clearing the query, as a search field does on Esc.
      close();
    } else {
      // Unanswered: Base UI keeps the overlay as it is.
      details.cancel();
    }
  }

  // Keyboard focus that moves while the overlay is open. Focus a pointer gives
  // is answered as a press, by handleOpenChange: `:focus-visible` is the
  // browser's own reading of which of the two moved it.
  const handleFocusIn = useEffectEvent((event: FocusEvent) => {
    const block = blockRef.current;
    const portal = portalRef.current;
    if (movingOn.current || closeHref === null) return;
    if (block === null || portal === null) return;
    const byKeyboard =
      event.target instanceof Element && event.target.matches(":focus-visible");
    const answer = searchOverlayFocusAnswer(
      focusLanding(event, block, portal, searchRef.current),
      byKeyboard,
    );
    if (answer === "stay") return;
    close();
    if (answer === "close-and-move-on") {
      movingOn.current = true;
      try {
        firstTabbableAfter(block)?.focus();
      } finally {
        movingOn.current = false;
      }
    }
  });

  useEffect(() => {
    if (!shown) return;
    // In the capture phase, before Base UI's own guards answer the focus.
    const listener = (event: FocusEvent) => handleFocusIn(event);
    document.addEventListener("focusin", listener, true);
    return () => document.removeEventListener("focusin", listener, true);
  }, [shown]);

  return (
    <div ref={blockRef} className="relative">
      <div ref={searchRef}>
        <PendingSearchContext value={pendingSearch}>
          {form}
        </PendingSearchContext>
      </div>
      <Popover open={shown} onOpenChange={handleOpenChange}>
        <PopoverContent
          container={portalRef}
          anchor={searchRef}
          align="start"
          sideOffset={8}
          // Always below the form, never flipped above it over the heading or
          // beside it: the room below sets its height (--available-height),
          // and scrolling the page down gives it more.
          collisionAvoidance={{ side: "none", fallbackAxisSide: "none" }}
          initialFocus={false}
          aria-label="Wyniki wyszukiwania"
          className="max-h-[min(36rem,var(--available-height))] w-(--anchor-width) gap-0 p-0"
        >
          <div className="flex justify-end px-2 pt-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zamknij wyniki wyszukiwania"
              onClick={close}
            >
              <X />
            </Button>
          </div>
          <div className="min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
        </PopoverContent>
      </Popover>
      {/* Empty, and as high as nothing: the overlay is positioned absolutely
          and its focus guards are fixed. */}
      <div ref={portalRef} />
    </div>
  );
}
