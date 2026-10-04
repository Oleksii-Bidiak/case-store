"use client";

import { useMemo } from "react";
import { useCatalogLandingControllerFindCompatPages } from "@/shared/api";
import type { CompatLandingPageEntity } from "@/shared/api";

/**
 * The compatibility landing pages («Чохли для iPhone 15 Pro») that are LIVE
 * right now, grouped by device model (wave 198, TASK-1082).
 *
 * Read from `GET /catalog/compat-pages` — the very list the sitemap is built
 * from, so «live» here means exactly what the storefront serves: a page exists
 * while its category holds at least one visible compatible product, and a
 * hidden model has none. One request for the whole catalogue; the models list
 * payload carries no page count (the per-model count in the list response is
 * an API tail).
 */
export function useLiveCompatPages(): {
  byModel: ReadonlyMap<string, readonly CompatLandingPageEntity[]>;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useCatalogLandingControllerFindCompatPages();
  const byModel = useMemo(() => {
    const map = new Map<string, CompatLandingPageEntity[]>();
    for (const page of query.data?.data ?? []) {
      const list = map.get(page.deviceModelId);
      if (list) list.push(page);
      else map.set(page.deviceModelId, [page]);
    }
    return map;
  }, [query.data]);
  return { byModel, isLoading: query.isLoading, isError: query.isError };
}
