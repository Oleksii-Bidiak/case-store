"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  getBrandControllerAdminFindAllQueryKey,
  useBrandControllerAdminFindAll,
  useAdminBrandControllerSetStatus,
  type BrandEntity,
} from "@/entities/brand";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  Button,
  Callout,
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useConfirmDialog,
  useDataRegistry,
  type QuickView,
  type RowActionItem,
} from "@/shared/ui";
import { countLabel } from "@/shared/lib";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import {
  brandProductsHref,
  buildBrandColumns,
  renderBrandCard,
} from "./brand-registry-columns";

const d = dict.brands;

const ALL_VIEW = "all";
/** The old `?status=` values — kept, so every bookmarked filter still works. */
const ACTIVE_OPTION = "active";
const INACTIVE_OPTION = "inactive";

/** The one-row request whose `meta.total` is a view counter. */
const COUNT_QUERY = { page: 1, limit: 1 } as const;

const getRowId = (brand: BrandEntity) => brand.id;
const getRowLabel = (brand: BrandEntity) => brand.name;
const editHref = (brand: BrandEntity) => `/brands/${brand.id}/edit`;

/** View counters from the API's own `meta.total` (the blog / reviews pattern). */
function useViewCounts(): Record<string, number | undefined> {
  const all = useBrandControllerAdminFindAll(COUNT_QUERY);
  const shown = useBrandControllerAdminFindAll({
    ...COUNT_QUERY,
    isActive: true,
  });
  const hidden = useBrandControllerAdminFindAll({
    ...COUNT_QUERY,
    isActive: false,
  });
  return {
    [ALL_VIEW]: all.data?.meta?.total,
    [ACTIVE_OPTION]: shown.data?.meta?.total,
    [INACTIVE_OPTION]: hidden.data?.meta?.total,
  };
}

/**
 * The brand registry (TASK-189 → TASK-357 → TASK-840) on the shared
 * `DataRegistry` (wave 198, BrandsProposal БР1–БР4, TASK-1078).
 *
 * The URL contract is unchanged: `?search=`, `?status=active|inactive`,
 * `?page=`, `?limit=`. The status select became the quick views
 * «Усі · Показуються · Приховані», counted by the API.
 *
 * What moved, nothing removed: «Редагувати» and «Приховати / Активувати» went
 * from two buttons into «⋯»; hiding now asks first and says what happens to
 * the brand's products (БР4); the row opens the form; the count links into
 * «Товари» filtered by the brand (for a session with `products:read`).
 *
 * Not drawn because the API has no support (TASK-1078…1081 API tails): the
 * «Без логотипа» view (no logo filter; the list is paged, so a local filter
 * would lie), search by slug (the API searches the name), «Видалити…» (no
 * `DELETE /brands/:id`), «Об'єднати з іншим брендом…» (TASK-1079) and
 * «Сторінка бренду на сайті» (no storefront `/brands/<slug>` — TASK-1080).
 *
 * Every admin brand route needs `brands:write` today — there is no read-only
 * key — so the view-only state below is what a future `brands:read` gets.
 */
export function AdminBrandTable() {
  return (
    <LiveAnnouncer>
      <AdminBrandRegistry />
    </LiveAnnouncer>
  );
}

function AdminBrandRegistry() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const updateParams = useUrlParams();
  const { can } = useAuth();
  const canWrite = can(PERM.brandsWrite);
  const canOpenProducts = can(PERM.productsRead);
  const { confirm, confirmDialog } = useConfirmDialog();

  const searchParam = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const isActiveFilter =
    statusParam === ACTIVE_OPTION
      ? true
      : statusParam === INACTIVE_OPTION
        ? false
        : undefined;

  const { data, dataUpdatedAt, isLoading, isFetching, isError, refetch } =
    useBrandControllerAdminFindAll({
      page,
      limit: pageSize,
      search: searchParam || undefined,
      isActive: isActiveFilter,
    });
  const counts = useViewCounts();

  const setStatus = useAdminBrandControllerSetStatus();

  const brands = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  const columns = useMemo(
    () => buildBrandColumns({ canOpenProducts }),
    [canOpenProducts],
  );
  const registry = useDataRegistry({
    tableId: "brands",
    columns,
    rows: brands,
    getRowId,
  });

  // Prefix match: the key without params covers the page AND the counters.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getBrandControllerAdminFindAllQueryKey(),
    });

  const setVisibility = (brand: BrandEntity, isActive: boolean) => {
    setStatus.mutate(
      { id: brand.id, data: { isActive } },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(isActive ? d.toastActivated : d.toastDeactivated);
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  // БР4 — hiding takes the brand out of the storefront filter; say so first.
  // Showing it again has no consequence to warn about.
  const handleToggle = async (brand: BrandEntity) => {
    if (!brand.isActive) {
      setVisibility(brand, true);
      return;
    }
    const confirmed = await confirm({
      title: d.hideTitle(brand.name),
      description: d.hideBody(brand.productCount),
      confirmLabel: d.hideAction,
    });
    if (confirmed) setVisibility(brand, false);
  };

  const rowActions = (brand: BrandEntity): RowActionItem[] => {
    const items: RowActionItem[] = [
      {
        label: canWrite ? dict.common.edit : dict.common.view,
        href: editHref(brand),
      },
    ];
    if (canOpenProducts && brand.productCount !== undefined) {
      items.push({
        label: d.rowProducts(brand.productCount),
        href: brandProductsHref(brand),
      });
    }
    if (canWrite) {
      items.push({
        label: brand.isActive ? d.deactivate : d.activate,
        onSelect: () => void handleToggle(brand),
        disabled: setStatus.isPending,
        separatorBefore: true,
      });
    }
    return items;
  };

  const activeView =
    statusParam === ""
      ? ALL_VIEW
      : isActiveFilter === undefined
        ? ""
        : statusParam;
  const quickViews: QuickView[] = [
    { id: ALL_VIEW, label: d.allStatuses, count: counts[ALL_VIEW] },
    { id: ACTIVE_OPTION, label: d.viewShown, count: counts[ACTIVE_OPTION] },
    {
      id: INACTIVE_OPTION,
      label: d.viewHidden,
      count: counts[INACTIVE_OPTION],
    },
  ];

  return (
    <>
      <DataRegistry
        registry={registry}
        title={d.heading}
        description={d.description}
        headerActions={
          canWrite ? (
            <Button asChild>
              <Link href="/brands/new">
                <PlusIcon aria-hidden="true" />
                {d.add}
              </Link>
            </Button>
          ) : null
        }
        quickViews={{
          items: quickViews,
          activeId: activeView,
          onChange: (id) =>
            updateParams({
              status: id === ALL_VIEW ? undefined : id,
              page: undefined,
            }),
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        notice={
          canWrite ? null : (
            <Callout variant="strip">{d.viewOnlyNotice}</Callout>
          )
        }
        summary={
          data ? (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          ) : null
        }
        sortLabel={d.sortByName}
        updatedAt={dataUpdatedAt || undefined}
        itemForms={d.itemForms}
        getRowLabel={getRowLabel}
        getRowHref={editHref}
        rowActions={rowActions}
        rowActionsLabel={(brand) => d.rowActionsAria(brand.name)}
        renderCard={renderBrandCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={d.empty}
        searchQuery={searchParam || undefined}
        isFiltered={Boolean(statusParam)}
        pagination={{ page, totalPages, pageSize }}
      />
      {confirmDialog}
    </>
  );
}
