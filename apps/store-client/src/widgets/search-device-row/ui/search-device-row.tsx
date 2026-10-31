"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import {
  getDeviceFamily,
  getDeviceFamilyTone,
  useDeviceModelCatalog,
} from "@/entities/device";
import { useSearch } from "@/entities/search";
import {
  deviceBlockPlacement,
  deviceKindOf,
  showNotSoldLine,
  useSearchDeviceModel,
  type SearchDeviceMatch,
} from "@/features/search";
import { useCatalogLandingControllerFindDeviceHub } from "@/shared/api/generated/catalog/catalog";

import {
  DEVICE_SALE_CATEGORY,
  MAX_SOLD_DEVICES,
  pickSoldDevices,
} from "../model/sold-devices";
import { DeviceSaleBlock } from "./device-sale-block";
import { ModelRow, type ModelRowCategory } from "./model-row";

/** Model hubs and device listings change on admin edits only. */
const STALE_TIME_MS = 5 * 60 * 1000;

/** Enough hits for the few devices of one category to be among them. */
const DEVICE_LOOKUP_LIMIT = 24;

interface SearchDeviceRowProps {
  /** The query from the URL (`?q=`) as the server saw it. */
  query: string;
}

/**
 * The model row of `/search` (TASK-2069, Д3-2), mounted by the page ABOVE the
 * results: when the query names a device model it says so, leads to the
 * model's accessories and offers the device action — and, by the Д3-2 rules,
 * shows the device itself («Сам … у продажу») first, under the row, or not at
 * all. Client-only: the model list, the hub counts and «Мої пристрої» all
 * live on the client, so the cached HTML carries nothing personal. Nothing
 * renders until the model list is there and recognises the query.
 */
export function SearchDeviceRow({ query }: SearchDeviceRowProps) {
  const searchParams = useSearchParams();
  // The live URL wins over the server-resolved prop (they agree on first
  // render), exactly like `SearchResultsView`.
  const q = (searchParams.get("q") ?? query).trim();
  const match = useSearchDeviceModel(q, { enabled: q.length > 0 });
  if (!match) return null;
  // A new model starts from a clean slate — no counts of the previous one.
  return <SearchDeviceRowContent key={match.model.id} match={match} />;
}

function SearchDeviceRowContent({ match }: { match: SearchDeviceMatch }) {
  const { model, productWord } = match;
  const family = getDeviceFamily(model);
  const tone = getDeviceFamilyTone(family);
  const kind = deviceKindOf({ ...model, family });
  // The same cached list `useSearchDeviceModel` read — no second request.
  const { models } = useDeviceModelCatalog();

  // The model's accessory categories with counts — the model hub's groups.
  // An empty model has no hub (404), so it is not asked for.
  const hub = useCatalogLandingControllerFindDeviceHub(model.slug, {
    query: {
      enabled: model.productCount > 0,
      staleTime: STALE_TIME_MS,
      retry: false,
    },
  });
  const categories: ModelRowCategory[] = useMemo(
    () =>
      (hub.data?.data.groups ?? []).map((group) => ({
        slug: group.category.slug,
        name: group.category.name,
        count: group.productCount,
      })),
    [hub.data],
  );

  // The device itself: the model's own category, searched by the model name.
  // An accessory word hides the block, so the lookup is skipped then.
  const lookup = useSearch(
    {
      q: model.name,
      category: DEVICE_SALE_CATEGORY[kind],
      limit: DEVICE_LOOKUP_LIMIT,
    },
    { query: { enabled: productWord === null, staleTime: STALE_TIME_MS } },
  );
  const devices = useMemo(
    () =>
      lookup.data
        ? pickSoldDevices(lookup.data.data, model, models).slice(
            0,
            MAX_SOLD_DEVICES,
          )
        : [],
    [lookup.data, model, models],
  );
  // `undefined` = not known yet (loading, or the lookup failed): no block and
  // no "not sold" line rather than a wrong claim either way.
  const sold = lookup.isSuccess ? devices.length > 0 : undefined;

  const placement = deviceBlockPlacement(match, sold);
  const saleBlock =
    placement === "hidden" ? null : (
      <DeviceSaleBlock
        modelName={model.name}
        brandName={model.brandName}
        kind={kind}
        products={devices}
        placement={placement}
      />
    );

  return (
    <div className="mb-6 flex flex-col gap-6">
      {placement === "before" && saleBlock}
      <ModelRow
        match={match}
        tone={tone}
        hasFamily={family !== null}
        kind={kind}
        categories={categories}
        showNotSold={showNotSoldLine(match, sold)}
      />
      {placement === "after" && saleBlock}
    </div>
  );
}
