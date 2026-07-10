"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useAdminContactList,
  AdminContactListStatus,
  type ContactMessageEntity,
} from "@/entities/contact";
import {
  Badge,
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
    raw === AdminContactListStatus.READ ||
    raw === AdminContactListStatus.ARCHIVED
  ) {
    return raw;
  }
  return undefined;
}

/**
 * MessageInbox — admin inbox for customer contact messages. The status filter
 * (`?status=NEW|READ|ARCHIVED`, default all) and page (`?page=`) live in the
 * URL. Each row opens a detail dialog with the full message, contact info, and
 * status/admin-note controls.
 */
export function MessageInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = parseStatus(searchParams.get("status"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [selected, setSelected] = useState<ContactMessageEntity | null>(null);

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

  const { data, isLoading, isFetching, isError } = useAdminContactList({
    ...(status !== undefined && { status }),
    page,
    limit: PAGE_SIZE,
  });

  const messages = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const handleStatusChange = (value: string) => {
    updateParams({
      status: value === ALL ? undefined : value,
      page: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
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
            <SelectItem value={AdminContactListStatus.READ}>
              {dict.messages.filterRead}
            </SelectItem>
            <SelectItem value={AdminContactListStatus.ARCHIVED}>
              {dict.messages.filterArchived}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                <TableHead>{dict.messages.colName}</TableHead>
                <TableHead>{dict.messages.colTopic}</TableHead>
                <TableHead>{dict.messages.colMessage}</TableHead>
                <TableHead>{dict.messages.colStatus}</TableHead>
                <TableHead>{dict.messages.colDate}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((message) => (
                <TableRow
                  key={message.id}
                  className={
                    message.status === AdminContactListStatus.NEW
                      ? "font-medium"
                      : undefined
                  }
                >
                  <TableCell label={dict.messages.colName}>
                    {message.name}
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
