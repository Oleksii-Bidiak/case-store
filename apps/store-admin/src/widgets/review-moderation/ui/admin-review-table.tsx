"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheckIcon, CornerDownRightIcon, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  AdminReviewControllerListStatus,
  AdminReviewEntityTextStatus,
  ReviewAuthorVisibility,
  ReviewHiddenReason,
  ReviewStars,
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerApprove,
  useAdminReviewControllerList,
  useAdminReviewControllerReject,
  type AdminReviewEntity,
} from "@/entities/review";
import {
  getAdminDashboardControllerGetNeedsActionQueryKey,
  useAdminDashboardControllerGetNeedsAction,
} from "@/entities/dashboard";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { useReviewBulkModeration } from "@/features/review-bulk-moderation";
import { ReviewReplyDialog } from "@/features/review-reply";
import {
  ReviewAuthorModerationDialog,
  authorModerationMode,
} from "@/features/review-author-moderation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import { countLabel, formatDate } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  Badge,
  Button,
  Callout,
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type FilterChip,
  type QuickView,
  type RegistryCardParts,
  type RegistryColumn,
  type RowActionItem,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  REVIEW_VIEW_COUNT_QUERY,
  REVIEW_VIEW_ORDER,
  REVIEW_VIEW_PARAMS,
  abuseFacts,
  abuseSignalIndex,
  abuseSignalList,
  activeReviewView,
  readReviewUrl,
  type AbuseSignal,
  type ReviewViewId,
} from "../model/review-views";
import {
  ReviewFilterSheet,
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from "./review-filter-sheet";

const d = dict.reviews;

/**
 * How dialogs and labels name a reviewer: the email's local-part. The row
 * itself shows the full address (ReviewsProposal В1); the confirm copy keeps
 * the short name the artboard's В7 asks with («акаунта pending-reviewer1»).
 */
function authorOf(email: string): string {
  return email.split("@")[0];
}

const rowLabel = (review: AdminReviewEntity) =>
  d.rowAria(review.productName, authorOf(review.userEmail));
const getRowId = (review: AdminReviewEntity) => review.id;

/**
 * Why a row's author contribution is withdrawn, in words (TASK-1004) — read
 * from the server's `hiddenReason`, not inferred: each lever is lifted by a
 * different hand (a moderator's «повернути», an un-ban, or nobody).
 */
const HIDDEN_REASON_LABELS: Record<ReviewHiddenReason, string> = {
  [ReviewHiddenReason.MODERATOR]: d.hiddenByModerator,
  [ReviewHiddenReason.BAN]: d.hiddenByBan,
  [ReviewHiddenReason.DELETED]: d.hiddenByDeletion,
};

const TEXT_STATUS: Record<
  AdminReviewEntityTextStatus,
  { label: string; variant: "warning" | "success" | "secondary" }
> = {
  [AdminReviewEntityTextStatus.PENDING]: {
    label: d.statusPending,
    variant: "warning",
  },
  [AdminReviewEntityTextStatus.APPROVED]: {
    label: d.statusApproved,
    variant: "success",
  },
  [AdminReviewEntityTextStatus.REJECTED]: {
    label: d.statusRejected,
    variant: "secondary",
  },
};

/**
 * What each ROW offers. Approving an already approved text, or re-rejecting a
 * rejected one, is a button that changes nothing visible — which reads as a
 * broken button. A rating left without any text has no text to judge at all.
 */
const canApprove = (review: AdminReviewEntity) =>
  Boolean(review.comment) &&
  review.textStatus !== AdminReviewEntityTextStatus.APPROVED;
const canReject = (review: AdminReviewEntity) =>
  Boolean(review.comment) &&
  review.textStatus !== AdminReviewEntityTextStatus.REJECTED;

/* ── Cells ──────────────────────────────────────────────────────────────── */

/**
 * The status badge (§1.6 canon): a withdrawn row is «Приховано» with its
 * reason under it; otherwise the text verdict. A row that is not withdrawn but
 * whose rating does not count is held by the remaining gate, an unconfirmed
 * email, and says the effect — the one thing that is true there.
 */
function StatusCell({ review }: { review: AdminReviewEntity }) {
  if (review.hiddenReason) {
    return (
      <span className="flex flex-col items-start gap-1">
        <Badge variant="secondary">{d.statusHidden}</Badge>
        <span className="text-xs text-muted-foreground">
          {HIDDEN_REASON_LABELS[review.hiddenReason]}
        </span>
      </span>
    );
  }
  const status = TEXT_STATUS[review.textStatus];
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge variant={status.variant}>{status.label}</Badge>
      {!review.ratingVisible ? (
        <span className="text-xs text-muted-foreground">
          {d.ratingNotCounted}
        </span>
      ) : null}
    </span>
  );
}

function PurchaseMark({ review }: { review: AdminReviewEntity }) {
  return review.verifiedPurchase ? (
    <span className="text-xs text-success">{d.bought}</span>
  ) : (
    <span className="text-xs text-muted-foreground">{d.notBought}</span>
  );
}

/**
 * Two lines and no more (TASK-734's twin here): the column has a fixed width
 * and the text wraps inside it, so a long review can never push «Статус» and
 * «Надіслано» out of their columns. The whole text is the `title`.
 */
function CommentText({ review }: { review: AdminReviewEntity }) {
  const text = review.comment || d.noComment;
  return (
    <span className="flex flex-col gap-0.5">
      <span
        title={review.comment ?? undefined}
        className={cn(
          "line-clamp-2",
          review.comment ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {text}
      </span>
      {/* The reply is an UPSERT — answering again replaces what is
          published. A row that was already answered has to say so, or a
          second operator overwrites the first without ever seeing it. */}
      {review.reply ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CornerDownRightIcon aria-hidden="true" className="size-3" />
          {d.replyBadge}
        </span>
      ) : null}
    </span>
  );
}

function ProductLink({ review }: { review: AdminReviewEntity }) {
  return (
    <Link
      href={`/products/${review.productId}`}
      aria-label={d.productLinkAria(review.productName)}
      className="line-clamp-2 rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {review.productName}
    </Link>
  );
}

interface ApproveContext {
  onApprove: (id: string) => void;
  /** The row whose approve is in flight — its button spins. */
  approvingId: string | null;
  /** The row with any single-row write in flight — its button is disabled. */
  busyId: string | null;
}

function ApproveButton({
  review,
  ctx,
}: {
  review: AdminReviewEntity;
  ctx: ApproveContext;
}) {
  if (!canApprove(review)) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={ctx.busyId === review.id}
      onClick={() => ctx.onApprove(review.id)}
    >
      {ctx.approvingId === review.id ? (
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
      ) : null}
      {d.approve}
    </Button>
  );
}

/**
 * Width the default-visible columns may share at 1440: content area 1136 minus
 * the checkbox column (the pending queue is selectable), the «⋯» column and
 * the box border.
 */
export const REVIEW_COLUMNS_WIDTH_BUDGET = 1136 - 36 - 44 - 2;

/**
 * Columns of the queue (ReviewsProposal В1). No sort buttons: the API lists
 * newest first and takes no sort parameter (an API tail). The SKU rides under
 * the product name (TASK-430) instead of taking a column of its own.
 */
export function buildReviewColumns(
  ctx: ApproveContext,
): RegistryColumn<AdminReviewEntity>[] {
  return [
    {
      id: "product",
      label: d.colProduct,
      locked: true,
      defaultWidth: 196,
      minWidth: 140,
      cell: (review) => (
        <span className="flex flex-col gap-0.5">
          <ProductLink review={review} />
          <span className="text-xs text-muted-foreground">
            {review.productSku ?? d.noSku}
          </span>
        </span>
      ),
    },
    {
      id: "author",
      label: d.colAuthor,
      defaultWidth: 196,
      minWidth: 140,
      cell: (review) => (
        <span className="flex flex-col gap-0.5">
          <span className="break-all text-foreground">{review.userEmail}</span>
          <PurchaseMark review={review} />
        </span>
      ),
    },
    {
      id: "rating",
      label: d.colRating,
      defaultWidth: 84,
      minWidth: 84,
      cell: (review) => <ReviewStars rating={review.rating} />,
    },
    {
      id: "comment",
      label: d.colComment,
      defaultWidth: 236,
      minWidth: 160,
      cell: (review) => <CommentText review={review} />,
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 140,
      minWidth: 120,
      cell: (review) => <StatusCell review={review} />,
    },
    {
      id: "date",
      label: d.colDate,
      defaultWidth: 100,
      minWidth: 96,
      cell: (review) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDate(review.createdAt)}
        </span>
      ),
    },
    {
      // «Схвалити» is the queue's one primary action and stays in the row;
      // everything else is in «⋯» (В1/В2).
      id: "approve",
      label: dict.common.actions,
      header: <span className="sr-only">{dict.common.actions}</span>,
      resizable: false,
      defaultWidth: 100,
      minWidth: 100,
      align: "end",
      cell: (review) => <ApproveButton review={review} ctx={ctx} />,
    },
  ];
}

/** One review below md (ReviewsProposal В5). */
function renderCard(
  review: AdminReviewEntity,
  parts: RegistryCardParts,
  ctx: ApproveContext,
) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {parts.select}
          <ReviewStars rating={review.rating} />
        </span>
        <StatusCell review={review} />
      </div>
      <ProductLink review={review} />
      <CommentText review={review} />
      <span className="text-xs text-muted-foreground">
        <span className="break-all">{review.userEmail}</span> ·{" "}
        {review.verifiedPurchase ? d.bought : d.notBought} ·{" "}
        <span className="tabular-nums">{formatDate(review.createdAt)}</span>
      </span>
      <div className="flex items-center justify-between gap-2">
        <ApproveButton review={review} ctx={ctx} />
        <span className="ml-auto">{parts.actions}</span>
      </div>
    </div>
  );
}

const VIEW_LABELS: Record<ReviewViewId, string> = {
  pending: d.filterPending,
  approved: d.filterApproved,
  rejected: d.filterRejected,
  abuse: d.viewAbuse,
  hidden: d.viewHiddenAuthors,
  all: d.filterAll,
};

const VIEW_EMPTY: Record<ReviewViewId, ReactNode> = {
  pending: (
    <span className="flex flex-col items-center gap-1.5">
      <CircleCheckIcon aria-hidden="true" className="size-4 text-success" />
      <b className="font-semibold text-foreground">{d.emptyPendingTitle}</b>
      <span>{d.emptyPending}</span>
    </span>
  ),
  approved: d.emptyApproved,
  rejected: d.emptyRejected,
  abuse: d.emptyAbuse,
  hidden: d.emptyHiddenAuthors,
  all: d.emptyAll,
};

/**
 * The view counters: one-row requests, the API's own `meta.total`. Hooks in a
 * fixed order, one per preset view («Сигнали накрутки» is counted by the
 * dashboard's needs-action payload instead).
 */
function useViewCounts() {
  const options = { query: OPERATIONAL_LIST_QUERY };
  const counts = {
    pending: useAdminReviewControllerList(
      REVIEW_VIEW_COUNT_QUERY.pending,
      options,
    ),
    approved: useAdminReviewControllerList(
      REVIEW_VIEW_COUNT_QUERY.approved,
      options,
    ),
    rejected: useAdminReviewControllerList(
      REVIEW_VIEW_COUNT_QUERY.rejected,
      options,
    ),
    hidden: useAdminReviewControllerList(
      REVIEW_VIEW_COUNT_QUERY.hidden,
      options,
    ),
    all: useAdminReviewControllerList(REVIEW_VIEW_COUNT_QUERY.all, options),
  };
  return counts;
}

/**
 * AdminReviewTable — the moderation queue on the shared registry (wave 198,
 * TASK-1057, ReviewsProposal В1–В10).
 *
 * ── The URL contract, unchanged ─────────────────────────────────────────────
 * `?status=pending|approved|rejected|all` (default `pending`),
 * `?visibility=visible|hidden|all` (default `visible`), the dashboard's
 * deep-link narrowing `?productId=` / `?createdIp=` (TASK-601), `?search=`,
 * `?page=`, `?limit=`. The quick views write those same params, so every link
 * shared before the redesign opens the same rows with its view highlighted.
 *
 * ── What moved, nothing removed ─────────────────────────────────────────────
 * The two selects became six views plus «Фільтри» (for the combinations no
 * view stands for); «Відхилити текст», «Відповісти» / «Змінити відповідь» and
 * «Приховати всі оцінки автора…» / «Повернути оцінки автора…» moved into the
 * row's «⋯», «Схвалити» stayed in the row as its primary action. The deep-link
 * chips and «Скинути все» are the registry's own chips now. The bulk bar is
 * always there on the pending queue, and both bulk verdicts ask first.
 *
 * ── TASK-446: three queues, and rejecting is not a delete ───────────────────
 * «Відхилити текст» is `PATCH …/:id/reject`: the text leaves the site, the
 * RATING keeps counting, the author rewrites it from the storefront. A moderator
 * can approve from «Відхилені» later. Each row offers what is actually useful on
 * it — see `canApprove` / `canReject`.
 *
 * Selection stays on the PENDING queue alone: bulk is a triage tool for the
 * queue that accumulates; on the settled views the useful action is per row.
 *
 * Gates: the whole controller is `reviews:moderate` (the list included), the
 * reply is `reviews:write`, the author action `reviews:moderate` — each item is
 * drawn under the same `can()` as the button it replaced. The abuse signals come
 * from the dashboard's needs-action endpoint (`analytics:read`), so a session
 * without it reaches «Сигнали накрутки» only through the dashboard's link.
 *
 * `LiveAnnouncer` wraps the view: `useReviewBulkModeration` and the toolbar
 * call `useAnnouncer()`, and a hook in the component that renders the provider
 * reads the no-op default from above it.
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
  const updateParams = useUrlParams();
  const { can } = useAuth();
  const canReply = can(PERM.reviewsWrite);
  const canModerateAuthors = can(PERM.reviewsModerate);
  const canReadSignals = can(PERM.analyticsRead);

  const url = readReviewUrl(searchParams);
  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);
  const activeView = activeReviewView(url);

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminReviewControllerList({
      status: url.status,
      visibility: url.visibility,
      productId: url.productId || undefined,
      createdIp: url.createdIp || undefined,
      search: searchParam || undefined,
      page,
      limit: pageSize,
    });

  const viewCounts = useViewCounts();
  const needsAction = useAdminDashboardControllerGetNeedsAction({
    query: { ...OPERATIONAL_LIST_QUERY, enabled: canReadSignals },
  });
  const signals = abuseSignalList(needsAction.data?.data.ratingAbuseSignals);

  const approve = useAdminReviewControllerApprove();
  const reject = useAdminReviewControllerReject();

  const reviews = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;
  const selectable = url.status === AdminReviewControllerListStatus.pending;

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
          invalidateList();
          toast.success(d.approveSuccess);
        },
        onError: () => toast.error(d.actionError),
      },
    );
  };

  const handleReject = (id: string) => {
    reject.mutate(
      { id },
      {
        onSuccess: () => {
          invalidateList();
          toast.success(d.rejectSuccess);
        },
        onError: () => toast.error(d.actionError),
      },
    );
  };

  const approvingId = approve.isPending
    ? (approve.variables?.id ?? null)
    : null;
  const rejectingId = reject.isPending ? (reject.variables?.id ?? null) : null;
  const ctx: ApproveContext = {
    onApprove: handleApprove,
    approvingId,
    busyId: approvingId ?? rejectingId,
  };
  const columns = buildReviewColumns(ctx);

  const registry = useDataRegistry({
    tableId: "reviews",
    columns,
    rows: reviews,
    getRowId,
    selectionResetKey: [
      url.status,
      url.visibility,
      url.productId,
      url.createdIp,
      searchParam,
    ].join("|"),
  });
  const { selection } = registry;

  const bulk = useReviewBulkModeration({
    onSuccess: () => {
      selection.clear();
      invalidateList();
    },
  });

  // The row's dialogs, opened from «⋯». Held by id and read off the CURRENT
  // rows, so a refetch under the open dialog shows the fresh row (forms.md
  // Rule 2a — the reply form keeps a dirty draft); the snapshot covers a row
  // that left the page meanwhile.
  const [replyTarget, setReplyTarget] = useState<AdminReviewEntity | null>(
    null,
  );
  const [authorTarget, setAuthorTarget] = useState<AdminReviewEntity | null>(
    null,
  );
  const current = (target: AdminReviewEntity | null) =>
    target
      ? (reviews.find((review) => review.id === target.id) ?? target)
      : null;
  const replyReview = current(replyTarget);
  // The author dialog keeps its SNAPSHOT: once the hide lands the refetched
  // row reads «restore», and the open confirm must not flip under the click.
  const authorReview = authorTarget;

  const rowActions = (review: AdminReviewEntity): RowActionItem[] => {
    const busy = ctx.busyId === review.id;
    const items: RowActionItem[] = [];
    if (canReject(review)) {
      items.push({
        label: d.reject,
        onSelect: () => handleReject(review.id),
        disabled: busy,
      });
    }
    if (canReply) {
      items.push({
        label: review.reply?.body ? d.replyEditAction : d.replyAction,
        onSelect: () => setReplyTarget(review),
      });
    }
    const mode = canModerateAuthors
      ? authorModerationMode(review.hiddenReason)
      : null;
    if (mode) {
      items.push({
        label: mode === "hide" ? d.hideAuthorMenu : d.unhideAuthorMenu,
        onSelect: () => setAuthorTarget(review),
        destructive: mode === "hide",
        separatorBefore: items.length > 0,
      });
    }
    return items;
  };

  /* ── views ──────────────────────────────────────────────────────────── */

  const goToSignal = (signal: AbuseSignal) =>
    updateParams({
      status: AdminReviewControllerListStatus.all,
      visibility: undefined,
      productId: signal.productId,
      createdIp: signal.createdIp,
      page: undefined,
    });

  const viewItems: QuickView[] = REVIEW_VIEW_ORDER.flatMap(
    (id): QuickView[] => {
      if (id === "abuse") {
        // Offered when the dashboard flags something, or when a deep link
        // already narrowed to a series — never as a view with nothing in it.
        if (signals.length === 0 && activeView !== "abuse") return [];
        return [
          {
            id,
            label: VIEW_LABELS.abuse,
            count: needsAction.data?.data.ratingAbuse,
          },
        ];
      }
      return [
        {
          id,
          label: VIEW_LABELS[id],
          count: viewCounts[id].data?.meta?.total,
        },
      ];
    },
  );

  const onViewChange = (id: string) => {
    if (id === "abuse") {
      if (activeView !== "abuse" && signals[0]) goToSignal(signals[0]);
      return;
    }
    const preset = REVIEW_VIEW_PARAMS[id as Exclude<ReviewViewId, "abuse">];
    updateParams({
      status: preset.status,
      visibility: preset.visibility,
      productId: undefined,
      createdIp: undefined,
      page: undefined,
    });
  };

  /* ── chips ──────────────────────────────────────────────────────────── */

  // The deep-link narrowing is named from the rows once they arrive — they
  // all belong to it — and by its id until then (or when the series is empty).
  const productName = reviews[0]?.productName ?? url.productId;
  const chips: FilterChip[] = [];
  // The verdict and the author slice get a chip only when no view says them.
  if (activeView === "") {
    if (url.status !== AdminReviewControllerListStatus.pending) {
      chips.push({
        key: "status",
        label: d.chipStatus(STATUS_LABELS[url.status]),
        onRemove: () => updateParams({ status: undefined, page: undefined }),
      });
    }
    if (url.visibility !== ReviewAuthorVisibility.visible) {
      chips.push({
        key: "visibility",
        label: d.chipAuthors(VISIBILITY_LABELS[url.visibility]),
        onRemove: () =>
          updateParams({ visibility: undefined, page: undefined }),
      });
    }
  }
  const sheetChipCount = chips.length;
  if (url.productId) {
    chips.push({
      key: "productId",
      label: d.productChip(productName),
      onRemove: () => updateParams({ productId: undefined, page: undefined }),
    });
  }
  if (url.createdIp) {
    chips.push({
      key: "createdIp",
      label: d.ipChip(url.createdIp),
      onRemove: () => updateParams({ createdIp: undefined, page: undefined }),
    });
  }

  /* ── «Сигнали накрутки» card (В3) ───────────────────────────────────── */

  const signalIndex = abuseSignalIndex(signals, url);
  const nextSignal =
    signals.length > 1
      ? signals[(signalIndex + 1) % signals.length]
      : undefined;
  const nextPosition =
    signals.length > 1 ? ((signalIndex + 1) % signals.length) + 1 : 0;

  let notice: ReactNode = null;
  if (activeView === "abuse" && reviews.length > 0) {
    const facts = abuseFacts(reviews);
    const count = countLabel(
      total,
      facts.lowOnly ? d.abuseLowRatingForms : d.abuseRatingForms,
    );
    const span = countLabel(facts.days, d.dayForms);
    notice = (
      <Callout
        variant="warning"
        title={
          url.productId
            ? d.abuseTitleProduct(count, span, productName)
            : d.abuseTitleIp(count, span, url.createdIp)
        }
        actions={
          nextSignal ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToSignal(nextSignal)}
            >
              {d.abuseNext(nextPosition, signals.length)}
            </Button>
          ) : undefined
        }
      >
        {facts.suspects > 0
          ? `${d.abuseSuspects(facts.suspects, reviews.length)} ${d.abuseAdvice}`
          : d.abuseAdvice}
      </Callout>
    );
  }

  const selectedIds = [...selection.selectedIds];
  const selectedCount = selection.selectedCount;

  return (
    <>
      <DataRegistry
        registry={registry}
        title={d.heading}
        quickViews={{
          items: viewItems,
          activeId: activeView,
          onChange: onViewChange,
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        filters={{
          count: chips.length,
          renderSheet: ({ open, onOpenChange }) => (
            <ReviewFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={{
                status:
                  url.status === AdminReviewControllerListStatus.pending
                    ? ""
                    : url.status,
                visibility:
                  url.visibility === ReviewAuthorVisibility.visible
                    ? ""
                    : url.visibility,
              }}
              onApply={(next) =>
                updateParams({
                  status: next.status || undefined,
                  visibility: next.visibility || undefined,
                  page: undefined,
                })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => {
          void refetch();
          for (const query of Object.values(viewCounts)) void query.refetch();
          if (canReadSignals) void needsAction.refetch();
        }}
        isRefreshing={isFetching}
        notice={notice}
        chips={chips}
        onClearAllChips={() =>
          updateParams({
            status: undefined,
            visibility: undefined,
            productId: undefined,
            createdIp: undefined,
            page: undefined,
          })
        }
        summary={
          data ? (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          ) : null
        }
        sortLabel={d.sortCreatedDesc}
        itemForms={d.itemForms}
        getRowLabel={rowLabel}
        rowActions={rowActions}
        renderCard={(review, parts) => renderCard(review, parts, ctx)}
        selectable={selectable}
        bulk={{
          idleHint: d.bulk.idleHint,
          isPending: bulk.isPending,
          actions: (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulk.isPending}
                onClick={() => bulk.moderate(selectedIds, "approve")}
              >
                {d.bulk.approve(selectedCount)}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulk.isPending}
                className="text-destructive hover:text-destructive"
                onClick={() => bulk.moderate(selectedIds, "reject")}
              >
                {d.bulk.reject(selectedCount)}
              </Button>
            </>
          ),
        }}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={activeView ? VIEW_EMPTY[activeView] : d.emptyAll}
        searchQuery={searchParam || undefined}
        isFiltered={sheetChipCount > 0}
        pagination={{ page, totalPages, pageSize }}
      />

      {/* TASK-812: the bulk prompts (portalled). */}
      {bulk.confirmDialog}

      {replyReview ? (
        <ReviewReplyDialog
          review={replyReview}
          open
          onOpenChange={(open) => {
            if (!open) setReplyTarget(null);
          }}
        />
      ) : null}
      {authorReview ? (
        <ReviewAuthorModerationDialog
          userId={authorReview.userId}
          author={authorOf(authorReview.userEmail)}
          hiddenReason={authorReview.hiddenReason}
          open
          onOpenChange={(open) => {
            if (!open) setAuthorTarget(null);
          }}
        />
      ) : null}
    </>
  );
}
