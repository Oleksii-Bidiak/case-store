"use client";

import { useState } from "react";
import {
  useController,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";
import { Combobox, Label, type ComboboxOption } from "@/shared/ui";
import { useSearchDeliveryWarehouses } from "@/entities/delivery";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "../model/checkout-schema";

interface NpWarehouseFieldProps {
  control: Control<CheckoutFormValues>;
  setValue: UseFormSetValue<CheckoutFormValues>;
  /** NP city ref of the currently selected city; gates the warehouse search. */
  cityRef?: string;
  id?: string;
}

/**
 * NpWarehouseField — Nova Poshta warehouse autocomplete bound to the
 * `deliveryAddress` form field. Warehouses are scoped to the selected city, so
 * the search only runs once a `cityRef` is present; until then the field still
 * accepts free text (the NP-not-configured fallback) and shows a hint.
 *
 * Selecting a branch records the description (`deliveryAddress`) and the NP
 * warehouse ref (`npWarehouseRef`); typing freely clears the ref.
 */
export function NpWarehouseField({
  control,
  setValue,
  cityRef,
  id = "checkout-deliveryAddress",
}: NpWarehouseFieldProps) {
  const { field, fieldState } = useController({
    control,
    name: "deliveryAddress",
  });
  const [query, setQuery] = useState("");

  const debouncedSetQuery = useDebouncedCallback(
    (q: string) => setQuery(q),
    300,
  );

  const enabled = Boolean(cityRef);
  const { data, isFetching } = useSearchDeliveryWarehouses(
    { cityRef: cityRef ?? "", q: query || undefined },
    { query: { enabled } },
  );

  const options: ComboboxOption[] = (data?.data ?? []).map((warehouse) => ({
    value: warehouse.ref,
    label: warehouse.description,
  }));

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor={id}>{dict.checkout.fields.deliveryAddress}</Label>
      <Combobox
        id={id}
        value={field.value ?? ""}
        options={options}
        isLoading={isFetching}
        placeholder={dict.checkout.warehousePlaceholder}
        loadingText={dict.checkout.searchLoading}
        emptyText={dict.checkout.searchEmpty}
        autoComplete="street-address"
        aria-invalid={fieldState.error ? true : undefined}
        aria-describedby={fieldState.error ? `${id}-error` : undefined}
        onInputChange={(text) => {
          field.onChange(text);
          setValue("npWarehouseRef", "");
          if (enabled) debouncedSetQuery(text);
        }}
        onSelect={(option) => {
          field.onChange(option.label);
          setValue("npWarehouseRef", option.value, { shouldValidate: true });
          setQuery("");
        }}
      />
      {!cityRef && !fieldState.error && (
        <span className="text-xs text-muted-foreground">
          {dict.checkout.warehouseHint}
        </span>
      )}
      {fieldState.error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {fieldState.error.message}
        </p>
      )}
    </div>
  );
}
