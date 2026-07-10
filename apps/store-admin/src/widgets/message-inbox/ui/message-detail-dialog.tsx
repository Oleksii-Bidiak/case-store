"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useAdminContactUpdate,
  getAdminContactListQueryKey,
  getAdminContactUnreadCountQueryKey,
  UpdateContactMessageDtoStatus,
  type ContactMessageEntity,
} from "@/entities/contact";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Textarea,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { statusLabel } from "./status-meta";

const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface NoteFormValues {
  adminNote: string;
}

interface MessageDetailDialogProps {
  message: ContactMessageEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A single labelled read-only detail row. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

/**
 * MessageDetailDialog — full view of a single contact message with the contact
 * details, order reference, body, and status/admin-note controls. The admin
 * note is an RHF form seeded via `values` (forms.md Rule 2a) so switching the
 * selected message re-syncs untouched fields without discarding in-progress
 * edits. Status buttons and note save go through the same update mutation, which
 * invalidates the inbox list + unread badge. When the sender's email matches a
 * registered user (`matchedUserId`, TASK-256), a "Профіль клієнта" link jumps
 * to that customer's card.
 */
export function MessageDetailDialog({
  message,
  open,
  onOpenChange,
}: MessageDetailDialogProps) {
  const queryClient = useQueryClient();
  const update = useAdminContactUpdate();

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
          toast.success(dict.messages.updateSuccess);
          onDone?.();
        },
        onError: () => toast.error(dict.messages.updateError),
      },
    );
  };

  // Close on a successful status change: the row in the list refetches with the
  // new status, so there is no stale local copy to keep in sync.
  const setStatus = (status: UpdateContactMessageDtoStatus) =>
    runUpdate({ status }, () => onOpenChange(false));

  const onSaveNote = (values: NoteFormValues) =>
    runUpdate({ adminNote: values.adminNote });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No max-w override: the base DialogContent already caps at sm:max-w-lg,
          and an unprefixed max-w-* here would shadow the TASK-258 mobile
          full-height sizing. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {dict.messages.detailTitle}
            <Badge variant="secondary">{statusLabel(message.status)}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            {dict.messages.receivedAt(
              dateFormatter.format(new Date(message.createdAt)),
            )}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <DetailRow label={dict.messages.fieldName} value={message.name} />
            <DetailRow label={dict.messages.fieldPhone} value={message.phone} />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                {dict.messages.fieldEmail}
              </span>
              <span className="text-sm text-foreground">
                {message.email}
                {message.matchedUserId && (
                  <>
                    {" · "}
                    <Link
                      href={`/users/${message.matchedUserId}`}
                      className="text-primary hover:underline"
                    >
                      {dict.messages.viewProfile}
                    </Link>
                  </>
                )}
              </span>
            </div>
            <DetailRow
              label={dict.messages.fieldTopic}
              value={message.topic || dict.messages.noTopic}
            />
            {message.orderRef && (
              <DetailRow
                label={dict.messages.fieldOrderRef}
                value={message.orderRef}
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {dict.messages.fieldMessage}
            </span>
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
              {message.message}
            </p>
          </div>

          <form
            onSubmit={handleSubmit(onSaveNote)}
            className="flex flex-col gap-2"
          >
            <label
              htmlFor="admin-note"
              className="text-xs font-medium text-muted-foreground"
            >
              {dict.messages.fieldAdminNote}
            </label>
            <Textarea
              id="admin-note"
              rows={3}
              placeholder={dict.messages.adminNotePlaceholder}
              {...register("adminNote")}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={update.isPending || !formState.isDirty}
            >
              {update.isPending && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {dict.messages.saveNote}
            </Button>
          </form>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          {message.status !== UpdateContactMessageDtoStatus.IN_PROGRESS && (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                setStatus(UpdateContactMessageDtoStatus.IN_PROGRESS)
              }
            >
              {dict.messages.markInProgress}
            </Button>
          )}
          {message.status !== UpdateContactMessageDtoStatus.READ && (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() => setStatus(UpdateContactMessageDtoStatus.READ)}
            >
              {dict.messages.markRead}
            </Button>
          )}
          {message.status !== UpdateContactMessageDtoStatus.ARCHIVED && (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() => setStatus(UpdateContactMessageDtoStatus.ARCHIVED)}
            >
              {dict.messages.markArchived}
            </Button>
          )}
          {message.status !== UpdateContactMessageDtoStatus.NEW && (
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() => setStatus(UpdateContactMessageDtoStatus.NEW)}
            >
              {dict.messages.markNew}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
