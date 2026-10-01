"use client";

import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
// The generated query options, so `useQueries` stays on the Orval client (no
// manual fetch). `entities/product` re-exports the hook and its key but not the
// options factory; widgets may read `shared` directly (TASK-1615).
import { getProductControllerGetCardsQueryOptions } from "@/shared/api/generated/products/products";
import type { ProductCardsResponseEnvelope } from "@/entities/product";
import {
  useCategoryControllerGetCategoryTree,
  type CategoryTreeNodeEntity,
} from "@/entities/category";
import type { WishlistItemFacets } from "./wishlist-catalog";

/** `GET /products/cards?ids=` takes at most 24 ids per request. */
const CARDS_BATCH = 24;

function flattenCategoryNames(
  nodes: readonly CategoryTreeNodeEntity[],
  into: Map<string, string>,
): Map<string, string> {
  for (const node of nodes) {
    into.set(node.id, node.name);
    flattenCategoryNames(node.children, into);
  }
  return into;
}

type CardsResult = UseQueryResult<ProductCardsResponseEnvelope>;

/**
 * Fold every landed batch into one productId → facets map. Module-level, so
 * `useQueries` sees a stable `combine` and re-runs it only when a batch result
 * changes — the map keeps its identity across unrelated renders.
 */
function combineFacets(
  results: CardsResult[],
): ReadonlyMap<string, WishlistItemFacets> {
  const map = new Map<string, WishlistItemFacets>();
  for (const result of results) {
    for (const card of result.data?.data ?? []) {
      map.set(card.id, {
        categoryId: card.categoryId,
        brandId: card.brand?.id,
        brandName: card.brand?.name,
      });
    }
  }
  return map;
}

/**
 * Category and brand for every saved product (TASK-1300).
 *
 * The wishlist item summary carries neither (it is name, price, stock and an
 * image), so the rail asks the product cards endpoint for the same ids — the
 * one the «Ви переглядали» rail uses — in batches of 24. The ids are sorted
 * before batching, so re-ordering the list never re-keys the cache; only adding
 * or removing an item refetches its batch. Category NAMES come from the
 * category tree every catalogue page already caches.
 *
 * Compatible devices are deliberately not read: the cards endpoint does not
 * hydrate `compatibleDeviceModels` (it is always empty there), so a
 * «Сумісний пристрій» section would be a control with nothing behind it
 * (TASK-1616).
 */
export function useWishlistFacets(productIds: readonly string[]): {
  facetsById: ReadonlyMap<string, WishlistItemFacets>;
  categoryNames: ReadonlyMap<string, string>;
} {
  const batches = useMemo(() => {
    const ids = [...new Set(productIds)].sort();
    const out: string[] = [];
    for (let i = 0; i < ids.length; i += CARDS_BATCH) {
      out.push(ids.slice(i, i + CARDS_BATCH).join(","));
    }
    return out;
  }, [productIds]);

  const facetsById = useQueries({
    queries: batches.map((ids) =>
      getProductControllerGetCardsQueryOptions({ ids }),
    ),
    combine: combineFacets,
  });

  const { data: treeData } = useCategoryControllerGetCategoryTree();

  const categoryNames = useMemo(
    () => flattenCategoryNames(treeData?.data ?? [], new Map()),
    [treeData],
  );

  return { facetsById, categoryNames };
}
