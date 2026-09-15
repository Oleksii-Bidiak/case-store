"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { formatDateTime } from "@/shared/lib";
import {
  ListStaffRole,
  holdsEverythingByLevel,
  levelBadgeVariant,
  levelLabel,
  staffDisplayName,
  useListStaff,
  type StaffUserEntity,
} from "@/entities/staff";
import { CreateStaffButton } from "@/features/staff-create";
import {
  Badge,
  Button,
  LiveAnnouncer,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableFilters,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSearch,
  TableToolbar,
  pageSizeFrom,
  type TableFilterDef,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { StaffTableSkeleton } from "./StaffTableSkeleton";

const d = dict.staff;

/**
 * The «Персонал» register: every service account, and nothing else
 * (TASK-480, plan 181 decision 3).
 *
 * Built on the shared table kit (`TableToolbar`, `TableSearch`, `TableFilters`,
 * `TablePagination`, `useUrlParams`, `useTableSort`, `pageSizeFrom`) exactly as
 * `AdminUserTable` is, so search, filters, page and page size live in the URL and
 * behave the way they do on the other seventeen admin lists.
 *
 * ## No checkbox column, and the reason is stronger here than on `/users`
 *
 * `AdminUserTable` explains why users have no bulk select: every bulk action one
 * could offer is the action that can lock the owner out of their own shop. On
 * this screen that is not a hypothetical — this list is ONLY the accounts that
 * can enter the panel at all. A multi-select deactivate here, mis-clicked once,
 * is the shop with nobody able to sign in; and the server's protection is
 * per-target (`assertMayManage` reads one row at a time), so a bulk call would be
 * a loop that half-succeeds and leaves the operator unsure what happened.
 *
 * ## Why there is no «шаблон» column
 *
 * Plan 181 sketched one, and the data cannot honestly carry it. Applying a
 * template COPIES its keys and stores no link back (invariant 5) — deliberately,
 * so that editing a template cannot move a working person's access — so "which
 * template is this person on" has no answer once anybody ticks one extra box.
 * What the row shows instead is the number the owner actually scans for: how many
 * permissions this person holds. An exact set match IS surfaced, on the card,
 * where the keys are loaded anyway (`matchingTemplate`).
 *
 * `lastSeenAt` is named «Останній сеанс», not «Останній вхід»: the underlying
 * value is the newest refresh token, which moves on rotation as well as at
 * sign-in. See the API entity's note.
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

  const { data, isLoading, isFetching, isError, refetch } = useListStaff({
    page,
    limit: pageSize,
    search: searchParam || undefined,
    role: roleParam
      ? (roleParam as (typeof ListStaffRole)[keyof typeof ListStaffRole])
      : undefined,
    isActive: isActiveParam ? isActiveParam === "true" : undefined,
    sortBy,
    sortOrder,
  });

  const staff = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const isFiltered = Boolean(searchParam || roleParam || isActiveParam);

  const filters: TableFilterDef[] = [
    {
      param: "role",
      label: d.filterLevelAria,
      allLabel: d.allLevels,
      options: [
        // The owner is an ADMIN who also holds the flag, so «Адміністратори»
        // includes them — which is what an operator filtering for "who has full
        // access" means, and matches the panel above the table.
        { value: ListStaffRole.ADMIN, label: d.levelAdmin },
        { value: ListStaffRole.MANAGER, label: d.levelManager },
      ],
    },
    {
      param: "isActive",
      label: d.filterStatusAria,
      allLabel: d.allStatuses,
      options: [
        { value: "true", label: dict.common.active },
        { value: "false", label: dict.common.inactive },
      ],
    },
  ];

  return (
    <LiveAnnouncer>
      <div className="flex flex-col gap-4">
        <TableToolbar
          className="mb-0"
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
          search={
            <TableSearch
              value={searchParam}
              placeholder={d.searchPlaceholder}
              label={d.searchAria}
            />
          }
          filters={
            <TableFilters
              filters={filters}
              values={{ role: roleParam, isActive: isActiveParam }}
            />
          }
        />

        {isLoading ? (
          <StaffTableSkeleton />
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {d.loadError}
          </p>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
            <p>{isFiltered ? d.empty : d.emptyAll}</p>
            <CreateStaffButton size="sm" />
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-border shadow-card">
            {isFetching && !isLoading && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
              >
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableColumnHeader
                    field="email"
                    label={d.colPerson}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <TableHead>{d.colLevel}</TableHead>
                  <TableHead>{d.colPermissions}</TableHead>
                  <TableHead hideOnMobile>{d.colLastSeen}</TableHead>
                  <TableHead>{d.colStatus}</TableHead>
                  <TableHead className="text-right">
                    {dict.common.actions}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((person) => (
                  <StaffRow key={person.id} person={person} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && !isError && staff.length > 0 && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
          />
        )}
      </div>
    </LiveAnnouncer>
  );
}

function StaffRow({ person }: { person: StaffUserEntity }) {
  const name = staffDisplayName(person);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="flex flex-col gap-0.5">
          <span>{name}</span>
          {name !== person.email && (
            <span className="text-xs text-muted-foreground">
              {person.email}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={levelBadgeVariant(person.level)}>
          {levelLabel(person.level)}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {/* An admin's `permissionCount` is 0 and always will be — they pass every
            guard by level. Printing «0» in this column would be the list-shaped
            version of the empty grid the card refuses to show. */}
        {holdsEverythingByLevel(person.level)
          ? d.permissionsFullAccess
          : person.permissionCount}
      </TableCell>
      <TableCell hideOnMobile className="text-muted-foreground">
        {person.lastSeenAt
          ? formatDateTime(person.lastSeenAt)
          : d.lastSeenNever}
      </TableCell>
      <TableCell>
        <Badge variant={person.isActive ? "default" : "destructive"}>
          {person.isActive ? dict.common.active : dict.common.inactive}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button asChild variant="outline" size="sm">
          <Link href={`/staff/${person.id}`}>{dict.common.view}</Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
