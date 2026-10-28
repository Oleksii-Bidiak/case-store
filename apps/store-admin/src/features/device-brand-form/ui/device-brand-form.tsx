"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  FieldError,
  Input,
  Label,
  ReadOnlyBool,
  ReadOnlyField,
  ReadOnlyFields,
  ReadOnlyNotice,
  Switch,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  deviceBrandSchema,
  type DeviceBrandFormInput,
  type DeviceBrandFormValues,
} from "../model/device-brand-schema";

const f = dict.deviceBrandForm;

interface DeviceBrandFormProps {
  /** Entity id (edit mode) — drives the forms.md Rule 2b id-keyed reset. */
  id?: string;
  defaultValues?: Partial<DeviceBrandFormInput>;
  onSubmit: (values: DeviceBrandFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  /** «Скасувати» — the dialog closes. */
  onCancel: () => void;
  /**
   * View-only (TASK-667 template): the values as text, the reason in one line,
   * «Закрити» instead of the buttons. Reads only `defaultValues`.
   */
  readOnly?: boolean;
  /** A line above the buttons — «Моделей: 28 · Перейти до моделей →». */
  footer?: ReactNode;
}

const EMPTY_VALUES: DeviceBrandFormInput = {
  name: "",
  slug: "",
  isActive: true,
};

type FieldName = keyof DeviceBrandFormInput;
const errorId = (field: FieldName) => `device-brand-${field}-error`;

/**
 * The device-brand form — three fields, so it lives in a dialog over the grid
 * (wave 198, DevicesProposal ПР6; owner decision for short forms): «Назва»
 * (required), «Адреса в посиланні (slug)» with what blank means, and
 * «Показувати на сайті» as a Switch with its consequence. Errors sit under the
 * fields with `aria-invalid`. TASK-295: no order field — the grid IS the order.
 *
 * Without `devices:write` the same dialog shows the values as text instead.
 */
export function DeviceBrandForm({
  readOnly = false,
  ...props
}: DeviceBrandFormProps) {
  if (readOnly) {
    const values = { ...EMPTY_VALUES, ...props.defaultValues };
    return (
      <div className="flex flex-col gap-4">
        <ReadOnlyNotice>{dict.readOnlyView.notices.devices}</ReadOnlyNotice>
        <ReadOnlyFields>
          <ReadOnlyField label={f.name}>{values.name}</ReadOnlyField>
          <ReadOnlyField label={f.slug} mono>
            {values.slug}
          </ReadOnlyField>
          <ReadOnlyField label={f.active}>
            <ReadOnlyBool
              value={values.isActive ?? true}
              on={dict.devices.statusActive}
              off={dict.devices.statusInactive}
            />
          </ReadOnlyField>
        </ReadOnlyFields>
        {props.footer}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={props.onCancel}>
            {dict.common.close}
          </Button>
        </div>
      </div>
    );
  }
  return <EditableDeviceBrandForm {...props} />;
}

function EditableDeviceBrandForm({
  id,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = f.submit,
  onCancel,
  footer,
}: Omit<DeviceBrandFormProps, "readOnly">) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DeviceBrandFormInput, unknown, DeviceBrandFormValues>({
    resolver: zodResolver(deviceBrandSchema),
    // Create: the synchronous seed. Edit: re-seeded below by the id.
    defaultValues: id ? EMPTY_VALUES : { ...EMPTY_VALUES, ...defaultValues },
  });

  // forms.md Rule 2b: re-seed only when navigating to a different entity.
  useEffect(() => {
    if (id && defaultValues) {
      reset({ ...EMPTY_VALUES, ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (event.target !== event.currentTarget) return;
    void handleSubmit(onSubmit)(event);
  };

  const a11y = (field: FieldName, hintId?: string) => {
    const describedBy = [errors[field] ? errorId(field) : undefined, hintId]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="device-brand-name" required>
          {f.name}
        </Label>
        <Input
          id="device-brand-name"
          aria-required="true"
          {...a11y("name")}
          {...register("name")}
        />
        <FieldError id={errorId("name")}>{errors.name?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="device-brand-slug">{f.slug}</Label>
        <Input
          id="device-brand-slug"
          placeholder={f.slugPlaceholder}
          {...a11y("slug", "device-brand-slug-hint")}
          {...register("slug")}
        />
        <FieldError id={errorId("slug")}>{errors.slug?.message}</FieldError>
        <p
          id="device-brand-slug-hint"
          className="text-xs text-muted-foreground"
        >
          {f.slugHint}
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor="device-brand-active">{f.active}</Label>
          <p
            id="device-brand-active-hint"
            className="text-xs text-muted-foreground"
          >
            {f.activeHint}
          </p>
        </div>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              id="device-brand-active"
              checked={field.value ?? true}
              onCheckedChange={field.onChange}
              aria-describedby="device-brand-active-hint"
            />
          )}
        />
      </div>

      {footer}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
