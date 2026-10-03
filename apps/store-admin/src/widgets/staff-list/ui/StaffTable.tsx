"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { countLabel, formatDateTime } from "@/shared/lib";
import {
  ListStaffRole,
  StaffLevelBadge,
  StaffStatusBadge,
  holdsEverythingByLevel,
  staffDisplayName,
  useListStaff,
  type StaffUserEntity,
} from "@/entities/staff";
import { CreateStaffButton } from "@/features/staff-create";
import {
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type FilterChip,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { StaffFilterSheet, type StaffFilters } from "./StaffFilterSheet";

const d = dict.staff;

type ListRole = (typeof ListStaffRole)[keyof typeof ListStaffRole];

function permissionsText(person: StaffUserEntity): string {
  // An admin's `permissionCount` is 0 and always will be — they pass every
  // guard by level. Printing «0 прав» here would be the list-shaped version of
  // the empty grid the card refuses to show.
  return holdsEverythingByLevel(person.level)
    ? d.permissionsFullAccess
    : d.permissionsColumn(person.permissionCount);
}

function lastSeenText(person: StaffUserEntity): string {
  return person.lastSeenAt
    ? formatDateTime(person.lastSeenAt)
    : d.lastSeenNever;
}

/**
 * Columns of the register (StaffProposal С1, С8). Sortable only where the API
 * sorts: `GET /api/admin/staff` accepts `sortBy=createdAt|email`, so the person
 * column (by address) is the one sort button — level, rights and last sign-in
 * are plain headers until the API sorts by them.
 */
const COLUMNS: readonly RegistryColumn<StaffUserEntity>[] = [
  {
    id: "person",
    label: d.colPerson,
    locked: true,
    rowLink: true,
    sortField: "email",
    defaultWidth: 280,
    minWidth: 160,
    cell: (person) => {
      const name = staffDisplayName(person);
      return (
        <span className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{name}</span>
          {name !== person.email && (
            <span className="text-xs text-muted-foreground">
              {person.email}
            </span>
          )}
        </span>
      );
    },
  },
  {
    id: "level",
    label: d.colLevel,
    defaultWidth: 160,
    cell: (person) => <StaffLevelBadge level={person.level} />,
  },
  {
    id: "permissions",
    label: d.colPermissions,
    defaultWidth: 220,
    cell: (person) => (
      <span className="text-foreground">{permissionsText(person)}</span>
    ),
  },
  {
    id: "lastSeen",
    label: d.colLastSeen,
    defaultWidth: 220,
    cell: (person) => (
      <span className="text-muted-foreground tabular-nums">
        {lastSeenText(person)}
      </span>
    ),
  },
  {
    id: "status",
    label: d.colStatus,
    defaultWidth: 140,
    cell: (person) => <StaffStatusBadge isActive={person.isActive} />,
  },
];

const getRowId = (person: StaffUserEntity) => person.id;

function sortLabel(sortBy: string, sortOrder: "asc" | "desc"): string {
  if (sortBy === "email") {
    return sortOrder === "asc" ? d.sortEmailAsc : d.sortEmailDesc;
  }
  return sortOrder === "asc" ? d.sortCreatedAsc : d.sortCreatedDesc;
}

function statusLabel(isActive: string): string {
  return isActive === "true" ? d.filterActive : d.filterInactive;
}

/**
 * The «Співробітники» register: every service account, and nothing else
 * (TASK-480, plan 181 decision 3), on the shared registry (TASK-1043, wave 198,
 * StaffProposal С1/С2/С8). Search, filters, sort, page and page size live in
 * the URL exactly as before; «Фільтри» now holds the two selects that used to
 * crowd the toolbar, «Переглянути» became a row click plus «⋯ → Відкрити».
 *
 * ## No checkbox column, and the reason is stronger here than on `/users`
 *
 * Every bulk action one could offer is the action that can lock the owner out
 * of their own shop: this list is ONLY the accounts that can enter the panel.
 * A multi-select deactivate here, mis-clicked once, is the shop with nobody
 * able to sign in; and the server's protection is per-target (`assertMayManage`
 * reads one row at a time), so a bulk call would be a loop that half-succeeds.
 * So: no selection, no bulk bar — and no export, because the API has none for
 * staff (an API tail, not a decision).
 *
 * ## Why there is no «шаблон» line under the count
 *
 * The artboard prints «Оператор замовлень · змінено» under «8 прав». Applying
 * a template COPIES its keys and stores no link back (invariant 5) — so "which
 * template is this person on" has no answer the API can give. Until it records
 * the applied template (TASK-1051's API tail) the column says what is true: how
 * many rights this person holds. An exact set match IS surfaced, on the card.
 *
 * «Останній вхід» is the owner-approved name (Д-ж2); the value is the newest
 * live session (refresh token), which also moves on token rotation — close
 * enough for "is this person still using the panel", which is the question.
 */
export function StaffTable() {
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const roleParam = searchParams.get("role") ?? "";
  const isActiveParam = searchParams.get("isActive") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const updateParams = useUrlParams();
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const role = roleParam ? (roleParam as ListRole) : undefined;

  const { data, isLoading, isFetching, isError, refetch } = useListStaff({
    page,
    limit: pageSize,
    search: searchParam || undefined,
    role,
    isActive: isActiveParam ? isActiveParam === "true" : undefined,
    sortBy,
    sortOrder,
  });

  // «активних N» — the API's own count for the same search and level, read off
  // `meta.total` of a one-row request. Never derived from the page on screen.
  // Not asked when the status filter is applied: the answer would be "all" or
  // "none" of what is listed.
  const activeQuery = useListStaff(
    {
      page: 1,
      limit: 1,
      search: searchParam || undefined,
      role,
      isActive: true,
    },
    { query: { enabled: !isActiveParam } },
  );

  const staff = data?.data ?? [];
  const total = data?.meta?.total;
  const totalPages = data?.meta?.totalPages ?? 1;
  const activeTotal = isActiveParam ? undefined : activeQuery.data?.meta?.total;

  const registry = useDataRegistry({
    tableId: "staff",
    columns: COLUMNS,
    rows: staff,
    getRowId,
  });

  const applied: StaffFilters = { role: roleParam, isActive: isActiveParam };
  const chips: FilterChip[] = [];
  if (roleParam) {
    chips.push({
      key: "role",
      label: d.chipLevel(
        roleParam === ListStaffRole.ADMIN ? d.levelAdmin : d.levelManager,
      ),
      onRemove: () => updateParams({ role: undefined, page: undefined }),
    });
  }
  if (isActiveParam) {
    chips.push({
      key: "isActive",
      label: d.chipStatus(statusLabel(isActiveParam)),
      onRemove: () => updateParams({ isActive: undefined, page: undefined }),
    });
  }

  const isFilteredByControls = Boolean(roleParam || isActiveParam);

  return (
    <LiveAnnouncer>
      <DataRegistry
        registry={registry}
        title={d.heading}
        showHeader={false}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        filters={{
          count: chips.length,
          renderSheet: ({ open, onOpenChange }) => (
            <StaffFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={applied}
              onApply={(next) =>
                updateParams({
                  role: next.role || undefined,
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
          if (!isActiveParam) void activeQuery.refetch();
        }}
        isRefreshing={isFetching}
        chips={chips}
        onClearAllChips={() =>
          updateParams({
            role: undefined,
            isActive: undefined,
            page: undefined,
          })
        }
        summary={
          total === undefined ? null : (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
              {activeTotal !== undefined ? (
                <>
                  {" · "}
                  {d.summaryActive} <SummaryValue>{activeTotal}</SummaryValue>
                </>
              ) : null}
            </>
          )
        }
        sortLabel={sortLabel(sortBy, sortOrder)}
        itemForms={d.itemForms}
        getRowLabel={staffDisplayName}
        getRowHref={(person) => `/staff/${person.id}`}
        rowActions={(person) => [
          { label: d.rowOpen, href: `/staff/${person.id}` },
        ]}
        sort={{ sortBy, sortOrder, onSort }}
        renderCard={renderCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={
          isFilteredByControls ? (
            d.empty
          ) : (
            <span className="flex flex-col items-center gap-3">
              <span>{d.emptyAll}</span>
              <CreateStaffButton size="sm" />
            </span>
          )
        }
        searchQuery={searchParam || undefined}
        pagination={{ page, totalPages, pageSize }}
      />
    </LiveAnnouncer>
  );
}

/** One person below md (StaffProposal С2). */
function renderCard(person: StaffUserEntity, parts: RegistryCardParts) {
  const name = staffDisplayName(person);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        {parts.href ? (
          <Link
            href={parts.href}
            className="min-w-0 rounded-xs font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {name}
          </Link>
        ) : (
          <span className="min-w-0 font-medium text-foreground">{name}</span>
        )}
        <StaffStatusBadge isActive={person.isActive} />
      </div>
      {name !== person.email && (
        <span className="-mt-1 text-xs break-all text-muted-foreground">
          {person.email}
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <StaffLevelBadge level={person.level} />
        <span className="text-xs text-muted-foreground">
          {permissionsText(person)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {d.cardLastSeen(lastSeenText(person))}
        </span>
        {parts.actions}
      </div>
    </div>
  );
}
