"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "@/shared/ui/toast";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { formatDate } from "@/shared/lib";
import {
  AdminNewsletterControllerFindAllStatus,
  adminNewsletterControllerExport,
  useAdminNewsletterControllerFindAll,
} from "@/entities/newsletter";
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
import { downloadCsv } from "../model/download-csv";
import { AdminSubscriberTableSkeleton } from "./AdminSubscriberTableSkeleton";

const EXPORT_FILENAME = "newsletter-subscribers.csv";

type SubscriberStatus =
  (typeof AdminNewsletterControllerFindAllStatus)[keyof typeof AdminNewsletterControllerFindAllStatus];

/**
 * Paginated, searchable, filterable newsletter-subscriber table with a CSV
 * export. Search, status, page and sort state all live in the URL (`?search=`,
 * `?status=`, `?page=`, `?sortBy=&sortOrder=`) so the view is shareable and
 * refresh-safe. The search input is debounced before it touches the URL. The
 * export button pulls the currently-filtered set as CSV and triggers a browser
 * download.
 *
 * The sort is server-side (TASK-356) and covers exactly the three columns
 * `NEWSLETTER_SORT_FIELDS` allows. `source` has a header but no sort: it is null
 * for most rows, so ordering by it yields one meaningful block and a long tail
 * of blanks. The export intentionally carries no `sortBy` — a spreadsheet sorts
 * a CSV better than we can.
 */
export function AdminSubscriberTable() {
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const [isExporting, setIsExporting] = useState(false);

  const updateParams = useUrlParams();

  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const statusFilter = statusParam
    ? (statusParam as SubscriberStatus)
    : undefined;

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminNewsletterControllerFindAll({
      page,
      limit: pageSize,
      search: searchParam || undefined,
      status: statusFilter,
      sortBy,
      sortOrder,
    });

  const subscribers = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const filters: TableFilterDef[] = [
    {
      param: "status",
      label: dict.subscribers.filterStatusAria,
      allLabel: dict.subscribers.allStatuses,
      options: [
        {
          value: AdminNewsletterControllerFindAllStatus.SUBSCRIBED,
          label: dict.subscribers.statusSubscribed,
        },
        {
          value: AdminNewsletterControllerFindAllStatus.UNSUBSCRIBED,
          label: dict.subscribers.statusUnsubscribed,
        },
      ],
    },
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const csv = await adminNewsletterControllerExport({
        search: searchParam || undefined,
        status: statusFilter,
      });
      downloadCsv(csv, EXPORT_FILENAME);
    } catch {
      toast.error(dict.subscribers.exportError);
    } finally {
      setIsExporting(false);
    }
  };

  const statusLabel = (status: SubscriberStatus) =>
    status === AdminNewsletterControllerFindAllStatus.SUBSCRIBED
      ? dict.subscribers.statusSubscribed
      : dict.subscribers.statusUnsubscribed;

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
              placeholder={dict.subscribers.searchPlaceholder}
              label={dict.subscribers.searchAria}
            />
          }
          filters={
            <TableFilters filters={filters} values={{ status: statusParam }} />
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              disabled={isExporting}
              onClick={handleExport}
            >
              {isExporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {isExporting
                ? dict.subscribers.exporting
                : dict.subscribers.exportCsv}
            </Button>
          }
        />

        {isLoading ? (
          <AdminSubscriberTableSkeleton />
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {dict.subscribers.loadError}
          </p>
        ) : subscribers.length === 0 ? (
          <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
            {/* "Nobody has subscribed yet" and "your filters matched nothing"
                are different answers (TASK-423). */}
            {searchParam || statusParam
              ? dict.common.table.emptyFiltered
              : dict.subscribers.empty}
          </div>
        ) : (
          <div className="relative rounded-lg border border-border shadow-card overflow-hidden">
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
                    label={dict.subscribers.colEmail}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <SortableColumnHeader
                    field="status"
                    label={dict.subscribers.colStatus}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <TableHead hideOnMobile>
                    {dict.subscribers.colSource}
                  </TableHead>
                  <SortableColumnHeader
                    field="createdAt"
                    label={dict.subscribers.colDate}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((subscriber) => (
                  <TableRow key={subscriber.id}>
                    <TableCell className="font-medium">
                      {subscriber.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          subscriber.status ===
                          AdminNewsletterControllerFindAllStatus.SUBSCRIBED
                            ? "default"
                            : "secondary"
                        }
                      >
                        {statusLabel(subscriber.status)}
                      </Badge>
                    </TableCell>
                    <TableCell hideOnMobile className="text-muted-foreground">
                      {subscriber.source || dict.subscribers.sourceEmpty}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(subscriber.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && !isError && subscribers.length > 0 && (
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
