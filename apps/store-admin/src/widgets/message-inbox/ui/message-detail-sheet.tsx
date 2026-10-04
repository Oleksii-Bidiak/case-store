"use client";

import Link from "next/link";
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  Loader2,
  LockIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  useAdminContactUpdate,
  getAdminContactListQueryKey,
  getAdminContactUnreadCountQueryKey,
  UpdateContactMessageDtoStatus,
  type ContactMessageEntity,
} from "@/entities/contact";
import { OrderNumber } from "@/entities/order";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import { orderRefTarget, phoneText, topicLabel } from "../model/message-views";
import { statusBadgeVariant, statusLabel } from "./status-meta";

const d = dict.messages;

interface NoteFormValues {
  adminNote: string;
}

interface MessageDetailSheetProps {
  message: ContactMessageEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The status moves, in the order the old footer offered them. */
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

const linkClass =
  "rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The order the customer named: a link when the panel can resolve it and the
 * session may read orders, the number as text otherwise, the raw reference
 * when it is not an order number at all.
 */
export function OrderRef({
  orderRef,
  canReadOrders,
}: {
  orderRef: string | null | undefined;
  canReadOrders: boolean;
}) {
  if (!orderRef) return <span className="text-muted-foreground">—</span>;
  const target = orderRefTarget(orderRef);
  if (!target) return <span className="break-all">{orderRef}</span>;
  const number = <OrderNumber id={target.id} />;
  if (!canReadOrders) return number;
  return (
    <Link
      href={target.href}
      aria-label={d.orderLinkAria(`#${target.id.slice(0, 8).toUpperCase()}`)}
      className={linkClass}
    >
      {number}
    </Link>
  );
}

/**
 * MessageDetailSheet — one inbox message in a side panel (wave 198,
 * TASK-1060, MessagesProposal З5–З8), drawn from what the API has TODAY:
 *
 *   - the head: topic, status, the sender's phone (`tel:`) and email
 *     (`mailto:`), the order they named, «Профіль клієнта» when the email
 *     matches an account (TASK-256), and «Статус: … ▾» — the four status
 *     buttons of the old dialog, now one menu;
 *   - the thread: the customer's message with its source. Every message today
 *     comes from the storefront form, so «форма на сайті» is a fact, not a
 *     guess;
 *   - the composer: the ONE internal note `ContactMessage.adminNote` holds,
 *     edited in place («Зберегти примітку» replaces it, as before).
 *
 * Not drawn, because nothing could send them (TASK-1061): «Відповідь
 * клієнту», a thread of notes, «Усе · Листування · Примітки», delivery marks
 * and edit history. A field that cannot send is worse than none.
 *
 * Without `messages:write` (TASK-1011 — the key the API checks on
 * `PATCH /contact/admin/:id`) there is no status menu and no editor; the saved
 * note is shown as a card and the footer says why the panel is read-only (З8).
 *
 * The note is an RHF form seeded via `values` + `keepDirtyValues` (forms.md
 * Rule 2a): the message refetches under the open panel, and a half-typed note
 * must survive it. A status change closes the panel, as the dialog did — the
 * row refetches with the new status, so there is no stale copy to keep.
 */
export function MessageDetailSheet({
  message,
  open,
  onOpenChange,
}: MessageDetailSheetProps) {
  const queryClient = useQueryClient();
  const update = useAdminContactUpdate();
  const { can } = useAuth();
  const canWrite = can(PERM.messagesWrite);
  const canReadOrders = can(PERM.ordersRead);

  const { register, handleSubmit, formState } = useForm<NoteFormValues>({
    values: { adminNote: message.adminNote ?? "" },
    resetOptions: { keepDirtyValues: true },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminContactListQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminContactUnreadCountQueryKey(),
    });
  };

  const runUpdate = (
    data: { status?: UpdateContactMessageDtoStatus; adminNote?: string },
    onDone?: () => void,
  ) => {
    update.mutate(
      { id: message.id, data },
      {
        onSuccess: () => {
          invalidate();
          toast.success(d.updateSuccess);
          onDone?.();
        },
        onError: () => toast.error(d.updateError),
      },
    );
  };

  const setStatus = (status: UpdateContactMessageDtoStatus) =>
    runUpdate({ status }, () => onOpenChange(false));

  const onSaveNote = (values: NoteFormValues) =>
    runUpdate({ adminNote: values.adminNote });

  const title = message.topic ? topicLabel(message.topic) : d.detailTitle;
  const initial = message.name.trim().charAt(0).toUpperCase() || "?";
  const noteId = `message-note-${message.id}`;
  const noteHintId = `${noteId}-hint`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-180">
        <SheetHeader className="gap-2.5 border-b px-5 pt-4 pb-3">
          <SheetTitle className="flex flex-wrap items-center gap-2 pr-8 font-display text-lg">
            {title}
            <Badge variant={statusBadgeVariant(message.status)}>
              {statusLabel(message.status)}
            </Badge>
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-1 text-sm">
            <span>{message.name}</span>
            <span aria-hidden="true">·</span>
            <a href={`tel:${message.phone}`} className={linkClass}>
              {phoneText(message.phone)}
            </a>
            <span aria-hidden="true">·</span>
            <a
              href={`mailto:${message.email}`}
              className={`${linkClass} break-all`}
            >
              {message.email}
            </a>
          </SheetDescription>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {message.orderRef ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">
                    {d.fieldOrderRef}
                  </span>
                  <OrderRef
                    orderRef={message.orderRef}
                    canReadOrders={canReadOrders}
                  />
                </span>
              ) : null}
              {message.matchedUserId ? (
                <Link
                  href={`/users/${message.matchedUserId}`}
                  className={`${linkClass} inline-flex items-center gap-0.5`}
                >
                  {d.viewProfile}
                  <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
                </Link>
              ) : null}
            </div>
            {canWrite ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={update.isPending}
                  >
                    {d.statusMenu(statusLabel(message.status))}
                    <ChevronDownIcon aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {STATUS_ACTIONS.filter(
                    (action) => action.status !== message.status,
                  ).map((action) => (
                    <DropdownMenuItem
                      key={action.status}
                      onSelect={() => setStatus(action.status)}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto bg-muted/45 px-5 py-4">
          {/* The customer's message (З5, left). */}
          <article className="flex max-w-11/12 flex-col gap-1 self-start sm:max-w-4/5">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-foreground"
              >
                {initial}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {message.name}
              </span>
              <span className="rounded-full bg-muted px-1.5 text-2xs">
                {d.sourceForm}
              </span>
              <span className="tabular-nums">
                {formatDateTime(message.createdAt)}
              </span>
            </p>
            <p className="rounded-xl rounded-tl-sm border bg-card px-3 py-2.5 text-sm whitespace-pre-wrap text-foreground">
              {message.message}
            </p>
          </article>

          {/* The saved note, read-only (З8). A session that may write edits
              it in the composer below instead of seeing it twice. */}
          {!canWrite && message.adminNote ? (
            <article className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-warning">
                <LockIcon aria-hidden="true" className="size-3.5" />
                <span className="font-semibold">{d.fieldAdminNote}</span>
                <span className="text-muted-foreground">· {d.noteHidden}</span>
              </p>
              <p className="rounded-lg border border-dashed border-warning/60 bg-warning/10 px-3 py-2.5 text-sm whitespace-pre-wrap text-foreground">
                {message.adminNote}
              </p>
            </article>
          ) : null}
        </div>

        {canWrite ? (
          <form
            onSubmit={handleSubmit(onSaveNote)}
            className="flex flex-col gap-2 border-t bg-background px-5 pt-3 pb-4"
          >
            <p className="flex items-center gap-1.5 text-sm">
              <LockIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-warning"
              />
              <Label htmlFor={noteId} className="text-warning">
                {d.fieldAdminNote}
              </Label>
              <span className="text-xs text-muted-foreground">
                · {d.noteHidden}
              </span>
            </p>
            <Textarea
              id={noteId}
              rows={3}
              placeholder={d.adminNotePlaceholder}
              aria-describedby={noteHintId}
              className="border-dashed border-warning/60 bg-warning/6"
              {...register("adminNote")}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id={noteHintId} className="text-xs text-muted-foreground">
                {d.noteHint}
              </p>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="border-warning/60 max-sm:w-full"
                disabled={update.isPending || !formState.isDirty}
              >
                {update.isPending && (
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                )}
                {d.saveNote}
              </Button>
            </div>
          </form>
        ) : (
          <p className="flex items-start gap-2 border-t bg-background px-5 py-4 text-xs text-muted-foreground">
            <LockIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {d.readOnly}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
