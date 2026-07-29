"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { useTableSort } from "@/shared/lib/use-table-sort";
import {
  AdminNewsletterControllerFindAllStatus,
  adminNewsletterControllerExport,
  useAdminNewsletterControllerFindAll,
} from "@/entities/newsletter";
import {
  Badge,
  Button,
  Input,
  LiveAnnouncer,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { downloadCsv } from "../model/download-csv";
import { AdminSubscriberTableSkeleton } from "./AdminSubscriberTableSkeleton";

const PAGE_SIZE = 20;
const ALL_OPTION = "__all__";
const SEARCH_DEBOUNCE_MS = 300;
const EXPORT_FILENAME = "newsletter-subscribers.csv";

const dateFormatter = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" });

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

  const [searchInput, setSearchInput] = useState(searchParam);
  const [isExporting, setIsExporting] = useState(false);

  const updateParams = useUrlParams();

  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const debouncedSearch = useDebouncedCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed === searchParam) return;
    updateParams({ search: trimmed || undefined, page: undefined });
  }, SEARCH_DEBOUNCE_MS);

  const statusFilter = statusParam
    ? (statusParam as SubscriberStatus)
    : undefined;

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminNewsletterControllerFindAll({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
      status: statusFilter,
      sortBy,
      sortOrder,
    });

  const subscribers = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const handleStatusChange = (value: string) => {
    updateParams({
      status: value === ALL_OPTION ? undefined : value,
      page: undefined,
    });
  };

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
            <Input
              type="search"
              placeholder={dict.subscribers.searchPlaceholder}
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                debouncedSearch(event.target.value);
              }}
              className="max-w-xs"
              aria-label={dict.subscribers.searchAria}
            />
          }
          filters={
            <Select
              value={statusParam || ALL_OPTION}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger
                className="w-48"
                aria-label={dict.subscribers.filterStatusAria}
              >
                <SelectValue placeholder={dict.subscribers.allStatuses} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_OPTION}>
                  {dict.subscribers.allStatuses}
                </SelectItem>
                <SelectItem
                  value={AdminNewsletterControllerFindAllStatus.SUBSCRIBED}
                >
                  {dict.subscribers.statusSubscribed}
                </SelectItem>
                <SelectItem
                  value={AdminNewsletterControllerFindAllStatus.UNSUBSCRIBED}
                >
                  {dict.subscribers.statusUnsubscribed}
                </SelectItem>
              </SelectContent>
            </Select>
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
            {dict.subscribers.empty}
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
                      {dateFormatter.format(new Date(subscriber.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && !isError && subscribers.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {dict.common.pageOf(page, totalPages)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() =>
                  updateParams({
                    page: page - 1 <= 1 ? undefined : String(page - 1),
                  })
                }
              >
                {dict.common.previous}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                {dict.common.next}
              </Button>
            </div>
          </div>
        )}
      </div>
    </LiveAnnouncer>
  );
}
