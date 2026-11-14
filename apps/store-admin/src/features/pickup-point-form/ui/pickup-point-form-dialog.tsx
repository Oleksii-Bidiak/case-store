"use client";

import { useEffect, useId, type FormEvent, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
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
  Switch,
} from "@/shared/ui";
import { PhoneInput } from "@/shared/ui/phone-input";
import { dict } from "@/shared/config";
import { apiErrorMessage, apiErrorStatus } from "@/shared/lib";
import { applyServerFieldErrors } from "@/shared/lib/form-errors";
import {
  getListAdminPickupPointsQueryKey,
  useCreatePickupPoint,
  useUpdatePickupPoint,
  type AdminPickupPointDto,
} from "@/entities/delivery";
import {
  EMPTY_PICKUP_POINT,
  PICKUP_POINT_FIELD_MAP,
  PICKUP_POINT_LIMITS,
  mapPickupPointToForm,
  pickupPointFormToDto,
  pickupPointSchema,
  type PickupPointFormValues,
} from "../model/pickup-point-schema";

const t = dict.pickupPointForm;

export interface PickupPointFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The point to edit; `null` = a new one. */
  point: AdminPickupPointDto | null;
}

/**
 * Add / edit a pickup point (TASK-645, mockup ДН-1.4 / ДН-1.5): one dialog for
 * both, the title says which. Centred at 512 px from `md`, full screen below
 * it (the shared `DialogContent` does that), where the footer stacks with
 * «Зберегти» on top.
 *
 * ── Seeding (forms.md Rule 2b) ──────────────────────────────────────────────
 * The form is seeded by `reset()` when the dialog OPENS, keyed to the point's
 * id — never `defaultValues` from the prop and never a `key` remount. A
 * background refetch of the list while the dialog is open (another tab, the
 * order count moving) keeps the same id, so the operator's edits survive it.
 *
 * ── Why the submit stops propagating ────────────────────────────────────────
 * The dialog is rendered from inside the delivery settings `<form>`. Its own
 * `<form>` sits in a portal, so the BROWSER submits only this one — but React
 * bubbles synthetic events along the component tree, not the DOM, and the
 * outer form's `onSubmit` would run (and validate, and save the settings) on
 * every point saved here.
 */
export function PickupPointFormDialog({
  open,
  onOpenChange,
  point,
}: PickupPointFormDialogProps) {
  const queryClient = useQueryClient();
  const create = useCreatePickupPoint();
  const update = useUpdatePickupPoint();
  const isPending = create.isPending || update.isPending;
  const ids = useId();

  const form = useForm<PickupPointFormValues>({
    resolver: zodResolver(pickupPointSchema),
    // A static constant, not the prop: the point is put in by `reset()` below.
    defaultValues: EMPTY_PICKUP_POINT,
  });
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;

  const pointId = point?.id;
  useEffect(() => {
    if (!open) return;
    reset(point ? mapPickupPointToForm(point) : EMPTY_PICKUP_POINT);
    // Keyed to the id (and to opening): a refetch of the same point while the
    // dialog is open must not overwrite what the operator has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pointId]);

  const onValid = (values: PickupPointFormValues) => {
    const data = pickupPointFormToDto(values);
    const onSuccess = (message: string) => () => {
      // The table, the «немає активних точок» warning and the checkout preview
      // all read this one list.
      void queryClient.invalidateQueries({
        queryKey: getListAdminPickupPointsQueryKey(),
      });
      toast.success(message);
      onOpenChange(false);
    };
    const onError = (error: unknown) => {
      // TASK-1984 Rule 6b: a 400 lands under the field it is about; only a
      // remainder no field can take becomes the toast.
      if (apiErrorStatus(error) === 400) {
        const { mapped, unmapped } = applyServerFieldErrors(
          error,
          setError,
          PICKUP_POINT_FIELD_MAP,
        );
        if (mapped.length > 0 && unmapped.length === 0) return;
        // A refusal no field takes: the server's words say what to fix.
        toast.error(apiErrorMessage(error) ?? t.toastSaveFailed);
        return;
      }
      toast.error(t.toastSaveFailed);
    };
    if (point) {
      update.mutate(
        { id: point.id, data },
        { onSuccess: onSuccess(t.toastUpdated), onError },
      );
    } else {
      create.mutate(
        { data },
        { onSuccess: onSuccess(t.toastCreated), onError },
      );
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.stopPropagation();
    void handleSubmit(onValid)(event);
  };

  const fieldId = (name: keyof PickupPointFormValues) => `${ids}-${name}`;
  const describe = (
    name: keyof PickupPointFormValues,
    hasHint: boolean,
  ): string | undefined => {
    const parts = [
      errors[name] ? `${fieldId(name)}-error` : null,
      hasHint ? `${fieldId(name)}-hint` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : undefined;
  };

  const textField = (
    name: Exclude<keyof PickupPointFormValues, "isActive">,
    label: string,
    options: {
      required?: boolean;
      hint?: string;
      type?: "text" | "tel" | "url";
      placeholder?: string;
      autoComplete?: string;
    } = {},
  ): ReactNode => {
    const id = fieldId(name);
    const error = errors[name]?.message;
    const common = {
      id,
      maxLength: PICKUP_POINT_LIMITS[name],
      autoComplete: options.autoComplete ?? "off",
      placeholder: options.placeholder,
      "aria-required": options.required ? ("true" as const) : undefined,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describe(name, Boolean(options.hint)),
    };
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={id} required={options.required}>
          {label}
        </Label>
        {options.type === "tel" ? (
          // Rule 5b: the DTO's phone is `@IsInternationalPhone` — no +380
          // mask, letters dropped as typed, the number kept as written.
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <PhoneInput
                {...common}
                rule="international"
                ref={field.ref}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        ) : (
          <Input
            {...common}
            type={options.type ?? "text"}
            inputMode={options.type === "url" ? "url" : undefined}
            {...register(name)}
          />
        )}
        <FieldError id={`${id}-error`}>{error}</FieldError>
        {options.hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {options.hint}
          </p>
        ) : null}
      </div>
    );
  };

  const activeId = fieldId("isActive");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{point ? t.editTitle : t.createTitle}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {textField("name", t.name, { required: true, hint: t.nameHint })}
          <div className="grid gap-4 sm:grid-cols-2">
            {textField("city", t.city, { required: true })}
            {textField("phone", t.phone, { type: "tel" })}
          </div>
          {textField("address", t.address, { required: true })}
          {textField("workingHours", t.workingHours, {
            hint: t.workingHoursHint,
          })}
          {textField("mapUrl", t.mapUrl, {
            type: "url",
            placeholder: t.mapUrlPlaceholder,
            hint: t.mapUrlHint,
          })}

          <div className="flex flex-col gap-1.5">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <Label htmlFor={activeId} className="font-normal">
                {t.isActive}
              </Label>
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch
                    id={activeId}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-describedby={`${activeId}-hint`}
                    className="relative after:absolute after:-inset-3"
                  />
                )}
              />
            </div>
            <p
              id={`${activeId}-hint`}
              className="text-xs text-muted-foreground"
            >
              {t.snapshotHint}
            </p>
          </div>

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {dict.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? dict.common.saving : t.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
