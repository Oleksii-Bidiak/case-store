"use client";

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Controller,
  useForm,
  useWatch,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Lock, Package, Store, Truck } from "lucide-react";
import { toast } from "@/shared/ui/toast";
import {
  Callout,
  FieldError,
  FormActionsBar,
  FormAlert,
  Input,
  Label,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  getGetDeliverySettingsQueryKey,
  useUpdateDeliverySettings,
  type DeliverySettingDto,
} from "@/entities/delivery";
import {
  DELIVERY_FIELD_ORDER,
  DELIVERY_SECTIONS,
  deliverySettingsFormToDto,
  deliverySettingsSchema,
  mapSettingsToForm,
  type DeliverySectionKey,
  type DeliverySettingsFormValues,
} from "../model/delivery-settings-schema";
import { buildDeliveryPreview, courierTitle } from "../model/delivery-preview";
import { DELIVERY_FIELD_IDS } from "./delivery-field-ids";
import { DeliveryMethodCard } from "./delivery-method-card";
import { DeliveryPreviewPanel } from "./delivery-preview-panel";
import { NpSenderFields } from "./np-sender-fields";

const t = dict.deliverySettingsForm;

const SECTION_TITLES: Record<DeliverySectionKey, string> = {
  np: t.npTitle,
  pickup: t.pickupTitle,
  courier: t.courierTitle,
  other: t.otherTitle,
};

interface DeliverySettingsFormProps {
  settings: DeliverySettingDto;
  /**
   * Active pickup points — PICKUP reaches the checkout only with at least one.
   * `null` while the list is unknown (loading / failed): then neither the
   * «немає активних точок» warning nor the preview row is shown.
   */
  activePickupPoints: number | null;
  /**
   * The pickup card's own content — the point list (TASK-645). A slot, not an
   * import: the point editor is a feature of its own, and features do not
   * import each other; the widget composes them.
   */
  pickupPoints?: ReactNode;
}

/**
 * /settings/delivery (TASK-644, mockup Д-н2 SettingsDelivery ДН-1.1/1.2,
 * 1.7, 1.8): which of the four methods the checkout offers, where NP parcels
 * leave from, what the courier costs — and, beside the cards, what a buyer
 * would see for these values before they are saved.
 *
 * ── Why `values` + `keepDirtyValues` (forms.md Rule 2a) ─────────────────────
 * The settings row is a singleton with no id in its DTO, so there is no entity
 * identity to key a Rule-2b reset to. `values` keeps the pristine fields in
 * step with a background refetch while the operator's edits survive it.
 *
 * Its catch, measured in RHF 7.83: `resetOptions` is merged into EVERY later
 * `reset()`, so the form's own resets — «Скасувати зміни» and the post-save
 * baseline — pass `keepDirtyValues: false` explicitly, or they would keep the
 * very edits they exist to drop.
 *
 * ── Why the branch label lives outside the DTO ──────────────────────────────
 * The API stores `senderWarehouseRef` without a name. The names this form has
 * seen (picked, or found in the directory list) are remembered per ref and fed
 * into `values`, so a refetch after saving does not blank the field.
 */
export function DeliverySettingsForm({
  settings,
  activePickupPoints,
  pickupPoints,
}: DeliverySettingsFormProps) {
  const queryClient = useQueryClient();
  const update = useUpdateDeliverySettings();
  const ids = useId();

  const [warehouseLabels, setWarehouseLabels] = useState<
    Record<string, string>
  >({});
  const rememberWarehouse = useCallback((ref: string, label: string) => {
    setWarehouseLabels((labels) =>
      labels[ref] === label ? labels : { ...labels, [ref]: label },
    );
  }, []);

  const values = useMemo(
    () =>
      mapSettingsToForm(
        settings,
        warehouseLabels[settings.senderWarehouseRef ?? ""] ?? "",
      ),
    [settings, warehouseLabels],
  );

  const form = useForm<DeliverySettingsFormValues>({
    resolver: zodResolver(deliverySettingsSchema),
    values,
    resetOptions: { keepDirtyValues: true },
    // Focus is moved by `focusFirstError`: the city and branch pickers are
    // `Combobox`es, which take an id but no RHF ref.
    shouldFocusError: false,
  });
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = form;

  const live = useWatch({ control });
  const flags = {
    npEnabled: live.npEnabled ?? false,
    pickupEnabled: live.pickupEnabled ?? false,
    courierEnabled: live.courierEnabled ?? false,
    otherEnabled: live.otherEnabled ?? false,
  };
  const allOff =
    !flags.npEnabled &&
    !flags.pickupEnabled &&
    !flags.courierEnabled &&
    !flags.otherEnabled;

  const previewRows = buildDeliveryPreview(
    {
      ...flags,
      courierCityName: live.courierCityName ?? "",
      courierPrice: live.courierPrice ?? "",
      courierFreeFrom: live.courierFreeFrom ?? "",
    },
    activePickupPoints,
  );

  const dirtyKeys = (
    Object.keys(DELIVERY_SECTIONS) as DeliverySectionKey[]
  ).filter((section) =>
    DELIVERY_SECTIONS[section].some((field) => dirtyFields[field]),
  );
  const allSections = Object.keys(DELIVERY_SECTIONS).length;
  const dirtySections =
    dirtyKeys.length === allSections
      ? [t.dirtyAll(allSections)]
      : dirtyKeys.map((section) => SECTION_TITLES[section]);

  const focusFirstError = (
    fieldErrors: FieldErrors<DeliverySettingsFormValues>,
  ) => {
    const first = DELIVERY_FIELD_ORDER.find((name) => fieldErrors[name]);
    if (first) document.getElementById(DELIVERY_FIELD_IDS[first])?.focus();
  };

  const onSubmit = (submitted: DeliverySettingsFormValues) => {
    if (allOff) return;
    update.mutate(
      { data: deliverySettingsFormToDto(submitted) },
      {
        onSuccess: (response) => {
          const saved = response.data;
          const label = submitted.senderWarehouseName;
          if (saved.senderWarehouseRef && label) {
            rememberWarehouse(saved.senderWarehouseRef, label);
          }
          // The new baseline is what the server stored: the bar empties and
          // «Скасувати зміни» returns here, not to the pre-save values.
          reset(mapSettingsToForm(saved, label), { keepDirtyValues: false });
          void queryClient.invalidateQueries({
            queryKey: getGetDeliverySettingsQueryKey(),
          });
          toast.success(dict.deliverySettings.toastUpdated);
        },
        onError: () => {
          toast.error(dict.deliverySettings.toastUpdateFailed);
        },
      },
    );
  };

  const discard = () => reset(undefined, { keepDirtyValues: false });

  const fid = DELIVERY_FIELD_IDS;
  const courierCityHintId = `${fid.courierCityName}-hint`;
  const courierCityErrorId = `${fid.courierCityName}-error`;
  const priceErrorId = `${fid.courierPrice}-error`;
  const freeFromHintId = `${fid.courierFreeFrom}-hint`;
  const freeFromErrorId = `${fid.courierFreeFrom}-error`;
  const allOffId = `${ids}-all-off`;

  return (
    <form
      onSubmit={handleSubmit(onSubmit, focusFirstError)}
      className="flex flex-col gap-6"
      noValidate
    >
      {allOff ? (
        <FormAlert id={allOffId}>
          <strong className="font-semibold">{t.allOffTitle}</strong>{" "}
          {t.allOffBody}
        </FormAlert>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Controller
            control={control}
            name="npEnabled"
            render={({ field }) => (
              <DeliveryMethodCard
                switchId="delivery-np-enabled"
                icon={Package}
                title={t.npTitle}
                description={t.npDescription}
                enabled={field.value}
                onEnabledChange={field.onChange}
              >
                <NpSenderFields
                  form={form}
                  onWarehouseLabel={rememberWarehouse}
                />
              </DeliveryMethodCard>
            )}
          />

          <Controller
            control={control}
            name="pickupEnabled"
            render={({ field }) => (
              <DeliveryMethodCard
                switchId="delivery-pickup-enabled"
                icon={Store}
                title={t.pickupTitle}
                description={t.pickupDescription}
                enabled={field.value}
                onEnabledChange={field.onChange}
              >
                {activePickupPoints === 0 || pickupPoints ? (
                  <>
                    {activePickupPoints === 0 ? (
                      <Callout variant="warning">{t.pickupNoActive}</Callout>
                    ) : null}
                    {pickupPoints}
                  </>
                ) : null}
              </DeliveryMethodCard>
            )}
          />

          <Controller
            control={control}
            name="courierEnabled"
            render={({ field }) => (
              <DeliveryMethodCard
                switchId="delivery-courier-enabled"
                icon={Truck}
                title={t.courierTitle}
                description={t.courierDescription}
                enabled={field.value}
                onEnabledChange={field.onChange}
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={fid.courierCityName} required>
                      {t.courierCity}
                    </Label>
                    <Input
                      id={fid.courierCityName}
                      type="text"
                      aria-required="true"
                      placeholder={t.courierCityPlaceholder}
                      aria-invalid={errors.courierCityName ? true : undefined}
                      aria-describedby={
                        errors.courierCityName
                          ? `${courierCityErrorId} ${courierCityHintId}`
                          : courierCityHintId
                      }
                      {...register("courierCityName")}
                    />
                    <FieldError id={courierCityErrorId}>
                      {errors.courierCityName?.message}
                    </FieldError>
                    <p
                      id={courierCityHintId}
                      className="text-xs text-muted-foreground"
                    >
                      {t.courierCityHint(
                        courierTitle(live.courierCityName ?? ""),
                      )}
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={fid.courierPrice} required>
                      {t.courierPrice}
                    </Label>
                    <MoneyInput
                      id={fid.courierPrice}
                      required
                      invalid={Boolean(errors.courierPrice)}
                      describedBy={
                        errors.courierPrice ? priceErrorId : undefined
                      }
                      {...register("courierPrice")}
                    />
                    <FieldError id={priceErrorId}>
                      {errors.courierPrice?.message}
                    </FieldError>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={fid.courierFreeFrom}>
                      {t.courierFreeFrom}
                    </Label>
                    <MoneyInput
                      id={fid.courierFreeFrom}
                      invalid={Boolean(errors.courierFreeFrom)}
                      describedBy={
                        errors.courierFreeFrom
                          ? `${freeFromErrorId} ${freeFromHintId}`
                          : freeFromHintId
                      }
                      {...register("courierFreeFrom")}
                    />
                    <FieldError id={freeFromErrorId}>
                      {errors.courierFreeFrom?.message}
                    </FieldError>
                    <p
                      id={freeFromHintId}
                      className="text-xs text-muted-foreground"
                    >
                      {t.courierFreeFromHint}
                    </p>
                  </div>
                </div>

                <Callout variant="muted">
                  {t.courierNoteLead}
                  <strong className="font-semibold">
                    {t.courierNoteStrong}
                  </strong>
                  {t.courierNoteTail}
                </Callout>
              </DeliveryMethodCard>
            )}
          />

          <Controller
            control={control}
            name="otherEnabled"
            render={({ field }) => (
              <DeliveryMethodCard
                switchId="delivery-other-enabled"
                icon={CircleHelp}
                title={t.otherTitle}
                description={t.otherDescription}
                enabled={field.value}
                onEnabledChange={field.onChange}
              >
                <Callout
                  variant="muted"
                  icon={
                    <Lock
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                  }
                >
                  {t.otherNote}
                </Callout>
              </DeliveryMethodCard>
            )}
          />
        </div>

        <DeliveryPreviewPanel
          rows={previewRows}
          className="lg:sticky lg:top-0 lg:w-80 lg:shrink-0"
        />
      </div>

      <FormActionsBar
        variant="sticky"
        dirtySections={dirtySections}
        onDiscard={discard}
        saveLabel={update.isPending ? dict.common.saving : t.submit}
        isSaving={update.isPending}
        saveDisabled={allOff}
      />
    </form>
  );
}

interface MoneyInputProps extends ComponentProps<"input"> {
  invalid: boolean;
  describedBy?: string;
}

/** A hryvnia amount: decimal keyboard on a phone, «₴» drawn inside the field. */
function MoneyInput({
  invalid,
  describedBy,
  required,
  ...props
}: MoneyInputProps) {
  return (
    <div className="relative w-full">
      <Input
        type="text"
        inputMode="decimal"
        aria-required={required ? "true" : undefined}
        className="pr-8 tabular-nums"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
      >
        {t.currency}
      </span>
    </div>
  );
}
