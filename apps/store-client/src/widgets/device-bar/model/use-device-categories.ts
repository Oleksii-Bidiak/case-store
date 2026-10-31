"use client";

import { useMemo } from "react";

import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { useCatalogLandingControllerFindCompatPages } from "@/shared/api/generated/catalog/catalog";

import {
  selectDeviceCategories,
  type DeviceCategory,
} from "./device-categories";

/** Landing pages change with catalogue edits only — ten minutes is plenty. */
const COMPAT_PAGES_STALE_TIME_MS = 10 * 60 * 1000;

const EMPTY: readonly DeviceCategory[] = Object.freeze([]);

export interface DeviceCategoriesState {
  categories: readonly DeviceCategory[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Root categories with products for `deviceSlug`. `enabled: false` (no device,
 * or a viewport below 1024 where tier 2 does not exist) sends no request: the
 * compat-pages list covers the whole catalogue, so a phone never downloads it
 * for a tier it cannot see. The category tree is the header's own query (the
 * «Каталог» menu fires it on mount), so it costs no extra request.
 */
export function useDeviceCategories(
  deviceSlug: string | undefined,
  enabled: boolean,
): DeviceCategoriesState {
  const on = enabled && Boolean(deviceSlug);
  const pages = useCatalogLandingControllerFindCompatPages({
    query: { enabled: on, staleTime: COMPAT_PAGES_STALE_TIME_MS },
  });
  const tree = useCategoryControllerGetCategoryTree({
    query: { enabled: on },
  });

  const pageList = pages.data?.data;
  const roots = tree.data?.data;
  const categories = useMemo(
    () =>
      deviceSlug && pageList && roots
        ? selectDeviceCategories(pageList, deviceSlug, roots)
        : EMPTY,
    [deviceSlug, pageList, roots],
  );

  return {
    categories,
    isLoading: on && (pages.isLoading || tree.isLoading),
    isError: pages.isError || tree.isError,
  };
}
