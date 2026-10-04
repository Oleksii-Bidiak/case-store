"use client";

import { useId, useMemo } from "react";
import type { DeviceBrandEntity } from "@/entities/device";
import {
  FilterSection,
  FilterSheet,
  TreeCombobox,
  useFilterDraft,
  type TreeComboboxItem,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.devices;

export interface DeviceModelFilters {
  deviceBrandId: string;
}

export const EMPTY_DEVICE_MODEL_FILTERS: DeviceModelFilters = {
  deviceBrandId: "",
};

interface DeviceModelFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: DeviceModelFilters;
  onApply: (next: DeviceModelFilters) => void;
  brands: readonly DeviceBrandEntity[];
}

/**
 * «Фільтри» of the model registry (DevicesProposal ПР2): the brand, through a
 * combobox you can type into (TASK-423) — hidden brands included, or their
 * models would be unreachable from here. Status is the quick views.
 *
 * Not drawn: «Рік» — `GET /admin/devices/models` has no year filter
 * (TASK-1082 API tail).
 */
export function DeviceModelFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
  brands,
}: DeviceModelFilterSheetProps) {
  const { draft, update, reset } = useFilterDraft(applied, open);
  const brandId = useId();
  const items = useMemo<TreeComboboxItem[]>(
    () =>
      brands.map((brand) => ({ value: brand.id, label: brand.name, depth: 0 })),
    [brands],
  );

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      applyLabel={d.filtersApply}
      onApply={() => {
        onApply(draft);
        onOpenChange(false);
      }}
      onReset={() => reset(EMPTY_DEVICE_MODEL_FILTERS)}
    >
      <FilterSection title={d.filterBrand}>
        <label htmlFor={brandId} className="sr-only">
          {d.filterBrand}
        </label>
        <TreeCombobox
          id={brandId}
          items={items}
          value={draft.deviceBrandId}
          onChange={(value) => update({ deviceBrandId: value })}
          clearLabel={d.allBrands}
          placeholder={d.filterBrandPlaceholder}
          emptyText={d.filterNothingFound}
        />
      </FilterSection>
    </FilterSheet>
  );
}
