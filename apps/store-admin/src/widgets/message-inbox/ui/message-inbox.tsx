"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LockIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminContactList,
  useAdminContactUpdate,
  getAdminContactListQueryKey,
  getAdminContactUnreadCountQueryKey,
  AdminContactListStatus,
  BulkContactMessageStatusDtoStatus,
  UpdateContactMessageDtoStatus,
  type ContactMessageEntity,
} from "@/entities/contact";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { useMessageBulkStatus } from "@/features/message-bulk-status";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import { countLabel, formatDate, formatTime } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/ui/toast";
import {
  Badge,
  Button,
  Callout,
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type RegistryCardParts,
  type RegistryColumn,
  type RowActionItem,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  ALL_VIEW,
  MESSAGE_VIEWS,
  activeMessageView,
  parseStatus,
  phoneText,
  topicLabel,
} from "../model/message-views";
import { MessageDetailSheet, OrderRef } from "./message-detail-sheet";
import { statusBadgeVariant, statusLabel } from "./status-meta";

const d = dict.messages;

const isNew = (message: ContactMessageEntity) =>
  message.status === AdminContactListStatus.NEW;
const rowLabel = (message: ContactMessageEntity) => d.rowAria(message.name);
const getRowId = (message: ContactMessageEntity) => message.id;

/** The per-row status moves («⋯»), as the panel's menu offers them. */
const STATUS_ACTIONS: ReadonlyArray<{
  status: UpdateContactMessageDtoStatus;
  label: string;
}> = [
  {
    status: UpdateContactMessageDtoStatus.IN_PROGRESS,
    label: d.markInProgress,
  },
  { status: UpdateContactMessageDtoStatus.READ, label: d.markRead },
  { status: UpdateContactMessageDtoStatus.ARCHIVED, label: d.markArchived },
  { status: UpdateContactMessageDtoStatus.NEW, label: d.markNew },
];

function sortLabel(sortBy: string, sortOrder: "asc" | "desc"): string {
  const asc = sortOrder === "asc";
  if (sortBy === "name") return asc ? d.sortNameAsc : d.sortNameDesc;
  if (sortBy === "status") return asc ? d.sortStatusAsc : d.sortStatusDesc;
  return asc ? d.sortCreatedAsc : d.sortCreatedDesc;
}

/* ── Cells ──────────────────────────────────────────────────────────────── */

/**
 * «● Оксана Шевченко / +380 67 111 2233». The name is a button that opens the
 * panel — the row's keyboard way in; a NEW message carries the dot (named
 * «Нове» for a screen reader) and a bolder name.
 */
function SenderCell({
  message,
  onOpen,
}: {
  message: ContactMessageEntity;
  onOpen: (message: ContactMessageEntity) => void;
}) {
  const fresh = isNew(message);
  return (
    <span className="flex items-start gap-2">
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          fresh && "bg-primary",
        )}
        {...(fresh
          ? { role: "img", "aria-label": d.statusNew }
          : { "aria-hidden": true })}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onOpen(message)}
          className={cn(
            "rounded-xs text-left text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
            fresh ? "font-semibold" : "font-medium",
          )}
        >
          {message.name}
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {phoneText(message.phone)}
        </span>
      </span>
    </span>
  );
}

/**
 * TASK-734: two lines, inside a column of fixed width. The text wraps and
 * clamps there, so a long message can no longer run over «Статус» and
 * «Отримано». The full text is in the panel.
 */
function MessageText({ message }: { message: ContactMessageEntity }) {
  return (
    <span className="line-clamp-2 break-words text-foreground">
      {message.message}
    </span>
  );
}

function StatusBadge({ message }: { message: ContactMessageEntity }) {
  return (
    <Badge variant={statusBadgeVariant(message.status)}>
      {statusLabel(message.status)}
    </Badge>
  );
}

/**
 * Width the default-visible columns may share at 1440: content area 1136 minus
 * the checkbox column, the «⋯» column and the box border.
 */
export const MESSAGE_COLUMNS_WIDTH_BUDGET = 1136 - 36 - 44 - 2;

interface ColumnContext {
  onOpen: (message: ContactMessageEntity) => void;
  canReadOrders: boolean;
}

/**
 * Columns of the inbox (MessagesProposal З1, З9). Sortable where the API
 * sorts: `name`, `status`, `createdAt`. «Отримано · остання дія» is «Отримано»
 * until the API records actions on a message (TASK-1061).
 */
export function buildMessageColumns({
  onOpen,
  canReadOrders,
}: ColumnContext): RegistryColumn<ContactMessageEntity>[] {
  return [
    {
      id: "sender",
      label: d.colName,
      locked: true,
      sortField: "name",
      defaultWidth: 200,
      minWidth: 150,
      cell: (message) => <SenderCell message={message} onOpen={onOpen} />,
    },
    {
      id: "topic",
      label: d.colTopic,
      defaultWidth: 140,
      minWidth: 100,
      cell: (message) => (
        <span className="text-foreground">{topicLabel(message.topic)}</span>
      ),
    },
    {
      id: "message",
      label: d.colMessage,
      defaultWidth: 320,
      minWidth: 200,
      cell: (message) => <MessageText message={message} />,
    },
    {
      id: "order",
      label: d.colOrder,
      defaultWidth: 110,
      minWidth: 96,
      cell: (message) => (
        <OrderRef orderRef={message.orderRef} canReadOrders={canReadOrders} />
      ),
    },
    {
      id: "status",
      label: d.colStatus,
      sortField: "status",
      defaultWidth: 120,
      minWidth: 110,
      cell: (message) => <StatusBadge message={message} />,
    },
    {
      id: "received",
      label: d.colDate,
      sortField: "createdAt",
      defaultWidth: 150,
      minWidth: 120,
      cell: (message) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDate(message.createdAt)}, {formatTime(message.createdAt)}
        </span>
      ),
    },
    // Hidden by default; one click away in «Колонки».
    {
      id: "email",
      label: d.fieldEmail,
      defaultVisible: false,
      defaultWidth: 220,
      cell: (message) => <span className="break-all">{message.email}</span>,
    },
  ];
}

/** One message below md (MessagesProposal З3). */
function renderCard(
  message: ContactMessageEntity,
  parts: RegistryCardParts,
  onOpen: (message: ContactMessageEntity) => void,
) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2">
          {parts.select}
          <SenderCell message={message} onOpen={onOpen} />
        </span>
        <StatusBadge message={message} />
      </div>
      <span className="font-semibold text-foreground">
        {topicLabel(message.topic)}
      </span>
      <span className="line-clamp-2 text-sm break-words text-muted-foreground">
        {message.message}
      </span>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(message.createdAt)}, {formatTime(message.createdAt)}
        </span>
        {parts.actions}
      </div>
    </div>
  );
}

/**
 * The view counters: one-row requests, the API's own `meta.total`, in a fixed
 * hook order — one per view, «Усі» last.
 */
function useViewCounts(): Record<
  string,
  { total: number | undefined; refetch: () => unknown }
> {
  const options = { query: OPERATIONAL_LIST_QUERY };
  const fresh = useAdminContactList(
    { status: AdminContactListStatus.NEW, limit: 1 },
    options,
  );
  const inProgress = useAdminContactList(
    { status: AdminContactListStatus.IN_PROGRESS, limit: 1 },
    options,
  );
  const read = useAdminContactList(
    { status: AdminContactListStatus.READ, limit: 1 },
    options,
  );
  const archived = useAdminContactList(
    { status: AdminContactListStatus.ARCHIVED, limit: 1 },
    options,
  );
  const spam = useAdminContactList(
    { status: AdminContactListStatus.SPAM, limit: 1 },
    options,
  );
  const all = useAdminContactList({ limit: 1 }, options);
  const count = (query: typeof all) => ({
    total: query.data?.meta?.total,
    refetch: query.refetch,
  });
  return {
    [AdminContactListStatus.NEW]: count(fresh),
    [AdminContactListStatus.IN_PROGRESS]: count(inProgress),
    [AdminContactListStatus.READ]: count(read),
    [AdminContactListStatus.ARCHIVED]: count(archived),
    [AdminContactListStatus.SPAM]: count(spam),
    [ALL_VIEW]: count(all),
  };
}

/**
 * MessageInbox — the inbox on the shared registry (wave 198, TASK-1060,
 * TASK-734, MessagesProposal З1–З9).
 *
 * ── The URL contract, unchanged ─────────────────────────────────────────────
 * `?status=NEW|IN_PROGRESS|READ|ARCHIVED|SPAM` (absent = «Усі», which the API
 * serves without SPAM — TASK-761), `?search=`, `?sortBy=&sortOrder=` (name,
 * status, createdAt; the DTO default is sent explicitly so "no param" and "the
 * default" are one cache entry), `?page=`, `?limit=`. The quick views write
 * that same `status`.
 *
 * ── What moved, nothing removed ─────────────────────────────────────────────
 * The status select became six views; «Відкрити» became a row click, the
 * sender's name (a button) and «⋯ → Відкрити»; the detail dialog became a side
 * panel whose «Статус: … ▾» menu holds the four status buttons; the per-row
 * status moves are also in «⋯»; «Профіль клієнта» is in «⋯» and in the panel.
 * The bulk bar (В роботу / Прочитано / В архів) is always on screen for a
 * session that may use it.
 *
 * ── TASK-1011: `messages:write` ─────────────────────────────────────────────
 * The API guards every status change and the note with it. Without it there is
 * no checkbox column, no bulk bar, no status item in «⋯», no status menu and
 * no note editor in the panel — a strip says the list is read-only instead
 * (З7/З8).
 *
 * TASK-423 search: name, email, topic, order ref and text — and the phone,
 * once the term carries enough digits to BE one.
 *
 * `LiveAnnouncer` wraps the view: the bulk engine and the toolbar call
 * `useAnnouncer()`, and a hook in the component that renders the provider
 * reads the no-op default from above it.
 */
export function MessageInbox() {
  return (
    <LiveAnnouncer>
      <MessageInboxView />
    </LiveAnnouncer>
  );
}

function MessageInboxView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const updateParams = useUrlParams();
  const { can } = useAuth();
  const canWrite = can(PERM.messagesWrite);
  const canReadOrders = can(PERM.ordersRead);

  const status = parseStatus(searchParams.get("status"));
  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);
  const activeView = activeMessageView(status);

  // Sorting by `status` orders on the enum's declaration order — NEW,
  // IN_PROGRESS, READ, ARCHIVED — which is the triage order, not the alphabet.
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const { data, isLoading, isFetching, isError, refetch } = useAdminContactList(
    {
      ...(status !== undefined && { status }),
      search: searchParam || undefined,
      page,
      limit: pageSize,
      sortBy,
      sortOrder,
    },
    // An inbox is worked by more than one operator; five-minute-old rows mean
    // two people answering the same customer.
    { query: OPERATIONAL_LIST_QUERY },
  );
  const viewCounts = useViewCounts();

  const messages = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const unread = data?.meta?.unread ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  // The panel shows the CURRENT row (a refetch lands under it); the snapshot
  // covers a row that left the page meanwhile.
  const [opened, setOpened] = useState<ContactMessageEntity | null>(null);
  const openedMessage = opened
    ? (messages.find((message) => message.id === opened.id) ?? opened)
    : null;

  const columns = buildMessageColumns({ onOpen: setOpened, canReadOrders });
  const registry = useDataRegistry({
    tableId: "messages",
    columns,
    rows: messages,
    getRowId,
    selectionResetKey: `${status ?? ""}|${searchParam}`,
  });
  const { selection } = registry;
  const bulk = useMessageBulkStatus({ onSuccess: selection.clear });
  const selectedIds = [...selection.selectedIds];
  const selectedCount = selection.selectedCount;

  const update = useAdminContactUpdate();
  const setRowStatus = (
    message: ContactMessageEntity,
    next: UpdateContactMessageDtoStatus,
  ) =>
    update.mutate(
      { id: message.id, data: { status: next } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminContactListQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminContactUnreadCountQueryKey(),
          });
          toast.success(d.updateSuccess);
        },
        onError: () => toast.error(d.updateError),
      },
    );

  const rowActions = (message: ContactMessageEntity): RowActionItem[] => {
    const items: RowActionItem[] = [
      { label: d.open, onSelect: () => setOpened(message) },
    ];
    if (canWrite) {
      STATUS_ACTIONS.filter(
        (action) => action.status !== message.status,
      ).forEach((action, index) =>
        items.push({
          label: action.label,
          onSelect: () => setRowStatus(message, action.status),
          disabled: update.isPending,
          separatorBefore: index === 0,
        }),
      );
    }
    if (message.matchedUserId) {
      items.push({
        label: d.viewProfile,
        href: `/users/${message.matchedUserId}`,
        separatorBefore: true,
      });
    }
    return items;
  };

  const viewItems = MESSAGE_VIEWS.map((view) => ({
    id: view.id,
    label: view.label,
    count: viewCounts[view.id]?.total,
  }));

  const notice =
    status === AdminContactListStatus.SPAM ? (
      <Callout variant="warning" title={d.spamTitle}>
        {d.spamText}
      </Callout>
    ) : !canWrite ? (
      <Callout
        variant="strip"
        className="border-dashed bg-transparent text-muted-foreground"
        icon={
          <LockIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        }
      >
        {d.readOnly}
      </Callout>
    ) : null;

  return (
    <>
      <DataRegistry
        registry={registry}
        title={d.heading}
        quickViews={{
          items: viewItems,
          activeId: activeView,
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
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => {
          void refetch();
          for (const query of Object.values(viewCounts)) void query.refetch();
        }}
        isRefreshing={isFetching}
        // The «Спам» explanation (З4), or the read-only strip (З7).
        notice={notice}
        summary={
          data ? (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
              {unread > 0 && status !== AdminContactListStatus.SPAM ? (
                <>
                  {" · "}
                  {d.summaryNew} <SummaryValue>{unread}</SummaryValue>
                </>
              ) : null}
            </>
          ) : null
        }
        sortLabel={sortLabel(sortBy, sortOrder)}
        itemForms={d.itemForms}
        getRowLabel={rowLabel}
        onRowOpen={setOpened}
        rowClassName={(message) =>
          isNew(message) ? "bg-primary/6" : undefined
        }
        rowActions={rowActions}
        sort={{ sortBy, sortOrder, onSort }}
        renderCard={(message, parts) => renderCard(message, parts, setOpened)}
        selectable={canWrite}
        bulk={
          canWrite
            ? {
                idleHint: d.bulkIdleHint,
                isPending: bulk.isPending,
                actions: (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={bulk.isPending}
                      onClick={() =>
                        bulk.setStatus(
                          selectedIds,
                          BulkContactMessageStatusDtoStatus.IN_PROGRESS,
                        )
                      }
                    >
                      {d.bulk.markInProgress(selectedCount)}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={bulk.isPending}
                      onClick={() =>
                        bulk.setStatus(
                          selectedIds,
                          BulkContactMessageStatusDtoStatus.READ,
                        )
                      }
                    >
                      {d.bulk.markRead(selectedCount)}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={bulk.isPending}
                      onClick={() =>
                        bulk.setStatus(
                          selectedIds,
                          BulkContactMessageStatusDtoStatus.ARCHIVED,
                        )
                      }
                    >
                      {d.bulk.markArchived(selectedCount)}
                    </Button>
                  </>
                ),
              }
            : undefined
        }
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={
          MESSAGE_VIEWS.find((view) => view.id === activeView)?.empty ?? d.empty
        }
        searchQuery={searchParam || undefined}
        pagination={{ page, totalPages, pageSize }}
      />

      {openedMessage ? (
        <MessageDetailSheet
          message={openedMessage}
          open
          onOpenChange={(open) => {
            if (!open) setOpened(null);
          }}
        />
      ) : null}
    </>
  );
}
