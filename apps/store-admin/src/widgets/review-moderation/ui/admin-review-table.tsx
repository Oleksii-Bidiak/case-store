"use client";

import { Loader2, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AdminReviewControllerListStatus,
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerApprove,
  useAdminReviewControllerList,
  useAdminReviewControllerReject,
} from "@/entities/review";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import { useReviewBulkModeration } from "@/features/review-bulk-moderation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useRowSelection } from "@/shared/lib/use-row-selection";
import {
  BulkActionsBar,
  Button,
  Checkbox,
  LiveAnnouncer,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectCell,
  TableSelectHead,
  TableToolbar,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminReviewTableSkeleton } from "./admin-review-table-skeleton";

const PAGE_SIZE = 20;
const COMMENT_MAX = 80;

const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  dateStyle: "medium",
});

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
 * (`?status=pending|approved`, default `pending`) and page (`?page=`) live in
 * the URL. Pending rows expose Approve / Reject actions; approved rows are
 * read-only. Mutations invalidate the list so the queue refreshes in place.
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
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const updateParams = useUrlParams();

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminReviewControllerList({
      status: statusParam,
      page,
      limit: PAGE_SIZE,
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

  const handleStatusChange = (value: string) => {
    updateParams({ status: value, page: undefined });
  };

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
        filters={
          <Select value={statusParam} onValueChange={handleStatusChange}>
            <SelectTrigger
              className="w-48"
              aria-label={dict.reviews.filterStatusAria}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AdminReviewControllerListStatus.pending}>
                {dict.reviews.filterPending}
              </SelectItem>
              <SelectItem value={AdminReviewControllerListStatus.approved}>
                {dict.reviews.filterApproved}
              </SelectItem>
            </SelectContent>
          </Select>
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
          {dict.reviews.emptyQueue}
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
                      {dateFormatter.format(new Date(review.createdAt))}
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
  );
}
