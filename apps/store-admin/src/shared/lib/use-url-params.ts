"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A patch over the current query string: a key with a value is set, a key with
 * `undefined` or `""` is removed, and anything not mentioned is left alone.
 */
export type UrlParamsPatch = Record<string, string | undefined>;

/**
 * useUrlParams — writes admin-table view state into the URL (TASK-358).
 *
 * Seventeen list widgets grew their own copy of this eleven-line helper during
 * the TASK-292 wave, each written slightly differently. The merge semantic is
 * the part worth having in one place: a table changes one control at a time, so
 * writing `?page=` must never drop the `?search=` the operator typed.
 *
 * ── Always `replace`, never `push` ───────────────────────────────────────────
 * Ten of the seventeen copies replaced and seven pushed, and nothing about the
 * tables explains the split — it is the order they were written in. `replace`
 * is right for all of them, because search, filter, sort and page are view
 * state, not navigation. Under `push`, narrowing a filter four times buries the
 * page the operator arrived from under four history entries, and Back stops
 * meaning "leave this screen": it means "undo one keystroke of a filter", as
 * many times as the filter was touched. Nothing else is given up — the URL
 * still carries the whole view, so it is still shareable and still survives a
 * reload.
 *
 * Reading stays with each table, which calls `useSearchParams()` itself because
 * it needs the values. This hook owns writing only.
 *
 * Not barrel-exported from `shared/lib/index.ts` — like `use-table-sort`, it is
 * a `"use client"` hook and must be imported directly from this file.
 */
export function useUrlParams(): (next: UrlParamsPatch) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (next: UrlParamsPatch) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [pathname, router, searchParams],
  );
}
