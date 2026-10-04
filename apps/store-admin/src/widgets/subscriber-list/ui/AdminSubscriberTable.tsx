"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "@/shared/ui/toast";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { countLabel, formatDate } from "@/shared/lib";
import { downloadCsv } from "@/shared/lib/download-csv";
import {
  AdminNewsletterControllerFindAllStatus,
  adminNewsletterControllerExport,
  useAdminNewsletterControllerFindAll,
  type NewsletterSubscriptionEntity,
} from "@/entities/newsletter";
import {
  Button,
  DataRegistry,
  ExportMenu,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type FilterChip,
  type QuickView,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { subscriberSourceLabel } from "../model/subscriber-source";
import {
  SubscriberCardSheet,
  SubscriberStatusBadge,
} from "./SubscriberCardSheet";
import {
  SubscriberFilterSheet,
  type SubscriberFilters,
} from "./SubscriberFilterSheet";

const d = dict.subscribers;

const EXPORT_FILENAME = "newsletter-subscribers.csv";

const ALL_VIEW = "all";

type SubscriberStatus =
  (typeof AdminNewsletterControllerFindAllStatus)[keyof typeof AdminNewsletterControllerFindAllStatus];

/**
 * Width the default-visible columns may share at 1440: content area 1136 minus
 * the «⋯» column and the box border (no checkbox column — no bulk actions).
 */
export const SUBSCRIBER_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/** The email opens the card — a real button, so it works from the keyboard. */
function EmailButton({
  subscriber,
  onOpen,
}: {
  subscriber: NewsletterSubscriptionEntity;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(subscriber.id)}
      className="max-w-full truncate rounded-xs text-left font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {subscriber.email}
    </button>
  );
}

/**
 * Columns of the list (SubscribersProposal ПД1, ПД2, ПД9). Sortable where the
 * API sorts (`createdAt | email | status`); `source` has no sort — it is null on
 * most rows. «Про що листи», «Покупець» and «Код за підписку» of the artboard
 * have no data behind them yet (TASK-1063…1065 tails).
 */
export function buildSubscriberColumns(
  onOpen: (id: string) => void,
): RegistryColumn<NewsletterSubscriptionEntity>[] {
  return [
    {
      id: "email",
      label: d.colEmail,
      locked: true,
      sortField: "email",
      defaultWidth: 320,
      minWidth: 180,
      cell: (subscriber) => (
        <EmailButton subscriber={subscriber} onOpen={onOpen} />
      ),
    },
    {
      id: "status",
      label: d.colStatus,
      sortField: "status",
      defaultWidth: 160,
      cell: (subscriber) => (
        <SubscriberStatusBadge status={subscriber.status} />
      ),
    },
    {
      id: "source",
      label: d.colSource,
      defaultWidth: 180,
      cell: (subscriber) => (
        <span className="text-foreground">
          {subscriberSourceLabel(subscriber.source)}
        </span>
      ),
    },
    {
      id: "createdAt",
      label: d.colDate,
      sortField: "createdAt",
      defaultWidth: 160,
      cell: (subscriber) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDate(subscriber.createdAt)}
        </span>
      ),
    },
    {
      id: "unsubscribedAt",
      label: d.colUnsubscribed,
      defaultWidth: 160,
      cell: (subscriber) => (
        <span className="text-muted-foreground tabular-nums">
          {subscriber.unsubscribedAt
            ? formatDate(subscriber.unsubscribedAt)
            : d.sourceEmpty}
        </span>
      ),
    },
  ];
}

const getRowId = (subscriber: NewsletterSubscriptionEntity) => subscriber.id;
const getRowLabel = (subscriber: NewsletterSubscriptionEntity) =>
  subscriber.email;

function sortLabel(sortBy: string, sortOrder: "asc" | "desc"): string {
  if (sortBy === "email") {
    return sortOrder === "asc" ? d.sortEmailAsc : d.sortEmailDesc;
  }
  if (sortBy === "status") {
    return sortOrder === "asc" ? d.sortStatusAsc : d.sortStatusDesc;
  }
  return sortOrder === "asc" ? d.sortCreatedAsc : d.sortCreatedDesc;
}

function statusViewLabel(status: string): string {
  return status === AdminNewsletterControllerFindAllStatus.SUBSCRIBED
    ? d.viewSubscribed
    : d.viewUnsubscribed;
}

function statusLabel(status: string): string {
  return status === AdminNewsletterControllerFindAllStatus.SUBSCRIBED
    ? d.statusSubscribed
    : d.statusUnsubscribed;
}

/**
 * «Підписники розсилки» on the shared registry (TASK-1043/1063, wave 198,
 * SubscribersProposal ПД1–ПД3, ПД6–ПД9). Search, status, sort, page and page
 * size live in the URL exactly as before; the status select moved onto the
 * views «Підписані · Відписані · Усі» and into «Фільтри», the CSV export into
 * «Експорт ▾» (with the BOM, TASK-691), and the email opens a card.
 *
 * Only the «Підписники» tab of the artboard is drawn: «Чекають на товар» and
 * «Налаштування» have no API yet (TASK-1064…1066), and an empty tab would
 * promise a feature. Same for the KPI row — the one number the API can give
 * (active subscribers) is already the «Підписані» counter.
 *
 * The view counters are the API's own `meta.total` for the same search —
 * one-row requests; «Відписані» is the difference, exact because status is
 * the only split.
 */
export function AdminSubscriberTable() {
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const [isExporting, setIsExporting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const updateParams = useUrlParams();
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const search = searchParam || undefined;
  const statusFilter = statusParam
    ? (statusParam as SubscriberStatus)
    : undefined;

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminNewsletterControllerFindAll({
      page,
      limit: pageSize,
      search,
      status: statusFilter,
      sortBy,
      sortOrder,
    });
  const allQuery = useAdminNewsletterControllerFindAll({
    page: 1,
    limit: 1,
    search,
  });
  const subscribedQuery = useAdminNewsletterControllerFindAll({
    page: 1,
    limit: 1,
    search,
    status: AdminNewsletterControllerFindAllStatus.SUBSCRIBED,
  });

  const subscribers = data?.data ?? [];
  const total = data?.meta?.total;
  const totalPages = data?.meta?.totalPages ?? 1;
  const allTotal = allQuery.data?.meta?.total;
  const subscribedTotal = subscribedQuery.data?.meta?.total;
  const unsubscribedTotal =
    allTotal !== undefined && subscribedTotal !== undefined
      ? Math.max(0, allTotal - subscribedTotal)
      : undefined;

  const columns = useMemo(() => buildSubscriberColumns(setOpenId), [setOpenId]);
  const registry = useDataRegistry({
    tableId: "subscribers",
    columns,
    rows: subscribers,
    getRowId,
  });

  const quickViews: QuickView[] = [
    {
      id: AdminNewsletterControllerFindAllStatus.SUBSCRIBED,
      label: d.viewSubscribed,
      count: subscribedTotal,
    },
    {
      id: AdminNewsletterControllerFindAllStatus.UNSUBSCRIBED,
      label: d.viewUnsubscribed,
      count: unsubscribedTotal,
    },
    { id: ALL_VIEW, label: d.viewAll, count: allTotal },
  ];

  const clearStatus = () =>
    updateParams({ status: undefined, page: undefined });
  const clearSearch = () =>
    updateParams({ search: undefined, page: undefined });

  const applied: SubscriberFilters = { status: statusParam };
  const statusChips: FilterChip[] = statusParam
    ? [
        {
          key: "status",
          label: d.chipStatus(statusViewLabel(statusParam)),
          onRemove: clearStatus,
        },
      ]
    : [];
  const chips: FilterChip[] = [
    ...(searchParam
      ? [
          {
            key: "search",
            label: d.chipSearch(searchParam),
            onRemove: clearSearch,
          },
        ]
      : []),
    ...statusChips,
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const csv = await adminNewsletterControllerExport({
        search,
        status: statusFilter,
      });
      // `downloadCsv` writes the UTF-8 BOM (TASK-691): Excel opens Cyrillic.
      downloadCsv(csv, EXPORT_FILENAME);
    } catch {
      toast.error(d.exportError);
    } finally {
      setIsExporting(false);
    }
  };

  // Three different answers (ПД8): a search that matched nobody, a status
  // view that is empty, and a shop where nobody has subscribed yet.
  const emptyState = searchParam ? (
    <EmptyMessage
      title={d.emptySearchTitle(searchParam)}
      body={d.emptySearchBody(searchParam)}
      action={{ label: d.emptySearchReset, onClick: clearSearch }}
    />
  ) : statusParam ? (
    <EmptyMessage
      title={d.emptyStatusTitle(statusLabel(statusParam))}
      body={d.emptyStatusBody}
      action={{ label: d.emptyReset, onClick: clearStatus }}
    />
  ) : (
    <EmptyMessage title={d.emptyAllTitle} body={d.emptyAllBody} />
  );

  const openSubscriber = openId
    ? subscribers.find((subscriber) => subscriber.id === openId)
    : undefined;

  return (
    <LiveAnnouncer>
      <DataRegistry
        registry={registry}
        title={d.heading}
        description={d.intro}
        headerActions={
          <ExportMenu
            foundLabel={countLabel(total ?? 0, d.itemForms)}
            selectedIds={[]}
            selectable={false}
            columns={registry.visibleColumnIds}
            formats={["csv"]}
            footnote={d.exportFootnote}
            onExport={() => void handleExport()}
            disabled={isExporting}
          />
        }
        quickViews={{
          items: quickViews,
          activeId: statusParam || ALL_VIEW,
          onChange: (id) =>
            updateParams({
              status: id === ALL_VIEW ? undefined : id,
              page: undefined,
            }),
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        filters={{
          count: statusChips.length,
          renderSheet: ({ open, onOpenChange }) => (
            <SubscriberFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={applied}
              onApply={(next) =>
                updateParams({
                  status: next.status || undefined,
                  page: undefined,
                })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => {
          void refetch();
          void allQuery.refetch();
          void subscribedQuery.refetch();
        }}
        isRefreshing={isFetching}
        chips={chips}
        onClearAllChips={() =>
          updateParams({
            search: undefined,
            status: undefined,
            page: undefined,
          })
        }
        summary={
          total === undefined ? null : (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
              {!statusParam &&
              subscribedTotal !== undefined &&
              unsubscribedTotal !== undefined
                ? ` · ${d.summaryBreakdown(subscribedTotal, unsubscribedTotal)}`
                : null}
            </>
          )
        }
        sortLabel={sortLabel(sortBy, sortOrder)}
        itemForms={d.itemForms}
        getRowLabel={getRowLabel}
        rowActions={(subscriber) => [
          { label: d.rowOpen, onSelect: () => setOpenId(subscriber.id) },
        ]}
        sort={{ sortBy, sortOrder, onSort }}
        renderCard={(subscriber, parts) => (
          <SubscriberCard
            subscriber={subscriber}
            parts={parts}
            onOpen={setOpenId}
          />
        )}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={emptyState}
        pagination={{ page, totalPages, pageSize }}
      />

      <SubscriberCardSheet
        subscriber={openSubscriber}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      />
    </LiveAnnouncer>
  );
}

function EmptyMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <span className="flex flex-col items-center gap-3">
      <span className="flex flex-col gap-1">
        <span className="font-semibold text-foreground">{title}</span>
        <span>{body}</span>
      </span>
      {action ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
    </span>
  );
}

/** One subscriber below md (SubscribersProposal ПД6). */
function SubscriberCard({
  subscriber,
  parts,
  onOpen,
}: {
  subscriber: NewsletterSubscriptionEntity;
  parts: RegistryCardParts;
  onOpen: (id: string) => void;
}) {
  const meta = [
    subscriberSourceLabel(subscriber.source),
    formatDate(subscriber.createdAt),
  ].join(" · ");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-all">
          <EmailButton subscriber={subscriber} onOpen={onOpen} />
        </span>
        <SubscriberStatusBadge status={subscriber.status} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {meta}
          {subscriber.unsubscribedAt
            ? ` · ${d.colUnsubscribed} ${formatDate(subscriber.unsubscribedAt)}`
            : ""}
        </span>
        {parts.actions}
      </div>
    </div>
  );
}
