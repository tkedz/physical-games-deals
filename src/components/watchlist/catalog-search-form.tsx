"use client";

import Form from "next/form";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  characterCount,
  MAX_QUERY_LENGTH,
  PINNABLE_PLATFORMS,
  pinLabel,
} from "@/lib/watchlist/vocabulary";
import type { PinnablePlatform } from "@/lib/watchlist/types";

// While the user types, the search runs once they pause this long…
const PAUSE_MS = 300;
// …and only once the trimmed query has this many characters. Enter and
// "Szukaj" search any query.
const LIVE_SEARCH_MIN_LENGTH = 3;

/**
 * The catalogue search: a title and a platform, held in the URL as
 * `?q=…&platform=…`.
 *
 * A `next/form` GET form on its own route
 * (node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md).
 * Without JavaScript, "Szukaj" submits it as a plain form. With it, each
 * submission is a client-side navigation that replaces the history entry and
 * keeps the scroll position, so Back leaves the page instead of stepping
 * through queries. Navigations are interruptible
 * (node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md),
 * so a newer search supersedes an older one with no race handling here.
 *
 * With JavaScript the form also submits itself, through requestSubmit
 * (node_modules/next/dist/docs/01-app/02-guides/forms.md):
 * - PAUSE_MS after the last change, once the trimmed query has three
 *   characters;
 * - at once when the query is cleared, so the results go away;
 * - at once when the platform changes.
 *
 * Both fields are uncontrolled and take their defaults from the URL once, when
 * the form mounts, so a results navigation never resets or re-focuses what the
 * user is typing.
 * `maxLength` counts UTF-16 units, so the field holds at most the 100
 * characters parseSearchState keeps, and nothing typed here is cut.
 *
 * On `/` the form sits above the paged list of deals and shares its URL: a
 * `page` past the first goes with every search as a hidden field, so a search
 * from page 2 of the list stays on page 2. The field follows the prop, which
 * the URL drives, so paging with the search open moves it along.
 */
export function CatalogSearchForm({
  defaultQuery,
  defaultPlatform,
  page = 1,
}: {
  defaultQuery: string | null;
  defaultPlatform: PinnablePlatform | null;
  /** The page of the list beside the form; 1, the default, sends none. */
  page?: number;
}) {
  const queryId = useId();
  const platformId = useId();
  const pendingSearch = useRef<number | undefined>(undefined);
  // The query the form mounted with, kept for its lifetime. Each search
  // changes `defaultQuery` through the URL, but Base UI's input keeps its
  // first default anyway, and in development it reports a changed one as an
  // error (useControlled in @base-ui/utils).
  const [initialQuery] = useState(defaultQuery ?? "");

  // A search still waiting when the form goes away is dropped, so it cannot
  // navigate back here after the user has left.
  useEffect(() => () => window.clearTimeout(pendingSearch.current), []);

  // Runs first on every submission, Enter and "Szukaj" included: a search
  // still waiting for the pause is superseded by this one.
  function cancelPendingSearch() {
    window.clearTimeout(pendingSearch.current);
    pendingSearch.current = undefined;
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    cancelPendingSearch();
    const { form, value } = event.currentTarget;
    if (form === null) return;

    const query = value.trim();
    if (query === "") {
      form.requestSubmit();
    } else if (characterCount(query) >= LIVE_SEARCH_MIN_LENGTH) {
      pendingSearch.current = window.setTimeout(
        () => form.requestSubmit(),
        PAUSE_MS,
      );
    }
  }

  function handlePlatformChange(event: ChangeEvent<HTMLSelectElement>) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <Form
      action=""
      replace
      scroll={false}
      onSubmit={cancelPendingSearch}
      role="search"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      {/* First, so the address reads as pageHref writes it: ?page=2&q=… */}
      {page > 1 && <input type="hidden" name="page" value={page} />}
      <Field className="sm:flex-1">
        <FieldLabel htmlFor={queryId}>Tytuł gry</FieldLabel>
        <Input
          id={queryId}
          name="q"
          type="search"
          autoComplete="off"
          maxLength={MAX_QUERY_LENGTH}
          defaultValue={initialQuery}
          onChange={handleQueryChange}
        />
      </Field>
      <Field className="sm:w-52">
        <FieldLabel htmlFor={platformId}>Platforma</FieldLabel>
        <NativeSelect
          id={platformId}
          name="platform"
          defaultValue={defaultPlatform ?? ""}
          onChange={handlePlatformChange}
          className="w-full"
        >
          <NativeSelectOption value="">{pinLabel(null)}</NativeSelectOption>
          {PINNABLE_PLATFORMS.map((platform) => (
            <NativeSelectOption key={platform} value={platform}>
              {pinLabel(platform)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit">Szukaj</Button>
    </Form>
  );
}
