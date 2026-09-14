"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
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
   * Whether this author's rating is currently counting. The ONLY signal the
   * moderation row carries about the hide — see the header note.
   */
  ratingVisible: boolean;
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
 * ── What «hidden» is inferred from, and why that is a compromise ─────────────
 * `AdminReviewEntity` does NOT expose `hiddenAt`, so the panel cannot actually
 * tell a moderator's hide from an unconfirmed email address: `ratingVisible`
 * folds both gates into one boolean and the moderation row carries nothing else.
 * We therefore offer the inverse whenever the rating is not counting, which is a
 * SUPERSET of "hidden by a moderator".
 *
 * That over-offer is safe in the only direction that matters. Restoring an
 * author who was never hidden is idempotent — `ReviewService.unhideAuthor`
 * re-asks the email gate and writes `hiddenAt: null` (already null) plus
 * whatever visibility the address earns — so the worst case is a no-op, never a
 * counting rating handed to an unproven address. The copy is worded to match:
 * it promises the ratings return ONLY if the email is confirmed.
 */
export function ReviewAuthorModerationAction({
  userId,
  author,
  ratingVisible,
}: ReviewAuthorModerationActionProps) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [isOpen, setOpen] = useState(false);
  const hide = useAdminReviewControllerHideAuthor();
  const unhide = useAdminReviewControllerUnhideAuthor();

  if (!can(PERM.reviewsModerate)) {
    return null;
  }

  const isRestore = !ratingVisible;
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
