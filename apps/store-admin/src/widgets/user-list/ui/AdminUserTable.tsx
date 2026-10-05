"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { countLabel, formatDate } from "@/shared/lib";
import {
  CustomerStatusBadge,
  customerDisplayName,
  customerInitial,
  customerPhone,
  useUserControllerFindAll,
  type UserEntity,
} from "@/entities/user";
import {
  Button,
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type FilterChip,
  type QuickView,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { UserFilterSheet, type UserFilters } from "./UserFilterSheet";

const d = dict.users;

/**
 * Width the default-visible columns may share at 1440: content area 1136 minus
 * the «⋯» column and the box border (no checkbox column — see the docblock).
 */
export const USER_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

function Avatar({ user }: { user: UserEntity }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
    >
      {customerInitial(user)}
    </span>
  );
}

/**
 * Columns of the list (UsersProposal К1, К8). Sortable only where the API sorts:
 * `GET /api/users` accepts `sortBy=createdAt|email`, so the customer column (by
 * address) and «Зареєстровано» are the sort buttons.
 *
 * «Замовлень · Сума покупок · Останнє замовлення» from the artboard are NOT
 * here: the list payload carries no purchase aggregates (they exist only on the
 * per-customer card, behind `customers:card`). An API tail, not a decision.
 */
export const USER_COLUMNS: readonly RegistryColumn<UserEntity>[] = [
  {
    id: "customer",
    label: d.colCustomer,
    locked: true,
    rowLink: true,
    sortField: "email",
    defaultWidth: 380,
    minWidth: 200,
    cell: (user) => {
      const name = customerDisplayName(user);
      return (
        <span className="flex items-center gap-3">
          <Avatar user={user} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">{name}</span>
            {name !== user.email && (
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            )}
          </span>
        </span>
      );
    },
  },
  {
    id: "phone",
    label: d.colPhone,
    defaultWidth: 200,
    cell: (user) => (
      <span className="text-foreground tabular-nums">
        {customerPhone(user.phone) ?? "—"}
      </span>
    ),
  },
  {
    id: "status",
    label: d.colStatus,
    defaultWidth: 160,
    cell: (user) => <CustomerStatusBadge isActive={user.isActive} />,
  },
  {
    id: "createdAt",
    label: d.colJoined,
    sortField: "createdAt",
    defaultWidth: 180,
    cell: (user) => (
      <span className="text-muted-foreground tabular-nums">
        {formatDate(user.createdAt)}
      </span>
    ),
  },
];

const getRowId = (user: UserEntity) => user.id;

const ALL_VIEW = "all";

function sortLabel(sortBy: string, sortOrder: "asc" | "desc"): string {
  if (sortBy === "email") {
    return sortOrder === "asc" ? d.sortEmailAsc : d.sortEmailDesc;
  }
  return sortOrder === "asc" ? d.sortCreatedAsc : d.sortCreatedDesc;
}

function statusLabel(isActive: string): string {
  return isActive === "true" ? d.viewActive : d.viewInactive;
}

/**
 * The «Клієнти» list on the shared registry (TASK-1043/1058, wave 198,
 * UsersProposal К1–К3, К8). Search, status, sort, page and page size live in
 * the URL exactly as before; the status select moved into «Фільтри» and onto the
 * quick views «Усі · Активні · Неактивні», «Переглянути» became a row click plus
 * «⋯ → Відкрити».
 *
 * ## Shoppers only, since TASK-480
 *
 * `GET /api/users` has scoped itself to `role: CUSTOMER` since TASK-476: no role
 * filter, no role column, no hiring CTA — those live on `/staff`.
 *
 * ## No checkbox column
 *
 * Every bulk action one could offer on accounts — deactivate, delete — is one
 * the API guards one id at a time, and a multi-select would invite the one
 * mistake there is no undo for. No export either: the API has none for
 * customers (an API tail).
 *
 * ## Counts
 *
 * The quick-view counters are the API's own `meta.total` for the same search —
 * one-row requests, never derived from the page on screen. «Неактивні» is the
 * difference of the two, which is exact: status is the only split.
 */
export function AdminUserTable() {
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const isActiveParam = searchParams.get("isActive") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const updateParams = useUrlParams();
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const search = searchParam || undefined;
  const { data, isLoading, isFetching, isError, refetch } =
    useUserControllerFindAll({
      page,
      limit: pageSize,
      search,
      isActive: isActiveParam ? isActiveParam === "true" : undefined,
      sortBy,
      sortOrder,
    });
  const allQuery = useUserControllerFindAll({ page: 1, limit: 1, search });
  const activeQuery = useUserControllerFindAll({
    page: 1,
    limit: 1,
    search,
    isActive: true,
  });

  const users = data?.data ?? [];
  const total = data?.meta?.total;
  const totalPages = data?.meta?.totalPages ?? 1;
  const allTotal = allQuery.data?.meta?.total;
  const activeTotal = activeQuery.data?.meta?.total;
  const inactiveTotal =
    allTotal !== undefined && activeTotal !== undefined
      ? Math.max(0, allTotal - activeTotal)
      : undefined;

  const registry = useDataRegistry({
    tableId: "users",
    columns: USER_COLUMNS,
    rows: users,
    getRowId,
  });

  const quickViews: QuickView[] = [
    { id: ALL_VIEW, label: d.viewAll, count: allTotal },
    { id: "true", label: d.viewActive, count: activeTotal },
    { id: "false", label: d.viewInactive, count: inactiveTotal },
  ];

  const clearStatus = () =>
    updateParams({ isActive: undefined, page: undefined });

  const applied: UserFilters = { isActive: isActiveParam };
  const chips: FilterChip[] = isActiveParam
    ? [
        {
          key: "isActive",
          label: d.chipStatus(statusLabel(isActiveParam)),
          onRemove: clearStatus,
        },
      ]
    : [];

  const emptyState = isActiveParam ? (
    <span className="flex flex-col items-center gap-3">
      <span className="flex flex-col gap-1">
        <span className="font-semibold text-foreground">
          {d.emptyStatusTitle(isActiveParam === "true")}
        </span>
        <span>{d.emptyStatusBody(statusLabel(isActiveParam))}</span>
      </span>
      <Button type="button" variant="outline" size="sm" onClick={clearStatus}>
        {d.emptyReset}
      </Button>
    </span>
  ) : (
    <span className="flex flex-col gap-1">
      <span className="font-semibold text-foreground">{d.emptyAllTitle}</span>
      <span>{d.emptyAllBody}</span>
    </span>
  );

  return (
    <LiveAnnouncer>
      <DataRegistry
        registry={registry}
        title={d.heading}
        showHeader={false}
        quickViews={{
          items: quickViews,
          activeId: isActiveParam || ALL_VIEW,
          onChange: (id) =>
            updateParams({
              isActive: id === ALL_VIEW ? undefined : id,
              page: undefined,
            }),
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        filters={{
          count: chips.length,
          renderSheet: ({ open, onOpenChange }) => (
            <UserFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={applied}
              onApply={(next) =>
                updateParams({
                  isActive: next.isActive || undefined,
                  page: undefined,
                })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => {
          void refetch();
          void allQuery.refetch();
          void activeQuery.refetch();
        }}
        isRefreshing={isFetching}
        chips={chips}
        onClearAllChips={clearStatus}
        summary={
          total === undefined ? null : (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          )
        }
        sortLabel={sortLabel(sortBy, sortOrder)}
        itemForms={d.itemForms}
        getRowLabel={customerDisplayName}
        getRowHref={(user) => `/users/${user.id}`}
        rowActions={(user) => [{ label: d.rowOpen, href: `/users/${user.id}` }]}
        sort={{ sortBy, sortOrder, onSort }}
        renderCard={renderCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={emptyState}
        searchQuery={search}
        pagination={{ page, totalPages, pageSize }}
      />
    </LiveAnnouncer>
  );
}

/** One customer below md (UsersProposal К2). */
function renderCard(user: UserEntity, parts: RegistryCardParts) {
  const name = customerDisplayName(user);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-3">
          <Avatar user={user} />
          <span className="flex min-w-0 flex-col gap-0.5">
            {parts.href ? (
              <Link
                href={parts.href}
                className="min-w-0 rounded-xs font-medium break-words text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {name}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{name}</span>
            )}
            <span className="text-sm text-muted-foreground tabular-nums">
              {customerPhone(user.phone) ?? "—"}
            </span>
          </span>
        </span>
        <CustomerStatusBadge isActive={user.isActive} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {d.customerSince(formatDate(user.createdAt))}
        </span>
        {parts.actions}
      </div>
    </div>
  );
}
