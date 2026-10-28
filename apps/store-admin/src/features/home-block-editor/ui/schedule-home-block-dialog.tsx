"use client";

/**
 * «Запланувати показ…» from a block's row menu (plan 186, TASK-662, ДН-4.4/4.7) —
 * every block, singletons included, can be hidden until a moment and then show up
 * by itself on its own place: `PUT /admin/home-blocks/:id` with
 * `{ status: SCHEDULED, scheduledAt }`. The publish cron flips it, the same one the
 * banners use.
 *
 * The field is seeded once per opening (forms.md Rule 1a) — from the block's own
 * `scheduledAt` when it already is scheduled.
 */

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminHomeBlockControllerFindAllQueryKey,
  homeBlockLabel,
  useAdminHomeBlockControllerUpdate,
  type HomeBlockEntity,
} from "@/entities/home-block";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  Input,
  Label,
} from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import {
  formatDateTime,
  fromKyivDateTimeLocal,
  toKyivDateTimeLocal,
} from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { scheduleError } from "../model/home-block-form";

const t = dict.homeBlockDialog;

export interface ScheduleHomeBlockDialogProps {
  /** The block to schedule; `null` closes the dialog. */
  block: HomeBlockEntity | null;
  onOpenChange: (open: boolean) => void;
}

export function ScheduleHomeBlockDialog({
  block,
  onOpenChange,
}: ScheduleHomeBlockDialogProps) {
  const queryClient = useQueryClient();
  const update = useAdminHomeBlockControllerUpdate();

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const blockId = block?.id ?? null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (blockId !== seededFor) {
    setSeededFor(blockId);
    setValue(
      block?.status === "SCHEDULED" && block.scheduledAt
        ? toKyivDateTimeLocal(block.scheduledAt)
        : "",
    );
    setError(null);
  }

  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const name = block ? homeBlockLabel(block) : "";

  const handleSubmit = async () => {
    if (!block) return;
    const found = scheduleError(value);
    setError(found);
    if (found) return;
    const at = fromKyivDateTimeLocal(value);
    if (!at) return;
    try {
      await update.mutateAsync({
        id: block.id,
        data: { status: "SCHEDULED", scheduledAt: at.toISOString() },
      });
    } catch {
      toast.error(t.toastFailed);
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: getAdminHomeBlockControllerFindAllQueryKey(),
    });
    toast.success(t.toastScheduled(name, formatDateTime(at)));
    onOpenChange(false);
  };

  return (
    <Dialog open={block !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.scheduleTitle(name)}</DialogTitle>
          <DialogDescription>{t.scheduleDescription}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>
              {t.scheduledAtLabel}
              <span aria-hidden="true"> *</span>
            </Label>
            <Input
              id={inputId}
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={cn(hintId, error && errorId)}
            />
            <p id={hintId} className="text-xs text-muted-foreground">
              {t.scheduledAtHint}
            </p>
            <FieldError id={errorId}>{error}</FieldError>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t.cancel}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {t.scheduleSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
