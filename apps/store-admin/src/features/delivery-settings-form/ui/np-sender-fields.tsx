"use client";

import { useEffect, useState } from "react";
import { useController, useWatch, type UseFormReturn } from "react-hook-form";
import {
  useSearchDeliveryCities,
  useSearchDeliveryWarehouses,
} from "@/entities/delivery";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Combobox, FieldError, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import type { DeliverySettingsFormValues } from "../model/delivery-settings-schema";
import { DELIVERY_FIELD_IDS } from "./delivery-field-ids";

const t = dict.deliverySettingsForm;

const SEARCH_DEBOUNCE_MS = 300;
/** The backend refuses a shorter settlement query, so don't ask it one. */
const CITY_MIN_QUERY = 2;

interface NpSenderFieldsProps {
  form: UseFormReturn<DeliverySettingsFormValues>;
  /**
   * Remember the name of a picked branch. The API stores only its ref, so the
   * form keeps the label it showed — and the name of the SAVED branch is found
   * in the directory list once it loads (best effort: the API lists 50).
   */
  onWarehouseLabel: (ref: string, label: string) => void;
}

/** «Київ, Київська обл.» — the settlement with its region, as NP lists it. */
function cityLabel(name: string, area: string): string {
  return area ? `${name}, ${area}` : name;
}

/**
 * The Nova Poshta card's body (ДН-1.1): where parcels leave from — a city and,
 * optionally, a branch, both picked from the NP directory — and the parcel
 * weight used when a product has none.
 *
 * The pickers are the shared `Combobox`, wired through `useController`: the
 * text the operator types IS the stored name (`senderCityName`), and a pick
 * writes the ref beside it. Typing therefore clears the ref (the text is no
 * longer the picked city) and with it the branch, which belonged to the old
 * city. A typed name without a pick is refused on save — there is nothing to
 * estimate from. If the directory does not answer, the notice says so instead
 * of «нічого не знайдено» (TASK-402's lesson): the rest of the page still saves.
 */
export function NpSenderFields({
  form,
  onWarehouseLabel,
}: NpSenderFieldsProps) {
  const { control, setValue, register, formState } = form;
  const { errors } = formState;

  // ── City ──────────────────────────────────────────────────────────────────
  const { field: cityField } = useController({
    control,
    name: "senderCityName",
  });
  const cityRef = useWatch({ control, name: "senderCityRef" });
  const [cityQuery, setCityQuery] = useState("");
  const debouncedCityQuery = useDebouncedCallback(
    (value: string) => setCityQuery(value.trim()),
    SEARCH_DEBOUNCE_MS,
  );
  const citySearchEnabled =
    cityRef === "" && cityQuery.length >= CITY_MIN_QUERY;
  const cities = useSearchDeliveryCities(
    { q: cityQuery },
    { query: { enabled: citySearchEnabled } },
  );
  const cityOptions = citySearchEnabled
    ? (cities.data?.data ?? []).map((city) => ({
        value: city.ref,
        label: city.name,
        description: city.area,
      }))
    : [];

  // ── Branch ────────────────────────────────────────────────────────────────
  const { field: warehouseField } = useController({
    control,
    name: "senderWarehouseName",
  });
  const warehouseRef = useWatch({ control, name: "senderWarehouseRef" });
  const [warehouseQuery, setWarehouseQuery] = useState("");
  const debouncedWarehouseQuery = useDebouncedCallback(
    (value: string) => setWarehouseQuery(value.trim()),
    SEARCH_DEBOUNCE_MS,
  );
  const warehouseSearchEnabled = cityRef !== "";
  const warehouses = useSearchDeliveryWarehouses(
    { cityRef, q: warehouseQuery === "" ? undefined : warehouseQuery },
    { query: { enabled: warehouseSearchEnabled } },
  );
  const warehouseList = warehouseSearchEnabled
    ? (warehouses.data?.data ?? [])
    : [];
  const warehouseOptions = warehouseList.map((warehouse) => ({
    value: warehouse.ref,
    label: warehouse.description,
  }));

  // The saved branch arrives as a bare ref; name it once the list has it.
  const savedWarehouse =
    warehouseRef !== "" && warehouseField.value === ""
      ? warehouseList.find((warehouse) => warehouse.ref === warehouseRef)
      : undefined;
  useEffect(() => {
    if (savedWarehouse) {
      onWarehouseLabel(savedWarehouse.ref, savedWarehouse.description);
    }
  }, [savedWarehouse, onWarehouseLabel]);

  const ids = DELIVERY_FIELD_IDS;
  const cityHintId = `${ids.senderCityName}-hint`;
  const cityErrorId = `${ids.senderCityName}-error`;
  const directoryDownId = `${ids.senderCityName}-unavailable`;
  const warehouseHintId = `${ids.senderWarehouseName}-hint`;
  const warehouseErrorId = `${ids.senderWarehouseName}-error`;
  const weightHintId = `${ids.defaultWeightKg}-hint`;
  const weightErrorId = `${ids.defaultWeightKg}-error`;
  const directoryDown = cities.isError || warehouses.isError;

  const describedBy = (...parts: (string | false | undefined)[]) =>
    parts.filter(Boolean).join(" ") || undefined;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={ids.senderCityName}>{t.senderCity}</Label>
          <Combobox
            id={ids.senderCityName}
            value={cityField.value}
            onInputChange={(text) => {
              // The text is no longer the picked city — and a branch belongs
              // to its city.
              setValue("senderCityRef", "", { shouldDirty: true });
              setValue("senderWarehouseRef", "", { shouldDirty: true });
              setValue("senderWarehouseName", "", { shouldDirty: true });
              // …and so does the branch search: a term typed under the old
              // city would filter the new city's list behind an empty field.
              debouncedWarehouseQuery.cancel();
              setWarehouseQuery("");
              cityField.onChange(text);
              debouncedCityQuery(text);
            }}
            onSelect={(option) => {
              setValue("senderCityRef", option.value, {
                shouldDirty: true,
                shouldValidate: true,
              });
              setValue(
                "senderCityName",
                cityLabel(option.label, option.description ?? ""),
                { shouldDirty: true, shouldValidate: true },
              );
              setCityQuery("");
            }}
            options={cityOptions}
            isLoading={citySearchEnabled && cities.isFetching}
            loadingText={t.npSearching}
            emptyText={cities.isError ? undefined : t.npEmpty}
            placeholder={t.senderCityPlaceholder}
            aria-invalid={errors.senderCityName ? true : undefined}
            aria-describedby={describedBy(
              errors.senderCityName && cityErrorId,
              directoryDown && directoryDownId,
              cityHintId,
            )}
          />
          <FieldError id={cityErrorId}>
            {errors.senderCityName?.message}
          </FieldError>
          <p id={cityHintId} className="text-xs text-muted-foreground">
            {t.senderCityHint}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={ids.senderWarehouseName}>{t.senderWarehouse}</Label>
          <Combobox
            id={ids.senderWarehouseName}
            value={warehouseField.value}
            disabled={!warehouseSearchEnabled}
            onInputChange={(text) => {
              setValue("senderWarehouseRef", "", { shouldDirty: true });
              warehouseField.onChange(text);
              debouncedWarehouseQuery(text);
            }}
            onSelect={(option) => {
              setValue("senderWarehouseRef", option.value, {
                shouldDirty: true,
                shouldValidate: true,
              });
              setValue("senderWarehouseName", option.label, {
                shouldDirty: true,
                shouldValidate: true,
              });
              onWarehouseLabel(option.value, option.label);
              setWarehouseQuery("");
            }}
            options={warehouseOptions}
            isLoading={warehouseSearchEnabled && warehouses.isFetching}
            loadingText={t.npSearching}
            emptyText={warehouses.isError ? undefined : t.npEmpty}
            placeholder={t.senderWarehousePlaceholder}
            aria-invalid={errors.senderWarehouseName ? true : undefined}
            aria-describedby={describedBy(
              errors.senderWarehouseName && warehouseErrorId,
              directoryDown && directoryDownId,
              warehouseHintId,
            )}
          />
          <FieldError id={warehouseErrorId}>
            {errors.senderWarehouseName?.message}
          </FieldError>
          <p id={warehouseHintId} className="text-xs text-muted-foreground">
            {!warehouseSearchEnabled
              ? t.senderWarehouseNeedsCity
              : warehouseRef !== "" && warehouseField.value === ""
                ? t.senderWarehousePicked
                : t.senderWarehouseHint}
          </p>
        </div>
      </div>

      {directoryDown ? (
        <p
          id={directoryDownId}
          role="status"
          className="text-xs text-muted-foreground"
        >
          {t.npUnavailable}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.defaultWeightKg} required>
          {t.defaultWeight}
        </Label>
        <div className="relative w-full max-w-45">
          <Input
            id={ids.defaultWeightKg}
            type="text"
            inputMode="decimal"
            aria-required="true"
            className="pr-9 tabular-nums"
            aria-invalid={errors.defaultWeightKg ? true : undefined}
            aria-describedby={describedBy(
              errors.defaultWeightKg && weightErrorId,
              weightHintId,
            )}
            {...register("defaultWeightKg")}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
          >
            {t.weightUnit}
          </span>
        </div>
        <FieldError id={weightErrorId}>
          {errors.defaultWeightKg?.message}
        </FieldError>
        <p id={weightHintId} className="text-xs text-muted-foreground">
          {t.defaultWeightHint}
        </p>
      </div>
    </>
  );
}
