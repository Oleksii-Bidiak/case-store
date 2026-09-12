"use client";

import { Loader2, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  AdminReviewControllerListStatus,
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerApprove,
  useAdminReviewControllerList,
  useAdminReviewControllerReject,
} from "@/entities/review";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import { useReviewBulkModeration } from "@/features/review-bulk-moderation";
import { useRowSelection } from "@/shared/lib/use-row-selection";
import { formatDate } from "@/shared/lib";
import {
  BulkActionsBar,
  Button,
  Checkbox,
  LiveAnnouncer,
  Table,
  TableBody,
  TableCell,
  TableFilters,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSearch,
  TableSelectCell,
  TableSelectHead,
  TableToolbar,
  pageSizeFrom,
  type TableFilterDef,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminReviewTableSkeleton } from "./admin-review-table-skeleton";

const COMMENT_MAX = 80;

/** Non-interactive star row for a single review's rating (1–5). */
function ReviewStars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex"
      role="img"
      aria-label={dict.reviews.ratingAria(rating)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= rating
              ? "size-3.5 text-amber-400"
              : "size-3.5 text-muted-foreground/30"
          }
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** Truncate a comment to a fixed length for the table cell. */
function truncate(value: string | null | undefined): string {
  if (!value) return dict.reviews.noComment;
  return value.length > COMMENT_MAX ? `${value.slice(0, COMMENT_MAX)}…` : value;
}

/**
 * AdminReviewTable — moderation queue for product reviews. The status filter
 * (`?status=pending|approved`, default `pending`), the search (`?search=`), the
 * page (`?page=`) and the page size (`?limit=`) live in the URL. Pending rows
 * expose Approve / Reject actions; approved rows are read-only. Mutations
 * invalidate the list so the queue refreshes in place.
 *
 * ── TASK-423: the queue had no search at all ────────────────────────────────
 * Triaging a backlog meant paging through it, and "what did this customer write
 * about that product?" was a question this screen could not answer — the
 * operator had to go to the product page and read the storefront. The box is the
 * shared one, and it searches what the queue shows: the review text, the author's
 * email and the product name.
 *
 * The status control's "no filter" option is «На розгляді» rather than a third
 * «Усі» state, because there is no such state to offer: the API treats an absent
 * `status` as `pending`. An «Усі» that silently returned the pending queue would
 * be a lie the operator could not see through.
 *
 * `LiveAnnouncer` MUST wrap the queue rather than sit inside it — the same split
 * `AdminCategoryTree` and `MessageInbox` make, for the same reason.
 * `useRowSelection` and `useReviewBulkModeration` both call `useAnnouncer()`,
 * and a hook called in the very component that renders the provider reads the
 * context from ABOVE it, which is the default no-op. Every selection and
 * bulk-moderation announcement would be silently dropped, and nothing on screen
 * would look wrong.
 */
export function AdminReviewTable() {
  return (
    <LiveAnnouncer>
      <AdminReviewTableView />
    </LiveAnnouncer>
  );
}

function AdminReviewTableView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const statusParam =
    searchParams.get("status") === AdminReviewControllerListStatus.approved
      ? AdminReviewControllerListStatus.approved
      : AdminReviewControllerListStatus.pending;
  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminReviewControllerList({
      status: statusParam,
      search: searchParam || undefined,
      page,
      limit: pageSize,
    });

  const approve = useAdminReviewControllerApprove();
  const reject = useAdminReviewControllerReject();

  const reviews = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const isPending = statusParam === AdminReviewControllerListStatus.pending;

  const invalidateList = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminReviewControllerListQueryKey(),
    });
    // TASK-248: approving/rejecting changes the pending-reviews counter, so
    // refresh the needs-action widget + sidebar badge too.
    void queryClient.invalidateQueries({
      queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
    });
  };

  const handleApprove = (id: string) => {
    approve.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.reviews.approveSuccess);
        },
        onError: () => toast.error(dict.reviews.actionError),
      },
    );
  };

  const handleReject = (id: string) => {
    reject.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.reviews.rejectSuccess);
        },
        onError: () => toast.error(dict.reviews.actionError),
      },
    );
  };

  const filters: TableFilterDef[] = [
    {
      param: "status",
      label: dict.reviews.filterStatusAria,
      // The URL-absent shape IS the pending queue — see the component header.
      allLabel: dict.reviews.filterPending,
      options: [
        {
          value: AdminReviewControllerListStatus.approved,
          label: dict.reviews.filterApproved,
        },
      ],
      // A link someone shared may spell the default out (`?status=pending`).
      // The rows are the same either way, so the chip must read as the filter it
      // is rather than as the raw enum value.
      resolveLabel: (value) =>
        value === AdminReviewControllerListStatus.pending
          ? dict.reviews.filterPending
          : value,
      className: "w-48",
    },
  ];

  // Selection is offered only on the PENDING queue, matching the per-row
  // buttons: approved rows are read-only here, and a checkbox column with
  // nothing to apply to it is worse than no column.
  const selectableIds = isPending ? reviews.map((review) => review.id) : [];
  const authorOf = (email: string) => email.split("@")[0];
  const reviewById = new Map(reviews.map((review) => [review.id, review]));

  const selection = useRowSelection({
    rowIds: selectableIds,
    getLabel: (id) => {
      const review = reviewById.get(id);
      return review
        ? dict.reviews.rowAria(review.productName, authorOf(review.userEmail))
        : id;
    },
    messages: {
      selected: dict.common.table.announceSelected,
      deselected: dict.common.table.announceDeselected,
      selectedAll: dict.common.table.announceSelectedAll,
      cleared: dict.common.table.announceCleared,
    },
  });

  const bulk = useReviewBulkModeration({
    onSuccess: () => {
      selection.clear();
      invalidateList();
    },
  });

  const selectedIds = [...selection.selectedIds];

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <TableSearch
            value={searchParam}
            placeholder={dict.reviews.searchPlaceholder}
            label={dict.reviews.searchAria}
          />
        }
        filters={
          <TableFilters
            filters={filters}
            values={{ status: searchParams.get("status") ?? "" }}
          />
        }
        selectAll={
          selectableIds.length > 0 ? (
            <Checkbox
              checked={selection.headerChecked}
              onCheckedChange={selection.toggleAll}
              disabled={bulk.isPending}
              aria-label={dict.common.table.selectAll}
            />
          ) : null
        }
      />

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        isPending={bulk.isPending}
        onClear={selection.clear}
        actions={[
          {
            label: dict.reviews.bulk.approve(selection.selectedCount),
            onClick: () => bulk.moderate(selectedIds, "approve"),
          },
          {
            label: dict.reviews.bulk.reject(selection.selectedCount),
            variant: "destructive",
            onClick: () => bulk.moderate(selectedIds, "reject"),
          },
        ]}
      />

      {isLoading ? (
        <AdminReviewTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.reviews.loadError}
        </p>
      ) : reviews.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.reviews.emptyMatch(searchParam)
            : dict.reviews.emptyQueue}
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
          <Table layout="card">
            <TableHeader>
              <TableRow>
                {isPending && (
                  <TableSelectHead
                    checked={selection.headerChecked}
                    onCheckedChange={selection.toggleAll}
                    disabled={bulk.isPending}
                    label={dict.common.table.selectAll}
                  />
                )}
                <TableHead>{dict.reviews.colProduct}</TableHead>
                <TableHead>{dict.reviews.colAuthor}</TableHead>
                <TableHead>{dict.reviews.colRating}</TableHead>
                <TableHead>{dict.reviews.colComment}</TableHead>
                <TableHead>{dict.reviews.colDate}</TableHead>
                {isPending && (
                  <TableHead className="text-right">
                    {dict.common.actions}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review) => {
                const approving =
                  approve.isPending && approve.variables?.id === review.id;
                const rejecting =
                  reject.isPending && reject.variables?.id === review.id;
                const busy = approving || rejecting;
                return (
                  <TableRow
                    key={review.id}
                    rowLabel={dict.reviews.rowAria(
                      review.productName,
                      review.userEmail.split("@")[0],
                    )}
                    data-state={
                      selection.isSelected(review.id) ? "selected" : undefined
                    }
                  >
                    {isPending && (
                      <TableSelectCell
                        checked={selection.isSelected(review.id)}
                        onSelect={({ shiftKey }) =>
                          shiftKey
                            ? selection.extendTo(review.id)
                            : selection.toggle(review.id)
                        }
                        disabled={bulk.isPending || busy}
                        label={dict.reviews.bulk.selectRow(
                          review.productName,
                          review.userEmail.split("@")[0],
                        )}
                      />
                    )}
                    <TableCell
                      label={dict.reviews.colProduct}
                      className="font-medium"
                    >
                      {review.productName}
                    </TableCell>
                    <TableCell
                      label={dict.reviews.colAuthor}
                      className="text-sm text-muted-foreground"
                    >
                      {review.userEmail.split("@")[0]}
                    </TableCell>
                    <TableCell label={dict.reviews.colRating}>
                      <ReviewStars rating={review.rating} />
                    </TableCell>
                    <TableCell
                      label={dict.reviews.colComment}
                      className="max-w-xs text-sm text-muted-foreground max-md:max-w-none"
                    >
                      {truncate(review.comment)}
                    </TableCell>
                    <TableCell
                      label={dict.reviews.colDate}
                      className="text-sm text-muted-foreground"
                    >
                      {formatDate(review.createdAt)}
                    </TableCell>
                    {isPending && (
                      <TableCell
                        label={dict.common.actions}
                        className="text-right max-md:text-left"
                      >
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleApprove(review.id)}
                          >
                            {approving && (
                              <Loader2 className="size-3.5 animate-spin" />
                            )}
                            {dict.reviews.approve}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleReject(review.id)}
                          >
                            {rejecting && (
                              <Loader2 className="size-3.5 animate-spin" />
                            )}
                            {dict.reviews.reject}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && reviews.length > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
