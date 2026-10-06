"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import type { AdminPickupPointDto } from "@/entities/delivery";

const t = dict.pickupPoints;

interface PickupPointDeleteDialogProps {
  /** The point being asked about; `null` = closed. */
  point: AdminPickupPointDto | null;
  onCancel: () => void;
  onDelete: (point: AdminPickupPointDto) => void;
  onDeactivate: (point: AdminPickupPointDto) => void;
}

/**
 * «Видалити точку …?» (ДН-1.6). Deleting is allowed and safe — orders keep a
 * snapshot of the name and address — but it is not the move for a point that
 * merely closed, so the dialog says what is lost (the link from N orders) and
 * offers deactivating instead. That alternative is not offered for a point
 * that is already inactive: there it would do nothing.
 *
 * `role="alertdialog"` with the initial focus on «Скасувати», as every
 * confirmation here (`alert-dialog.tsx`).
 */
export function PickupPointDeleteDialog({
  point,
  onCancel,
  onDelete,
  onDeactivate,
}: PickupPointDeleteDialogProps) {
  return (
    <AlertDialog
      open={point !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      {point ? (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="leading-snug">
              {t.deleteTitle(point.name)}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>{t.deleteOrders(point.ordersCount)}</p>
                {/* «deactivate it instead» is advice only for a point that
                    is still active — the button beside it hides likewise. */}
                {point.isActive ? <p>{t.deleteAdvice}</p> : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
            {point.isActive ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onDeactivate(point)}
              >
                {t.deleteInstead}
              </Button>
            ) : null}
            <AlertDialogAction
              variant="destructive"
              onClick={() => onDelete(point)}
            >
              {t.deleteAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
