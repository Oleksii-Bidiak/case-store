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

interface DeviceModelFilterProps {
  /** Currently-selected device model id (from the URL), or undefined. */
  currentDeviceModelId?: string;
  /** Write the chosen model id (or `undefined` to clear) back to the URL. */
  onChange: (deviceModelId: string | undefined) => void;
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
    setBrandOverride(nextBrandId);
    // Clear any selected model that no longer belongs to the chosen brand.
    if (selectedModel && selectedModel.deviceBrandId !== nextBrandId) {
      onChange(undefined);
    }
  }

  function handleModelChange(nextModelId: string) {
    onChange(nextModelId || undefined);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Select value={brandId} onValueChange={handleBrandChange}>
        <SelectTrigger
          aria-label={t.deviceBrandAria}
          className="h-[42px] bg-background"
        >
          <SelectValue placeholder={t.deviceBrandPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentDeviceModelId ?? ""}
        onValueChange={handleModelChange}
        disabled={!brandId}
      >
        <SelectTrigger
          aria-label={t.deviceModelAria}
          className="h-[42px] bg-background"
        >
          <SelectValue placeholder={t.deviceModelPlaceholder} />
        </SelectTrigger>
        <SelectContent>
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
