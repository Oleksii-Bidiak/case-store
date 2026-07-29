"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useAdminContactList,
  AdminContactListStatus,
  BulkContactMessageStatusDtoStatus,
  type ContactMessageEntity,
} from "@/entities/contact";
import { useMessageBulkStatus } from "@/features/message-bulk-status";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { useRowSelection } from "@/shared/lib/use-row-selection";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import {
  Badge,
  BulkActionsBar,
  Button,
  Checkbox,
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
  TableSelectCell,
  TableSelectHead,
  TableToolbar,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { MessageInboxSkeleton } from "./message-inbox-skeleton";
import { MessageDetailDialog } from "./message-detail-dialog";
import { statusBadgeVariant, statusLabel } from "./status-meta";

const PAGE_SIZE = 20;
const MESSAGE_MAX = 80;
const ALL = "ALL";

const dateFormatter = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" });

/** Truncate a message body to a fixed length for the table cell. */
function truncate(value: string): string {
  return value.length > MESSAGE_MAX ? `${value.slice(0, MESSAGE_MAX)}…` : value;
}

/** Narrow a raw query param to a valid status filter, or undefined for "all". */
function parseStatus(raw: string | null): AdminContactListStatus | undefined {
  if (
    raw === AdminContactListStatus.NEW ||
    raw === AdminContactListStatus.IN_PROGRESS ||
    raw === AdminContactListStatus.READ ||
    raw === AdminContactListStatus.ARCHIVED
  ) {
    return raw;
  }
  return undefined;
}

/**
 * MessageInbox — admin inbox for customer contact messages. The status filter
 * (`?status=NEW|IN_PROGRESS|READ|ARCHIVED`, default all), sort
 * (`?sortBy=&sortOrder=`) and page (`?page=`) live in the URL. Each row opens a
 * detail dialog with the full message, contact info, and status/admin-note
 * controls. When the sender's email matches a registered user (`matchedUserId`,
 * TASK-256), the sender name links to that customer's profile.
 *
 * TASK-354 turned this from a read-only list into a queue two people can work:
 * server-side sorting, a refresh control, a short `staleTime`, and a bulk status
 * change over the on-screen selection. The sort default (`createdAt` desc)
 * mirrors the backend DTO's default — sending it explicitly keeps the query key
 * stable rather than having "no param" and "the default param" be two caches of
 * the same page.
 *
 * `LiveAnnouncer` MUST wrap the inbox rather than sit inside it — the same split
 * `AdminCategoryTree` makes, for the same reason. `useRowSelection` and
 * `useMessageBulkStatus` both call `useAnnouncer()`, and a hook called in the
 * very component that renders the provider reads the context from ABOVE it,
 * which is the default no-op. Every selection and bulk-save announcement would
 * be silently dropped, and nothing on screen would look wrong.
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

  const status = parseStatus(searchParams.get("status"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [selected, setSelected] = useState<ContactMessageEntity | null>(null);

  const updateParams = useUrlParams();

  // Sorting by `status` orders on the enum's declaration order — NEW,
  // IN_PROGRESS, READ, ARCHIVED — which is the triage order, not the alphabet.
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const { data, isLoading, isFetching, isError, refetch } = useAdminContactList(
    {
      ...(status !== undefined && { status }),
      page,
      limit: PAGE_SIZE,
      sortBy,
      sortOrder,
    },
    // An inbox is worked by more than one operator; five-minute-old rows mean
    // two people answering the same customer.
    { query: OPERATIONAL_LIST_QUERY },
  );

  const messages = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const handleStatusChange = (value: string) => {
    updateParams({
      status: value === ALL ? undefined : value,
      page: undefined,
    });
  };

  const senderOf = new Map(
    messages.map((message) => [message.id, message.name]),
  );
  const selection = useRowSelection({
    rowIds: messages.map((message) => message.id),
    getLabel: (id) => senderOf.get(id) ?? id,
    messages: {
      selected: dict.common.table.announceSelected,
      deselected: dict.common.table.announceDeselected,
      selectedAll: dict.common.table.announceSelectedAll,
      cleared: dict.common.table.announceCleared,
    },
  });

  const bulk = useMessageBulkStatus({ onSuccess: selection.clear });

  const selectedIds = [...selection.selectedIds];

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        filters={
          <Select value={status ?? ALL} onValueChange={handleStatusChange}>
            <SelectTrigger
              className="w-48"
              aria-label={dict.messages.filterStatusAria}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{dict.messages.filterAll}</SelectItem>
              <SelectItem value={AdminContactListStatus.NEW}>
                {dict.messages.filterNew}
              </SelectItem>
              <SelectItem value={AdminContactListStatus.IN_PROGRESS}>
                {dict.messages.filterInProgress}
              </SelectItem>
              <SelectItem value={AdminContactListStatus.READ}>
                {dict.messages.filterRead}
              </SelectItem>
              <SelectItem value={AdminContactListStatus.ARCHIVED}>
                {dict.messages.filterArchived}
              </SelectItem>
            </SelectContent>
          </Select>
        }
        selectAll={
          messages.length > 0 ? (
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
            label: dict.messages.bulk.markInProgress(selection.selectedCount),
            onClick: () =>
              bulk.setStatus(
                selectedIds,
                BulkContactMessageStatusDtoStatus.IN_PROGRESS,
              ),
          },
          {
            label: dict.messages.bulk.markRead(selection.selectedCount),
            onClick: () =>
              bulk.setStatus(
                selectedIds,
                BulkContactMessageStatusDtoStatus.READ,
              ),
          },
          {
            label: dict.messages.bulk.markArchived(selection.selectedCount),
            onClick: () =>
              bulk.setStatus(
                selectedIds,
                BulkContactMessageStatusDtoStatus.ARCHIVED,
              ),
          },
        ]}
      />

      {isLoading ? (
        <MessageInboxSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.messages.loadError}
        </p>
      ) : messages.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.messages.empty}
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
                <TableSelectHead
                  checked={selection.headerChecked}
                  onCheckedChange={selection.toggleAll}
                  disabled={bulk.isPending}
                  label={dict.common.table.selectAll}
                />
                <SortableColumnHeader
                  field="name"
                  label={dict.messages.colName}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <TableHead>{dict.messages.colTopic}</TableHead>
                <TableHead>{dict.messages.colMessage}</TableHead>
                <SortableColumnHeader
                  field="status"
                  label={dict.messages.colStatus}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <SortableColumnHeader
                  field="createdAt"
                  label={dict.messages.colDate}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((message) => (
                <TableRow
                  key={message.id}
                  rowLabel={dict.messages.rowAria(message.name)}
                  data-state={
                    selection.isSelected(message.id) ? "selected" : undefined
                  }
                  className={
                    message.status === AdminContactListStatus.NEW
                      ? "font-medium"
                      : undefined
                  }
                >
                  <TableSelectCell
                    checked={selection.isSelected(message.id)}
                    onSelect={({ shiftKey }) =>
                      shiftKey
                        ? selection.extendTo(message.id)
                        : selection.toggle(message.id)
                    }
                    disabled={bulk.isPending}
                    label={dict.messages.bulk.selectRow(message.name)}
                  />
                  <TableCell label={dict.messages.colName}>
                    {message.matchedUserId ? (
                      <Link
                        href={`/users/${message.matchedUserId}`}
                        className="text-primary hover:underline"
                      >
                        {message.name}
                      </Link>
                    ) : (
                      message.name
                    )}
                  </TableCell>
                  <TableCell
                    label={dict.messages.colTopic}
                    className="text-sm text-muted-foreground"
                  >
                    {message.topic || dict.messages.noTopic}
                  </TableCell>
                  <TableCell
                    label={dict.messages.colMessage}
                    className="max-w-xs text-sm text-muted-foreground max-md:max-w-none"
                  >
                    {truncate(message.message)}
                  </TableCell>
                  <TableCell label={dict.messages.colStatus}>
                    <Badge variant={statusBadgeVariant(message.status)}>
                      {statusLabel(message.status)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    label={dict.messages.colDate}
                    className="text-sm text-muted-foreground"
                  >
                    {dateFormatter.format(new Date(message.createdAt))}
                  </TableCell>
                  <TableCell
                    label={dict.common.actions}
                    className="text-right max-md:text-left"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelected(message)}
                    >
                      {dict.messages.open}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && messages.length > 0 && (
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

      {selected && (
        <MessageDetailDialog
          message={selected}
          open={selected !== null}
          onOpenChange={(next) => {
            if (!next) setSelected(null);
          }}
        />
      )}
    </div>
  );
}
