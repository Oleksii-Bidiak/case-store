"use client";

import { useState } from "react";
import {
  useDeviceControllerFindBrands,
  useDeviceControllerFindModels,
} from "@/entities/device";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.filters;

/**
 * Radix Select forbids an empty-string item value, so "no selection" needs a
 * sentinel. Without an item carrying it there is no way to UN-set either select
 * from its own control — which is exactly how this filter behaved until
 * TASK-414: once a device was picked, the only way back was the chip above the
 * grid or editing the URL.
 */
const ANY_DEVICE = "__any_device__";

interface DeviceModelFilterProps {
  /** Currently-selected device model id (from the URL), or undefined. */
  currentDeviceModelId?: string;
  /** Write the chosen model id (or `undefined` to clear) back to the URL. */
  onChange: (deviceModelId: string | undefined) => void;
  /**
   * Prefix for the DOM ids of the two selects. The filter panel renders twice
   * (desktop aside + mobile drawer), so each instance needs a distinct prefix to
   * keep ids unique in the document — same contract as `ProductFilters`.
   */
  idPrefix?: string;
}

/**
 * DeviceModelFilter — the catalog "Сумісний пристрій" control (TASK-190): a
 * brand → model cascade, URL-synced via `?deviceModelId=`. Fetches every active
 * model once so it can (a) scope the model dropdown to the chosen brand and
 * (b) resolve the brand of a model already selected in the URL, without a second
 * request per brand switch. The selects are not focus-sensitive text inputs, so
 * the URL-derived selection can drive them directly.
 */
export function DeviceModelFilter({
  currentDeviceModelId,
  onChange,
  idPrefix = "filter",
}: DeviceModelFilterProps) {
  const { data: brandsData } = useDeviceControllerFindBrands();
  const brands = brandsData?.data ?? [];

  // All active models in one call (seed is a bounded slice); grouped in-memory.
  const { data: modelsData } = useDeviceControllerFindModels();
  const models = modelsData?.data ?? [];

  const selectedModel = models.find((m) => m.id === currentDeviceModelId);

  // Local brand override lets the user browse a brand before picking a model;
  // otherwise the brand is derived from the model selected in the URL.
  const [brandOverride, setBrandOverride] = useState<string | null>(null);
  const brandId = brandOverride ?? selectedModel?.deviceBrandId ?? "";

  const brandModels = models.filter((m) => m.deviceBrandId === brandId);

  function handleBrandChange(nextBrandId: string) {
    if (nextBrandId === ANY_DEVICE) {
      // Clearing the brand clears the whole cascade — a model without its brand
      // would leave the second select populated from a brand nobody selected.
      setBrandOverride(null);
      onChange(undefined);
      return;
    }
    setBrandOverride(nextBrandId);
    // Clear any selected model that no longer belongs to the chosen brand.
    if (selectedModel && selectedModel.deviceBrandId !== nextBrandId) {
      onChange(undefined);
    }
  }

  function handleModelChange(nextModelId: string) {
    onChange(nextModelId === ANY_DEVICE ? undefined : nextModelId || undefined);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Select
        value={brandId === "" ? ANY_DEVICE : brandId}
        onValueChange={handleBrandChange}
      >
        <SelectTrigger
          id={`${idPrefix}-device-brand`}
          aria-label={t.deviceBrandAria}
          className="h-[42px] bg-background"
        >
          <SelectValue placeholder={t.deviceBrandPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_DEVICE}>{t.deviceAnyOption}</SelectItem>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentDeviceModelId ?? ANY_DEVICE}
        onValueChange={handleModelChange}
        disabled={!brandId}
      >
        <SelectTrigger
          id={`${idPrefix}-device-model`}
          aria-label={t.deviceModelAria}
          className="h-[42px] bg-background"
        >
          <SelectValue placeholder={t.deviceModelPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_DEVICE}>{t.deviceAnyOption}</SelectItem>
          {brandModels.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
