"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import {
  useProductGroupControllerFindAll,
  type ProductGroupSummaryEntity,
} from "@/entities/product-group";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import {
  Button,
  Callout,
  DataRegistry,
  LiveAnnouncer,
  RegistryHeader,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type RegistryCardParts,
  type RowActionItem,
} from "@/shared/ui";
import { countLabel } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  PRODUCT_GROUP_COLUMNS,
  ProductGroupAxes,
  ProductGroupStatusBadge,
} from "./product-group-registry-columns";

const g = dict.productGroups;

const editHref = (group: ProductGroupSummaryEntity) =>
  `/product-groups/${group.id}/edit`;

const getRowId = (group: ProductGroupSummaryEntity) => group.id;

/**
 * The product-group registry (TASK-142; paging, search and refresh TASK-357;
 * wave 198 — ProductGroupsProposal ГТ1, ГТ2, ГТ9, TASK-1084) on the shared
 * `DataRegistry`.
 *
 * The header explains what a group is. The name opens the group (a real
 * link); «Редагувати» moved into «⋯». Without `products:write` (TASK-1011)
 * «Додати групу» and «⋯» are gone and a strip says why — the group still opens,
 * read-only.
 *
 * Search, page and page size stay in the URL and on the SERVER, exactly as
 * TASK-357 left them. `GET /api/product-groups` is also read by the product
 * form's group picker, which passes no page/limit and gets the complete list;
 * this table is the caller that opts into paging.
 *
 * NOT drawn, because the list endpoint has no such data or filter (API tails):
 * the views «Усі · Показуються · Приховані · Є проблеми» with their counts
 * (no `isActive` filter, no problem check on the server), search by a
 * product's name, the category filter and the category under the name, sort,
 * «показується N з M», «Ціни». «Як це працює →» is not drawn either: the
 * shell's section help is local state of the header and cannot be opened from
 * a page.
 */
export function AdminProductGroupTable() {
  return (
    <LiveAnnouncer>
      <AdminProductGroupView />
    </LiveAnnouncer>
  );
}

function AdminProductGroupView() {
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const canWrite = can(PERM.productsWrite);

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const search = searchParam || undefined;
  const { data, isLoading, isFetching, isError, refetch } =
    useProductGroupControllerFindAll({ page, limit: pageSize, search });

  const groups = data?.data ?? [];
  const total = data?.meta?.total;
  const totalPages = data?.meta?.totalPages ?? 1;

  const registry = useDataRegistry({
    tableId: "product-groups",
    columns: PRODUCT_GROUP_COLUMNS,
    rows: groups,
    getRowId,
  });

  const rowActions = canWrite
    ? (group: ProductGroupSummaryEntity): RowActionItem[] => [
        { label: dict.common.edit, href: editHref(group) },
      ]
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={g.heading}
        description={g.intro}
        actions={
          canWrite ? (
            <Button asChild className="max-md:h-11">
              <Link href="/product-groups/new">
                <PlusIcon aria-hidden="true" />
                {g.add}
              </Link>
            </Button>
          ) : null
        }
      />
      {canWrite ? null : <Callout variant="strip">{g.viewOnly}</Callout>}

      <DataRegistry
        registry={registry}
        title={g.heading}
        showHeader={false}
        search={{
          value: searchParam,
          placeholder: g.searchPlaceholder,
          label: g.searchAria,
        }}
        columnsMenu={false}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        summary={
          total === undefined ? null : (
            <>
              {g.summaryFound}{" "}
              <SummaryValue>{countLabel(total, g.itemForms)}</SummaryValue>
            </>
          )
        }
        itemForms={g.itemForms}
        getRowLabel={(group) => group.name}
        getRowHref={editHref}
        rowActions={rowActions}
        renderCard={renderCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={g.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={g.empty}
        searchQuery={search}
        pagination={{ page, totalPages, pageSize }}
      />
    </div>
  );
}

/** One group below md (ProductGroupsProposal ГТ2). */
function renderCard(
  group: ProductGroupSummaryEntity,
  parts: RegistryCardParts,
) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {parts.href ? (
          <Link
            href={parts.href}
            className="rounded-xs font-medium break-words text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {group.name}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{group.name}</span>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={
              group.positionCount === 0
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {group.positionCount === 0
              ? g.noPositions
              : g.positionsCount(group.positionCount)}
          </span>
          <ProductGroupAxes group={group} />
          <ProductGroupStatusBadge isActive={group.isActive} />
        </div>
      </div>
      {parts.actions}
    </div>
  );
}
