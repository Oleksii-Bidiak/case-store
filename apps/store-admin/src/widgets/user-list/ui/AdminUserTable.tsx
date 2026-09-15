"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { formatDate } from "@/shared/lib";
import { useUserControllerFindAll, type UserEntity } from "@/entities/user";
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
import { AdminUserTableSkeleton } from "./AdminUserTableSkeleton";

function fullName(user: UserEntity): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

/**
 * Paginated, searchable, filterable CUSTOMER table for the admin panel.
 *
 * Search, status, page and page size all live in the URL (`?search=`,
 * `?isActive=`, `?page=`, `?limit=`) so the view is shareable and refresh-safe.
 *
 * TASK-423 replaced this table's own copies of the controls with the shared ones
 * (`TableSearch`, `TableFilters`, `TablePagination`). The behaviour here barely
 * changed — this was one of the five tables that already debounced to the URL —
 * which is the point: the other twelve now behave like this one instead of like
 * each other.
 *
 * The controls sit in the shared `TableToolbar` (TASK-356) so this table gains
 * the manual refresh every admin list now has. No `staleTime` override here on
 * purpose: the account list is not a queue two people work at once, so the
 * panel-wide five minutes plus the explicit button is the right trade.
 *
 * ## Shoppers only, since TASK-480
 *
 * `GET /api/users` has scoped itself to `role: CUSTOMER` since TASK-476, so the
 * three things this table grew for staff had become misleading rather than
 * merely redundant: the ROLE filter could offer «Менеджер» and return nobody on
 * a shop with twenty of them; the role COLUMN could only ever read «Клієнт»; and
 * the empty state offered «Створити співробітника» from a list the new account
 * would never appear in. All three moved to `/staff`, where the register they
 * describe actually lives.
 *
 * Deliberately no checkbox column. Every bulk action one could offer on accounts
 * — deactivate, delete, change role — is exactly the action that can lock the
 * owner out of their own store, and the API guards those one id at a time. A
 * multi-select would invite the one mistake there is no undo for. (`StaffTable`
 * repeats the omission for a sharper version of the same reason.)
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

  const { data, isLoading, isFetching, isError, refetch } =
    useUserControllerFindAll({
      page,
      limit: pageSize,
      search: searchParam || undefined,
      isActive: isActiveParam ? isActiveParam === "true" : undefined,
      sortBy,
      sortOrder,
    });

  const users = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // TASK-423: the same filter idiom every admin table uses. Declaring them as
  // DATA rather than markup is what makes the chips, the clear-all and the page
  // reset identical here and on eleven other screens.
  const filters: TableFilterDef[] = [
    {
      param: "isActive",
      label: dict.users.filterStatusAria,
      allLabel: dict.users.allStatuses,
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
              placeholder={dict.users.searchPlaceholder}
              label={dict.users.searchAria}
            />
          }
          filters={
            <TableFilters
              filters={filters}
              values={{ isActive: isActiveParam }}
            />
          }
        />

        {isLoading ? (
          <AdminUserTableSkeleton />
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {dict.users.loadError}
          </p>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
            <p>{dict.users.empty}</p>
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
                  <TableHead className="w-12" />
                  <SortableColumnHeader
                    field="email"
                    label={dict.users.colEmail}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <TableHead hideOnMobile>{dict.users.colName}</TableHead>
                  <TableHead>{dict.users.colStatus}</TableHead>
                  <SortableColumnHeader
                    field="createdAt"
                    label={dict.users.colJoined}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                    hideOnMobile
                  />
                  <TableHead className="text-right">
                    {dict.common.actions}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase text-muted-foreground">
                        {user.email.charAt(0)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell hideOnMobile>{fullName(user)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={user.isActive ? "default" : "destructive"}
                      >
                        {user.isActive
                          ? dict.common.active
                          : dict.common.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell hideOnMobile className="text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/users/${user.id}`}>
                          {dict.common.view}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && !isError && users.length > 0 && (
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
