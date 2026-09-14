"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerReply,
  type AdminReviewEntity,
} from "@/entities/review";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.reviews;

/** The dialog's single field. */
interface ReplyFormValues {
  body: string;
}

interface ReviewReplyActionProps {
  /** The moderation row this answer belongs to. */
  review: AdminReviewEntity;
  /** Ran after the server confirms the write. */
  onReplied?: () => void;
}

/**
 * ReviewReplyAction — the shop's public answer to one review (TASK-446).
 *
 * ── Why its own permission ───────────────────────────────────────────────────
 * `reviews:write`, not `reviews:moderate`. Deciding what stays on the site and
 * SPEAKING as the shop to every visitor are different jobs, and the backend
 * guards them separately (`@RequirePermission('reviews:write')`).
 *
 * The key is brand new and has NO backfill, so on a fresh deploy nobody but the
 * owner holds it and this button is invisible for every MANAGER until someone
 * ticks the box on the permissions screen. That is the intended state. Granting
 * it client-side would hand out a control whose only possible outcome is a 403.
 *
 * ── Why the textarea is seeded, and seeded THIS way ──────────────────────────
 * `POST …/reply` is an UPSERT: answering again REPLACES the published answer.
 * So the field opens holding what is already live — editing an answer is an
 * edit, not retyping it from memory — and a line of copy says the replacement
 * is coming before the operator commits to it.
 *
 * The seed is `values` + `keepDirtyValues` (forms.md Rule 2a) rather than
 * `useState(prop)` or a `key` remount, because `review` is async server data
 * that refetches UNDER the open dialog: every mutation on this screen
 * invalidates the moderation list, so the row object is replaced mid-typing. A
 * `useState` seed would ignore the new data; a `key` remount would throw away a
 * half-written answer and the focus with it. `values` re-syncs the untouched
 * field and leaves a dirty one alone.
 */
export function ReviewReplyAction({
  review,
  onReplied,
}: ReviewReplyActionProps) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [isOpen, setOpen] = useState(false);
  const reply = useAdminReviewControllerReply();

  const existing = review.reply?.body ?? "";

  const { register, handleSubmit, watch } = useForm<ReplyFormValues>({
    values: { body: existing },
    resetOptions: { keepDirtyValues: true },
  });

  // Hooks first, gate after — `can()` must not change the hook order between
  // renders when the permission list arrives.
  if (!can(PERM.reviewsWrite)) {
    return null;
  }

  const onSubmit = ({ body }: ReplyFormValues) => {
    const trimmed = body.trim();
    // The DTO's `@MinLength(1)` would refuse it anyway; not spending a round
    // trip to find that out, and never publishing an empty answer.
    if (!trimmed) return;

    reply.mutate(
      { id: review.id, data: { body: trimmed } },
      {
        onSuccess: () => {
          // TASK-248 contract: the list carries `reply`, so it must refetch for
          // the row to stop offering a fresh answer; the needs-action payload
          // goes with it because every review write on this screen shares one
          // cache entry with the sidebar badge.
          void queryClient.invalidateQueries({
            queryKey: getAdminReviewControllerListQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
          });
          toast.success(d.replySuccess);
          setOpen(false);
          onReplied?.();
        },
        onError: (error) => toast.error(apiErrorMessage(error) ?? d.replyError),
      },
    );
  };

  const fieldId = `review-reply-${review.id}`;
  const isEmpty = !watch("body")?.trim();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {existing ? d.replyEditAction : d.replyAction}
      </Button>

      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{d.replyTitle}</DialogTitle>
            <DialogDescription>
              {d.replyDescription(review.productName)}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            {/* What is being answered, verbatim. Answering from memory after
                closing the row is how a reply ends up addressing the wrong
                complaint. */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {d.replyReviewLabel}
              </span>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
                {review.comment || d.noComment}
              </p>
            </div>

            {existing && (
              <p className="text-xs text-warning">{d.replyReplaceNote}</p>
            )}

            <div className="flex flex-col gap-2">
              <label
                htmlFor={fieldId}
                className="text-xs font-medium text-muted-foreground"
              >
                {d.replyLabel}
              </label>
              <Textarea
                id={fieldId}
                rows={4}
                maxLength={1000}
                placeholder={d.replyPlaceholder}
                {...register("body")}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={reply.isPending}
              >
                {dict.common.cancel}
              </Button>
              <Button type="submit" disabled={reply.isPending || isEmpty}>
                {reply.isPending && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {d.replySubmit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
