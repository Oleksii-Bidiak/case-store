"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ReviewHiddenReason,
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerHideAuthor,
  useAdminReviewControllerUnhideAuthor,
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
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { apiErrorMessage } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.reviews;

interface ReviewAuthorModerationActionProps {
  /** The account whose whole contribution is at stake. */
  userId: string;
  /** Shown in the confirm copy — the email local-part, as the queue displays it. */
  author: string;
  /**
   * Why this row's author contribution is withdrawn, straight from the server
   * (`AdminReviewEntity.hiddenReason`), or `null` when it is not — see the
   * header note for which value offers which action.
   */
  hiddenReason: ReviewHiddenReason | null;
}

/**
 * Withdraw (or restore) one account's entire review contribution — TASK-446.
 *
 * ── Why it asks first ────────────────────────────────────────────────────────
 * This is the only action on the moderation screen whose blast radius is not the
 * row it sits in. `POST …/authors/:userId/hide` stamps `hiddenAt` and clears
 * `ratingVisible` on EVERY review that account ever wrote, on every product, in
 * one request. The button lives in a row that is about one product and is
 * surrounded by controls that act on one review, so the confirm copy has to say
 * «ВСІ» and «на всіх товарах» in as many words — the surrounding context is
 * actively misleading about what is about to happen.
 *
 * ── Which action a row offers, from `hiddenReason` (TASK-1004) ──────────────
 * `AdminReviewEntity` carries `hiddenAt` and `hiddenReason` since TASK-596/599,
 * so the choice is read, not inferred. It used to be inferred from
 * `ratingVisible`, which folds a moderator's hide and an unconfirmed email into
 * one boolean — so every unverified author was offered «повернути» for a hide
 * that never happened.
 *
 *   - `null` — nothing is withdrawn: offer «приховати». An unconfirmed email
 *     does not change that; the rating not counting is the email gate, and no
 *     moderator action lifts it.
 *   - `MODERATOR` — a moderator withdrew it: offer «повернути», the only lever
 *     that lifts it. The server re-asks the email gate on restore, so the copy
 *     promises the ratings return ONLY if the email is confirmed.
 *   - `BAN` / `DELETED` — the ACCOUNT is switched off or deleted, and the rows
 *     went with it. Offer NOTHING: «повернути» here would be lifted by the
 *     wrong hand (`ReviewService.unhideAuthor` only lifts what its own reason
 *     put down — an un-ban restores a ban, nothing restores a deletion), and
 *     «приховати» would stack a moderator verdict under a hold the operator
 *     cannot see from this row. The badge beside the rating already names the
 *     reason; the remedy lives on the customer card, not here.
 */
export function ReviewAuthorModerationAction({
  userId,
  author,
  hiddenReason,
}: ReviewAuthorModerationActionProps) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [isOpen, setOpen] = useState(false);
  const hide = useAdminReviewControllerHideAuthor();
  const unhide = useAdminReviewControllerUnhideAuthor();

  if (!can(PERM.reviewsModerate)) {
    return null;
  }

  // Held by the account itself (ban / deletion) — see the header note. Loose
  // `!= null`: an absent field reads as "not withdrawn", like the API's null.
  if (hiddenReason != null && hiddenReason !== ReviewHiddenReason.MODERATOR) {
    return null;
  }

  const isRestore = hiddenReason === ReviewHiddenReason.MODERATOR;
  const mutation = isRestore ? unhide : hide;

  const handleConfirm = () => {
    mutation.mutate(
      { userId },
      {
        onSuccess: (response) => {
          // TASK-248 contract — the queue's rows and the needs-action counters
          // both move when an account's contribution is withdrawn.
          void queryClient.invalidateQueries({
            queryKey: getAdminReviewControllerListQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
          });
          // The server's own count, not our guess: the author's contribution
          // reaches well past the rows this page happens to be showing, so "3"
          // here is the only report the operator gets of how far it went.
          const count = response.data.updatedCount;
          toast.success(
            isRestore
              ? d.unhideAuthorSuccess(count)
              : d.hideAuthorSuccess(count),
          );
          setOpen(false);
        },
        onError: (error) =>
          toast.error(
            apiErrorMessage(error) ??
              (isRestore ? d.unhideAuthorError : d.hideAuthorError),
          ),
      },
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          isRestore ? undefined : "text-destructive hover:text-destructive"
        }
        onClick={() => setOpen(true)}
      >
        {isRestore ? d.unhideAuthorAction : d.hideAuthorAction}
      </Button>

      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isRestore ? d.unhideAuthorTitle : d.hideAuthorTitle}
            </DialogTitle>
            <DialogDescription>
              {isRestore
                ? d.unhideAuthorDescription(author)
                : d.hideAuthorDescription(author)}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              variant={isRestore ? "default" : "destructive"}
              onClick={handleConfirm}
              disabled={mutation.isPending}
            >
              {mutation.isPending && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {isRestore ? d.unhideAuthorConfirm : d.hideAuthorConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
