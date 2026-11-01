"use client";

import { useSearchParams } from "next/navigation";

import { isExactSearch } from "./exact-search";
import {
  useSearchDeviceModel,
  type SearchDeviceMatch,
} from "./use-search-device-model";

export interface SearchPageModel {
  /** The live query (`?q=`, trimmed); the server prop until the URL has one. */
  query: string;
  /** «Шукати точно» is on — no model is guessed. */
  exact: boolean;
  /** The recognised model, or `null` (none, still loading, or exact mode). */
  match: SearchDeviceMatch | null;
}

/**
 * The model `/search` is about (TASK-2069) — ONE answer for the fix line, the
 * model row, the device block and the results (a recognised model means every
 * result fits it, so the cards carry no fit mark, Д3-2 §3.6). Honours the
 * exact mode: `?exact=1` turns recognition off.
 */
export function useSearchPageModel(serverQuery: string): SearchPageModel {
  const searchParams = useSearchParams();
  // The live URL wins over the server-resolved prop (they agree on first
  // render), exactly like `SearchResultsView`.
  const query = (searchParams.get("q") ?? serverQuery).trim();
  const exact = isExactSearch(searchParams);
  const match = useSearchDeviceModel(query, {
    enabled: query.length > 0 && !exact,
  });
  return { query, exact, match: exact ? null : match };
}
