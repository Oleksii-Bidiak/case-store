"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminDeviceControllerFindModelsQueryKey,
  useAdminDeviceControllerActivateModel,
  useAdminDeviceControllerDeactivateModel,
  useAdminDeviceControllerFindBrands,
  useAdminDeviceControllerFindModels,
  useLiveCompatPages,
  type DeviceModelEntity,
} from "@/entities/device";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  Callout,
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useConfirmDialog,
  useDataRegistry,
  type FilterChip,
  type QuickView,
  type RowActionItem,
} from "@/shared/ui";
import { countLabel } from "@/shared/lib";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict, STOREFRONT_URL } from "@/shared/config";
import {
  buildDeviceModelColumns,
  renderDeviceModelCard,
} from "./device-model-registry-columns";
import { DeviceModelFilterSheet } from "./device-model-filter-sheet";

const d = dict.devices;

const ALL_VIEW = "all";
/** The old `?isActive=` values — kept, so every bookmarked filter still works. */
const SHOWN_VIEW = "true";
const HIDDEN_VIEW = "false";

const COUNT_QUERY = { page: 1, limit: 1 } as const;

const getRowId = (model: DeviceModelEntity) => model.id;
const getRowLabel = (model: DeviceModelEntity) => model.name;
const editHref = (model: DeviceModelEntity) =>
  `/devices/models/${model.id}/edit`;
const compatProductsHref = (model: DeviceModelEntity) =>
  `/products?deviceModelId=${encodeURIComponent(model.id)}`;
/** The storefront catalogue narrowed to this model — `?device=<slug>`. */
const siteCatalogHref = (model: DeviceModelEntity) =>
  `${STOREFRONT_URL}/catalog?device=${encodeURIComponent(model.slug)}`;

/** View counters from the API's own `meta.total` (the blog / reviews pattern). */
function useViewCounts(
  deviceBrandId: string | undefined,
  search: string | undefined,
) {
  const base = { ...COUNT_QUERY, deviceBrandId, search };
  const all = useAdminDeviceControllerFindModels(base);
  const shown = useAdminDeviceControllerFindModels({ ...base, isActive: true });
  const hidden = useAdminDeviceControllerFindModels({
    ...base,
    isActive: false,
  });
  return {
    [ALL_VIEW]: all.data?.meta?.total,
    [SHOWN_VIEW]: shown.data?.meta?.total,
    [HIDDEN_VIEW]: hidden.data?.meta?.total,
  } as Record<string, number | undefined>;
}

/**
 * The device-model registry (TASK-190 → TASK-357 → TASK-423) on the shared
 * `DataRegistry` (wave 198, DevicesProposal ПР1–ПР4, ПР10, TASK-1082).
 *
 * The URL contract is unchanged: `?search=`, `?deviceBrandId=`, `?isActive=`,
 * `?page=`, `?limit=`. The status select became the quick views; the brand
 * select moved into «Фільтри» as a combobox you can type into, and its chip
 * says «Бренд: Samsung» rather than the filter's technical name.
 *
 * What moved, nothing removed: «Редагувати» and «Приховати / Активувати» went
 * from two buttons into «⋯»; hiding now asks first and says how many live
 * compatibility pages stop opening (ПР10); «Сумісні товари» opens «Товари»
 * filtered by the device; «Каталог для цієї моделі на сайті» opens the
 * storefront's `/catalog?device=<slug>` for a model that is shown.
 *
 * «Сторінок на сайті» counts the live landing pages from
 * `GET /catalog/compat-pages` (the sitemap's list). Not drawn because the API
 * has no support (TASK-1082 API tails): «Товарів» per model and the «Без
 * товарів» view (no product count in the list), search by series (the API
 * searches the name), the «Рік» filter.
 */
export function DeviceModelTable() {
  return (
    <LiveAnnouncer>
      <DeviceModelRegistry />
    </LiveAnnouncer>
  );
}

function DeviceModelRegistry() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const updateParams = useUrlParams();
  const { can } = useAuth();
  const canWrite = can(PERM.devicesWrite);
  const canOpenProducts = can(PERM.productsRead);
  const { confirm, confirmDialog } = useConfirmDialog();

  const searchParam = searchParams.get("search") ?? "";
  const brandParam = searchParams.get("deviceBrandId") ?? "";
  const statusParam = searchParams.get("isActive") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);
  const isActive =
    statusParam === SHOWN_VIEW
      ? true
      : statusParam === HIDDEN_VIEW
        ? false
        : undefined;

  const { data, dataUpdatedAt, isLoading, isFetching, isError, refetch } =
    useAdminDeviceControllerFindModels({
      page,
      limit: pageSize,
      search: searchParam || undefined,
      deviceBrandId: brandParam || undefined,
      isActive,
    });
  const counts = useViewCounts(
    brandParam || undefined,
    searchParam || undefined,
  );
  // The brand list feeds the filter and the chip's name. Device brands are a
  // short, hand-curated taxonomy, and the no-argument read is the complete
  // list the brands tab already holds — hidden brands included.
  const brandsQuery = useAdminDeviceControllerFindBrands();
  const brands = useMemo(
    () => brandsQuery.data?.data ?? [],
    [brandsQuery.data],
  );
  const compat = useLiveCompatPages();

  const activate = useAdminDeviceControllerActivateModel();
  const deactivate = useAdminDeviceControllerDeactivateModel();
  const pending = activate.isPending || deactivate.isPending;

  const models = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  // `undefined` = not known: still loading, or the read failed — never a 0
  // that would tell the hide dialog there is nothing to warn about.
  const pagesOf = useMemo(
    () => (model: DeviceModelEntity) =>
      compat.isLoading || compat.isError
        ? undefined
        : (compat.byModel.get(model.id)?.length ?? 0),
    [compat.byModel, compat.isLoading, compat.isError],
  );
  const columns = useMemo(
    () => buildDeviceModelColumns({ pagesOf }),
    [pagesOf],
  );
  const renderCard = useMemo(() => renderDeviceModelCard(pagesOf), [pagesOf]);
  const registry = useDataRegistry({
    tableId: "device-models",
    columns,
    rows: models,
    getRowId,
  });

  const setVisibility = (model: DeviceModelEntity, show: boolean) => {
    const mutation = show ? activate : deactivate;
    mutation.mutate(
      { id: model.id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindModelsQueryKey(),
          });
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  // ПР10 — hiding takes the model out of the device picker AND closes its
  // landing pages; say so first. Showing it again has nothing to warn about.
  const handleToggle = async (model: DeviceModelEntity) => {
    if (!model.isActive) {
      setVisibility(model, true);
      return;
    }
    const pages = pagesOf(model);
    const confirmed = await confirm({
      title: d.hideModelTitle(model.name),
      description:
        pages === undefined ? d.hideModelBodyUnknown : d.hideModelBody(pages),
      confirmLabel: d.hideAction,
    });
    if (confirmed) setVisibility(model, false);
  };

  const rowActions = (model: DeviceModelEntity): RowActionItem[] => {
    const items: RowActionItem[] = [
      {
        label: canWrite ? dict.common.edit : dict.common.view,
        href: editHref(model),
      },
    ];
    if (canOpenProducts) {
      items.push({
        label: d.rowCompatProducts,
        href: compatProductsHref(model),
      });
    }
    // Owner decision 2026-10-01: only what is live on the site is linked.
    if (model.isActive) {
      items.push({
        label: d.rowOpenCatalog,
        href: siteCatalogHref(model),
        newTab: true,
      });
    }
    if (canWrite) {
      items.push({
        label: model.isActive ? d.hideModelItem : d.activate,
        onSelect: () => void handleToggle(model),
        disabled: pending,
        separatorBefore: true,
      });
    }
    return items;
  };

  const activeView =
    statusParam === "" ? ALL_VIEW : isActive === undefined ? "" : statusParam;
  const quickViews: QuickView[] = [
    { id: ALL_VIEW, label: d.allStatuses, count: counts[ALL_VIEW] },
    { id: SHOWN_VIEW, label: d.viewShown, count: counts[SHOWN_VIEW] },
    { id: HIDDEN_VIEW, label: d.viewHidden, count: counts[HIDDEN_VIEW] },
  ];

  // The chip shows whenever the filter is on — a brand that is still loading
  // or no longer exists (an old bookmark) must still be removable, or the list
  // is narrowed with nothing on screen saying why.
  const brandName =
    brands.find((brand) => brand.id === brandParam)?.name ??
    (brandsQuery.isLoading ? "…" : d.chipBrandUnknown);
  const chips: FilterChip[] = brandParam
    ? [
        {
          key: "brand",
          label: d.chipBrand(brandName),
          onRemove: () =>
            updateParams({ deviceBrandId: undefined, page: undefined }),
        },
      ]
    : [];

  return (
    <>
      <DataRegistry
        registry={registry}
        title={d.tabModels}
        showHeader={false}
        quickViews={{
          items: quickViews,
          activeId: activeView,
          onChange: (id) =>
            updateParams({
              isActive: id === ALL_VIEW ? undefined : id,
              page: undefined,
            }),
        }}
        search={{
          value: searchParam,
          placeholder: d.modelsSearchPlaceholder,
          label: d.modelsSearchAria,
        }}
        filters={{
          count: brandParam ? 1 : 0,
          renderSheet: ({ open, onOpenChange }) => (
            <DeviceModelFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={{ deviceBrandId: brandParam }}
              brands={brands}
              onApply={(next) =>
                updateParams({
                  deviceBrandId: next.deviceBrandId || undefined,
                  page: undefined,
                })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault, defaultQuickViewId: ALL_VIEW }}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        notice={
          canWrite ? null : (
            <Callout variant="strip">{d.viewOnlyNotice}</Callout>
          )
        }
        chips={chips}
        onClearAllChips={() =>
          updateParams({ deviceBrandId: undefined, page: undefined })
        }
        summary={
          data ? (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.modelItemForms)}</SummaryValue>
            </>
          ) : null
        }
        sortLabel={d.sortNewest}
        updatedAt={dataUpdatedAt || undefined}
        itemForms={d.modelItemForms}
        getRowLabel={getRowLabel}
        getRowHref={editHref}
        rowActions={rowActions}
        rowActionsLabel={(model) => d.modelRowActionsAria(model.name)}
        renderCard={renderCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.modelsLoadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={d.modelsEmpty}
        searchQuery={searchParam || undefined}
        isFiltered={Boolean(brandParam || statusParam)}
        pagination={{ page, totalPages, pageSize }}
      />
      {confirmDialog}
    </>
  );
}
