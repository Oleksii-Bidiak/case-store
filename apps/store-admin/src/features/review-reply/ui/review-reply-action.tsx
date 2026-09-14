"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
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
 *
 * ── Why the form is a child, not this component (TASK-598) ───────────────────
 * The seeding above is only half a contract: something has to end the draft's
 * life. Holding the form state here did not, so see {@link ReplyForm} for what
 * an abandoned draft cost and why the dialog's lifetime is the answer.
 */
export function ReviewReplyAction({
  review,
  onReplied,
}: ReviewReplyActionProps) {
  const { can } = useAuth();
  const [isOpen, setOpen] = useState(false);

  const existing = review.reply?.body ?? "";

  if (!can(PERM.reviewsWrite)) {
    return null;
  }

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

          {/* The form lives exactly as long as the dialog is open — see the
              component's docblock for why that lifetime is the fix. */}
          {isOpen && (
            <ReplyForm
              review={review}
              existing={existing}
              onDone={() => setOpen(false)}
              onReplied={onReplied}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The dialog's form, mounted only while the dialog is open (TASK-598).
 *
 * `keepDirtyValues` is what lets a refetch land under a half-typed answer without
 * eating it, and it works by holding a DIRTY field against every later `values`.
 * Nothing clears that flag when the dialog closes: the form state lived in the
 * parent, so a draft abandoned once was held for the life of the row while the
 * button label and the replace-warning kept reading the SERVER value. An operator
 * who typed, pressed Escape, and came back after a colleague had answered saw
 * their own old words under "edit the reply", read that saving replaces the
 * published answer, and overwrote a reply they never saw.
 *
 * Tying the form's lifetime to the dialog is the fix, rather than a `reset()` on
 * the way out: closing disposes the form state, so the next open genuinely starts
 * from the server. This is NOT the `key`-remount that `forms.md` warns about — the
 * remount happens on open and close, never under the typing that Rule 2a exists
 * to protect, and while open the `values` sync works exactly as before.
 */
function ReplyForm({
  review,
  existing,
  onDone,
  onReplied,
}: {
  review: AdminReviewEntity;
  existing: string;
  onDone: () => void;
  onReplied?: () => void;
}) {
  const queryClient = useQueryClient();
  const reply = useAdminReviewControllerReply();

  const { register, handleSubmit, control } = useForm<ReplyFormValues>({
    values: { body: existing },
    resetOptions: { keepDirtyValues: true },
  });

  // `useWatch`, not the `watch()` returned by `useForm`. They subscribe to the
  // same field, but `watch` is a plain function the React Compiler cannot reason
  // about, so its presence makes the compiler skip memoizing this entire
  // component — for one boolean that disables one button.
  const body = useWatch({ control, name: "body" });

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
          onDone();
          onReplied?.();
        },
        onError: (error) => toast.error(apiErrorMessage(error) ?? d.replyError),
      },
    );
  };

  const fieldId = `review-reply-${review.id}`;
  const isEmpty = !body?.trim();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {/* What is being answered, verbatim. Answering from memory after closing
          the row is how a reply ends up addressing the wrong complaint. */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {d.replyReviewLabel}
        </span>
        <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
          {review.comment || d.noComment}
        </p>
      </div>

      {existing && <p className="text-xs text-warning">{d.replyReplaceNote}</p>}

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
          onClick={onDone}
          disabled={reply.isPending}
        >
          {dict.common.cancel}
        </Button>
        <Button type="submit" disabled={reply.isPending || isEmpty}>
          {reply.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {d.replySubmit}
        </Button>
      </DialogFooter>
    </form>
  );
}
