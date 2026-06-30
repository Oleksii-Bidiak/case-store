"use client";

import { Loader2, Star } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AdminReviewControllerListStatus,
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerApprove,
  useAdminReviewControllerList,
  useAdminReviewControllerReject,
} from "@/entities/review";
import {
  Button,
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
 */
export function AdminReviewTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const statusParam =
    searchParams.get("status") === AdminReviewControllerListStatus.approved
      ? AdminReviewControllerListStatus.approved
      : AdminReviewControllerListStatus.pending;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const { data, isLoading, isFetching, isError } = useAdminReviewControllerList(
    {
      status: statusParam,
      page,
      limit: PAGE_SIZE,
    },
  );

  const approve = useAdminReviewControllerApprove();
  const reject = useAdminReviewControllerReject();

  const reviews = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const isPending = statusParam === AdminReviewControllerListStatus.pending;

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminReviewControllerListQueryKey(),
    });

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
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
      </div>

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
        <div className="relative rounded-md border border-border">
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
                  <TableRow key={review.id}>
                    <TableCell className="font-medium">
                      {review.productName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {review.userEmail.split("@")[0]}
                    </TableCell>
                    <TableCell>
                      <ReviewStars rating={review.rating} />
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">
                      {truncate(review.comment)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dateFormatter.format(new Date(review.createdAt))}
                    </TableCell>
                    {isPending && (
                      <TableCell className="text-right">
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
