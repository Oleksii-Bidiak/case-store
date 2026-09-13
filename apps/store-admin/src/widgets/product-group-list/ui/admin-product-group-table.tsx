"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useProductGroupControllerFindAll } from "@/entities/product-group";
import {
  Button,
  LiveAnnouncer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSearch,
  TableToolbar,
  pageSizeFrom,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminProductGroupTableSkeleton } from "./admin-product-group-table-skeleton";

/**
 * Product-group list for the admin panel (TASK-142). Each group shows its axes
 * and how many positions belong to it, with a link to the edit form.
 *
 * TASK-357 added server paging + name search (URL-parked as `?search=` /
 * `?page=`) and a refresh control. Note that `GET /api/product-groups` is
 * ALSO read by the product form's group picker, which passes no page/limit and
 * therefore still gets the complete list — paging is opt-in on the server for
 * exactly that reason, and this table is the only caller opting in.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
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

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const { data, isLoading, isFetching, isError, refetch } =
    useProductGroupControllerFindAll({
      page,
      limit: pageSize,
      search: searchParam || undefined,
    });

  const groups = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <TableSearch
            value={searchParam}
            placeholder={dict.productGroups.searchPlaceholder}
            label={dict.productGroups.searchAria}
          />
        }
      />

      {/* The exported skeleton, not a second hand-rolled one — the route's
          Suspense fallback already uses it, so the two states now match. */}
      {isLoading ? (
        <AdminProductGroupTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.productGroups.loadError}
        </p>
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.productGroups.emptyMatch(searchParam)
            : dict.productGroups.empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.productGroups.colName}</TableHead>
                <TableHead hideOnMobile>{dict.productGroups.colAxes}</TableHead>
                <TableHead hideOnMobile>
                  {dict.productGroups.colPositions}
                </TableHead>
                <TableHead>{dict.productGroups.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {group.axes.length > 0
                      ? group.axes.map((axis) => axis.name).join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell hideOnMobile>{group.positionCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {group.isActive ? dict.common.active : dict.common.inactive}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/product-groups/${group.id}/edit`}>
                        {dict.common.edit}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && groups.length > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
