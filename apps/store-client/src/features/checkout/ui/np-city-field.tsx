"use client";

import { useState } from "react";
import {
  useController,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";
import { Combobox, Label, type ComboboxOption } from "@/shared/ui";
import { useSearchDeliveryCities } from "@/entities/delivery";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "../model/checkout-schema";

interface NpCityFieldProps {
  control: Control<CheckoutFormValues>;
  setValue: UseFormSetValue<CheckoutFormValues>;
  id?: string;
}

/**
 * NpCityField — Nova Poshta city autocomplete bound to the `city` form field.
 *
 * Selecting a settlement records both the display name (`city`) and the NP city
 * ref (`npCityRef`). Typing freely keeps `city` as raw text and clears the ref,
 * which is the offline / NP-not-configured fallback. Changing the city always
 * clears the dependent warehouse selection so a stale branch can't linger.
 *
 * Search is debounced (forms.md Rule 3, direct `useDebouncedCallback` import)
 * and only fires for queries of ≥ 2 characters (matching the backend guard).
 */
export function NpCityField({
  control,
  setValue,
  id = "checkout-city",
}: NpCityFieldProps) {
  const { field, fieldState } = useController({ control, name: "city" });
  const [query, setQuery] = useState("");

  const debouncedSetQuery = useDebouncedCallback(
    (q: string) => setQuery(q),
    300,
  );

  const { data, isFetching } = useSearchDeliveryCities(
    { q: query },
    { query: { enabled: query.trim().length >= 2 } },
  );

  const options: ComboboxOption[] = (data?.data ?? []).map((city) => ({
    value: city.ref,
    label: city.name,
  }));

  const clearWarehouse = () => {
    setValue("deliveryAddress", "");
    setValue("npWarehouseRef", "");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{dict.checkout.fields.city}</Label>
      <Combobox
        id={id}
        value={field.value ?? ""}
        options={options}
        isLoading={isFetching}
        placeholder={dict.checkout.cityPlaceholder}
        loadingText={dict.checkout.searchLoading}
        emptyText={dict.checkout.searchEmpty}
        autoComplete="address-level2"
        aria-invalid={fieldState.error ? true : undefined}
        aria-describedby={fieldState.error ? `${id}-error` : undefined}
        onInputChange={(text) => {
          field.onChange(text);
          setValue("npCityRef", "");
          clearWarehouse();
          debouncedSetQuery(text);
        }}
        onSelect={(option) => {
          field.onChange(option.label);
          setValue("npCityRef", option.value, { shouldValidate: true });
          clearWarehouse();
          setQuery("");
        }}
      />
      {fieldState.error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {fieldState.error.message}
        </p>
      )}
    </div>
  );
}
