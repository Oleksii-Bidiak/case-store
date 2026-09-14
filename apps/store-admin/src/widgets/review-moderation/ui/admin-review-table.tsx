"use client";

import { Loader2, Star } from "lucide-react";
import Link from "next/link";
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
import { ReviewReplyAction } from "@/features/review-reply";
import { ReviewAuthorModerationAction } from "@/features/review-author-moderation";
import { useRowSelection } from "@/shared/lib/use-row-selection";
import { formatDate } from "@/shared/lib";
import {
  Badge,
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
 * The queue the URL asks for, defaulting to the one an absent param returns.
 *
 * Reads the generated enum instead of listing the values here: the filter is
 * built from the same source below, so a fourth verdict added by the API becomes
 * a tab that WORKS the moment someone adds its label, rather than one that
 * silently serves the pending queue under a rejected chip.
 */
function resolveStatus(raw: string | null): AdminReviewControllerListStatus {
  const known = Object.values(AdminReviewControllerListStatus);
  return known.includes(raw as AdminReviewControllerListStatus)
    ? (raw as AdminReviewControllerListStatus)
    : AdminReviewControllerListStatus.pending;
}

/**
 * AdminReviewTable — moderation queue for product reviews. The status filter
 * (`?status=pending|approved|rejected`, default `pending`), the search
 * (`?search=`), the page (`?page=`) and the page size (`?limit=`) live in the
 * URL. Mutations invalidate the list so the queue refreshes in place.
 *
 * ── TASK-446: three queues, and rejecting is no longer a delete ──────────────
 * `Review.isActive` is gone. The TEXT now carries a three-value `textStatus` and
 * the RATING carries its own `ratingVisible`, and the two are independent.
 * «Відхилити» used to call `DELETE /admin/reviews/:id`, which hard-deleted the
 * row — taking the rating out of the product's average and freeing the author's
 * `(userId, productId)` slot. It now calls `PATCH …/:id/reject`, which marks the
 * text REJECTED and leaves the rating counting; the author rewrites their own
 * text from the storefront rather than re-submitting a fresh review.
 *
 * That makes REJECTED a state a row KEEPS, so there are three queues where there
 * were two — and the per-row actions can no longer be hard-coded to `pending`.
 * Each tab offers what is actually useful on it: approve on `rejected` (a
 * moderator changing their mind — the case the hard delete made impossible),
 * reject on `approved`, both on `pending`. An action that is already the row's
 * state is not offered, because clicking it changes nothing the operator can
 * see and reads as a broken button.
 *
 * Row SELECTION stays on `pending` alone. Bulk is a triage tool for the queue
 * that accumulates; on the settled tabs the useful action is per-row and a
 * checkbox column whose bar offers the one verdict the tab already has would be
 * noise.
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

  // Three values now, so this reads the enum rather than testing for one of
  // them. An unrecognised `?status=` still falls back to `pending` — the queue
  // an absent param really returns — but «rejected» must NOT land there, or the
  // chip would say one queue while the rows came from another.
  const statusParam = resolveStatus(searchParams.get("status"));
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
  // What each tab is FOR, rather than one hard-coded queue. Approving an already
  // approved text, or re-rejecting a rejected one, is a button that changes
  // nothing visible — which reads as a broken button, not as a no-op.
  const canApprove = statusParam !== AdminReviewControllerListStatus.approved;
  const canReject = statusParam !== AdminReviewControllerListStatus.rejected;

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
        // TASK-446: a queue that could not exist while rejecting was a delete.
        {
          value: AdminReviewControllerListStatus.rejected,
          label: dict.reviews.filterRejected,
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
                <TableHead>{dict.reviews.colSku}</TableHead>
                <TableHead>{dict.reviews.colAuthor}</TableHead>
                <TableHead>{dict.reviews.colRating}</TableHead>
                <TableHead>{dict.reviews.colComment}</TableHead>
                <TableHead>{dict.reviews.colDate}</TableHead>
                {/* Always present since TASK-446: reply and author-moderation
                    live here on every tab, and the verdict buttons vary by tab
                    rather than by queue membership. */}
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
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
                    {/* TASK-430: the product is a LINK to its read-only card, and
                        the SKU rides next to it. Moderating «Чохол силіконовий»
                        used to mean guessing which of four colour variants the
                        complaint was about, then searching the catalogue by hand —
                        and the name is not even a key you can search by. */}
                    <TableCell
                      label={dict.reviews.colProduct}
                      className="font-medium"
                    >
                      <Link
                        href={`/products/${review.productId}`}
                        aria-label={dict.reviews.productLinkAria(
                          review.productName,
                        )}
                        className="hover:underline"
                      >
                        {review.productName}
                      </Link>
                    </TableCell>
                    <TableCell
                      label={dict.reviews.colSku}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {/* `Product.sku` is nullable — a position can exist before an
                          article number is assigned. Say so in words; an empty cell
                          reads as a rendering bug. */}
                      {review.productSku ?? dict.reviews.noSku}
                    </TableCell>
                    <TableCell
                      label={dict.reviews.colAuthor}
                      className="text-sm text-muted-foreground"
                    >
                      {review.userEmail.split("@")[0]}
                    </TableCell>
                    <TableCell label={dict.reviews.colRating}>
                      <div className="flex flex-col items-start gap-1">
                        <ReviewStars rating={review.rating} />
                        {/* TASK-446: `ratingVisible` folds a moderator's hide and
                            an unconfirmed email into one flag, and the row cannot
                            tell which. It reports the EFFECT, which is true either
                            way — without it a moderator reads a 1★ and assumes it
                            is dragging the average down when it may not count at
                            all. */}
                        {!review.ratingVisible && (
                          <Badge variant="secondary">
                            {dict.reviews.ratingNotCounted}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      label={dict.reviews.colComment}
                      className="max-w-xs text-sm text-muted-foreground max-md:max-w-none"
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span>{truncate(review.comment)}</span>
                        {/* The reply is an UPSERT — answering again replaces what
                            is published. A row that was already answered has to
                            say so here, or a second operator overwrites the first
                            without ever seeing there was one. */}
                        {review.reply && (
                          <Badge variant="secondary">
                            {dict.reviews.replyBadge}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      label={dict.reviews.colDate}
                      className="text-sm text-muted-foreground"
                    >
                      {formatDate(review.createdAt)}
                    </TableCell>
                    <TableCell
                      label={dict.common.actions}
                      className="text-right max-md:text-left"
                    >
                      <div className="flex flex-wrap justify-end gap-2 max-md:justify-start">
                        {canApprove && (
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
                        )}
                        {canReject && (
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
                        )}
                        {/* Both render nothing without their own permission —
                            `reviews:write` for the reply, `reviews:moderate` for
                            the author action. */}
                        <ReviewReplyAction review={review} />
                        <ReviewAuthorModerationAction
                          userId={review.userId}
                          author={authorOf(review.userEmail)}
                          ratingVisible={review.ratingVisible}
                        />
                      </div>
                    </TableCell>
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
