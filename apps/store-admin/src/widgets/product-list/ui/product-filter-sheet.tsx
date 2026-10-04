"use client";

import { useId, useMemo } from "react";
import {
  useBrandControllerFindAll,
  useDeviceControllerFindModels,
} from "@/shared/api";
import {
  FilterSection,
  FilterSheet,
  PillGroup,
  RangeInputs,
  TreeCombobox,
  useFilterDraft,
  type TreeComboboxItem,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.products;

/**
 * The list's filters as they sit in the URL — `""` means "any". `status`
 * folds the old «Видалені» select in (`deleted`): the API answers live rows
 * OR tombstones, never both, so «deleted» is one more status, not a fourth
 * independent axis.
 */
export interface ProductFilters {
  status: "" | "active" | "hidden" | "deleted";
  stock: "" | "in" | "out";
  categoryId: string;
  brandId: string;
  minPrice: string;
  maxPrice: string;
  deviceModelId: string;
}

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  status: "",
  stock: "",
  categoryId: "",
  brandId: "",
  minPrice: "",
  maxPrice: "",
  deviceModelId: "",
};

interface ProductFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: ProductFilters;
  onApply: (next: ProductFilters) => void;
  categories: readonly TreeComboboxItem[];
}

/** Active brands (the public list) — for the brand pills and chip names. */
export function useProductFilterBrands(enabled: boolean) {
  const query = useBrandControllerFindAll(undefined, { query: { enabled } });
  const brands = useMemo(
    () =>
      (query.data?.data ?? []).map((brand) => ({
        id: brand.id,
        name: brand.name,
      })),
    [query.data],
  );
  return { brands, isLoading: query.isLoading };
}

/**
 * Device models for «Сумісний пристрій». `limit: 200` explicitly — the
 * endpoint's default is 50 (TASK-1134), and 200 is its ceiling: above that the
 * picker needs a server-side search instead.
 */
export function useProductFilterDevices(enabled: boolean) {
  const query = useDeviceControllerFindModels(
    { limit: 200 },
    { query: { enabled } },
  );
  const items = useMemo<TreeComboboxItem[]>(
    () =>
      (query.data?.data ?? []).map((model) => ({
        value: model.id,
        label: model.name,
        depth: 0,
      })),
    [query.data],
  );
  return { items, isLoading: query.isLoading };
}

/**
 * «Фільтри» of the product registry (ProductsProposal Т5) — only what
 * `GET /products/admin/list` actually filters by: status (incl. the deleted
 * view), stock (є / немає), category (with its subtree), brand, price range and
 * one compatible device. The artboard's «Мало (≤ 5)», «Наповнення» and
 * multi-pick of brands/categories are API tails, not drawn here.
 */
export function ProductFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
  categories,
}: ProductFilterSheetProps) {
  const { brands } = useProductFilterBrands(open);
  const devices = useProductFilterDevices(open);
  const { draft, update, reset } = useFilterDraft(applied, open);
  const categoryId = useId();
  const deviceId = useId();

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      applyLabel={d.filtersApply}
      onApply={() => {
        onApply(draft);
        onOpenChange(false);
      }}
      onReset={() => reset(EMPTY_PRODUCT_FILTERS)}
    >
      <FilterSection title={d.filterCategory}>
        <label htmlFor={categoryId} className="sr-only">
          {d.filterCategory}
        </label>
        <TreeCombobox
          id={categoryId}
          items={categories}
          value={draft.categoryId}
          onChange={(value) => update({ categoryId: value })}
          clearLabel={d.filterCategoryAny}
          placeholder={d.filterCategoryPlaceholder}
          emptyText={d.filterNothingFound}
        />
      </FilterSection>

      {brands.length > 0 ? (
        <FilterSection title={d.filterBrand}>
          <PillGroup
            label={d.filterBrand}
            value={draft.brandId}
            onChange={(brandId) => update({ brandId })}
            options={[
              { value: "", label: d.filterStatusAll },
              ...brands.map((brand) => ({
                value: brand.id,
                label: brand.name,
              })),
            ]}
          />
        </FilterSection>
      ) : null}

      <FilterSection title={d.filterPrice}>
        <RangeInputs
          legend={d.filterPrice}
          from={draft.minPrice}
          to={draft.maxPrice}
          inputMode="numeric"
          onChange={({ from, to }) =>
            update({
              minPrice: from.replace(/[^\d]/g, ""),
              maxPrice: to.replace(/[^\d]/g, ""),
            })
          }
        />
      </FilterSection>

      <FilterSection title={d.filterStock}>
        <PillGroup
          label={d.filterStock}
          value={draft.stock}
          onChange={(stock) =>
            update({ stock: stock as ProductFilters["stock"] })
          }
          options={[
            { value: "", label: d.filterStockAll },
            { value: "in", label: d.filterStockIn },
            { value: "out", label: d.filterStockOut },
          ]}
        />
      </FilterSection>

      <FilterSection title={d.filterStatus}>
        <PillGroup
          label={d.filterStatus}
          value={draft.status}
          onChange={(status) =>
            update({ status: status as ProductFilters["status"] })
          }
          options={[
            { value: "", label: d.filterStatusAll },
            { value: "active", label: d.filterStatusActive },
            { value: "hidden", label: d.filterStatusHidden },
            { value: "deleted", label: d.filterDeleted },
          ]}
        />
      </FilterSection>

      <FilterSection title={d.filterDevice}>
        <label htmlFor={deviceId} className="sr-only">
          {d.filterDevice}
        </label>
        <TreeCombobox
          id={deviceId}
          items={devices.items}
          value={draft.deviceModelId}
          onChange={(value) => update({ deviceModelId: value })}
          clearLabel={d.filterDeviceAny}
          placeholder={d.filterDevicePlaceholder}
          emptyText={d.filterNothingFound}
          isLoading={devices.isLoading}
        />
      </FilterSection>
    </FilterSheet>
  );
}
