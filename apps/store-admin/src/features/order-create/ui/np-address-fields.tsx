"use client";

import { useState, type ChangeEvent } from "react";
import { Check } from "lucide-react";
import { useWatch, type UseFormReturn } from "react-hook-form";
// Imported from the generated module directly, not through `@/shared/api`: the
// `delivery` tag is the one Orval group that barrel does not re-export, and the
// barrel belongs to no one feature — it is edited by whoever adds an endpoint, so
// this wave leaves it alone (the same reasoning as `use-url-params` /
// `use-table-sort`, which are imported from their own modules by convention). A
// follow-up that introduces `entities/delivery`, mirroring the storefront, should
// move this import there; nothing else in this file changes with it.
import {
  useSearchDeliveryCities,
  useSearchDeliveryWarehouses,
} from "@/shared/api/generated/delivery/delivery";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import type { CreateOrderFormValues } from "../model/create-order-schema";

const SEARCH_DEBOUNCE_MS = 300;
/** The backend refuses a shorter settlement query, so don't ask it one. */
const CITY_MIN_QUERY = 2;

const t = dict.orderCreate;

interface NpFieldProps {
  form: UseFormReturn<CreateOrderFormValues>;
}

/**
 * Nova Poshta city + warehouse pickers for the operator's create-order form
 * (TASK-426), mirroring `features/checkout/ui/np-city-field.tsx` and
 * `np-warehouse-field.tsx` on the storefront.
 *
 * ── The state that matters most here is "directory unavailable" ───────────────
 * NP refuses keyless calls in production, and our own guard refuses them before
 * that, so a deployment with no NP key gets an error from these endpoints every
 * single time. FREE TEXT IS THEREFORE A FIRST-CLASS PATH, not a fallback: both
 * fields are ordinary registered inputs, the NP refs are optional, and an order
 * typed entirely by hand is complete. What the storefront learned the hard way
 * (TASK-402) is the other half: a failed lookup must not be reported as "nothing
 * found", or the operator retypes a city that was right all along while a customer
 * waits on the phone. The notice is persistent and `role="status"` — nothing is
 * invalid, the field simply lost its autocomplete.
 *
 * ── Why these are registered inputs and not a Combobox ───────────────────────
 * store-admin has no Combobox primitive, and `shared/ui` is not this change's to
 * extend. The result list is the `OrderLinePicker` pattern instead: `type="button"`
 * rows under a plain input. RHF `setValue` on a registered field updates the input
 * itself, so picking from the list and typing by hand write to one source of truth.
 *
 * ── One deliberate divergence from the storefront ────────────────────────────
 * Editing the city clears the NP REFS but keeps whatever branch text the operator
 * has typed. A ref is a claim that this text came from the directory for that
 * city, and it stops being true; the text is the operator's own words, and deleting
 * it while they fix a typo in the city name costs them the call.
 */
export function NpCityField({ form }: NpFieldProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedSetQuery = useDebouncedCallback(
    (value: string) => setQuery(value.trim()),
    SEARCH_DEBOUNCE_MS,
  );

  const cityRef = useWatch({ control: form.control, name: "npCityRef" });

  const enabled = query.length >= CITY_MIN_QUERY;
  const { data, isFetching, isError } = useSearchDeliveryCities(
    { q: query },
    { query: { enabled } },
  );
  const options = enabled ? (data?.data ?? []) : [];

  const id = "order-create-city";
  const fieldError = form.formState.errors.city;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t.addressCity}</Label>
      <Input
        id={id}
        autoComplete="off"
        placeholder={t.cityPlaceholder}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={
          [
            isError ? `${id}-unavailable` : null,
            fieldError ? `${id}-error` : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        {...form.register("city", {
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            // Typed by hand → this is no longer a directory address. The refs go;
            // the branch TEXT stays (see the divergence note above).
            form.setValue("npCityRef", "");
            form.setValue("npWarehouseRef", "");
            setOpen(true);
            debouncedSetQuery(event.target.value);
          },
        })}
      />

      {open && enabled ? (
        isFetching ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.npSearching}
          </p>
        ) : isError ? null : options.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.npEmpty}
          </p>
        ) : (
          <ul
            aria-label={t.citySearchAria}
            className="flex flex-col gap-1 rounded-md border border-border p-2"
          >
            {options.map((city) => (
              <li
                key={city.ref}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">
                  {city.name}
                  <span className="ml-2 text-muted-foreground">
                    {city.area}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t.npPickAria(city.name)}
                  onClick={() => {
                    form.setValue("city", city.name, { shouldValidate: true });
                    form.setValue("npCityRef", city.ref);
                    form.setValue("npWarehouseRef", "");
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className="size-4" />
                  {t.customerPick}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {isError ? (
        <p
          id={`${id}-unavailable`}
          role="status"
          className="text-xs text-muted-foreground"
        >
          {t.npUnavailable}
        </p>
      ) : null}
      {cityRef ? (
        <p className="text-xs text-muted-foreground">{t.npPicked}</p>
      ) : null}
      {fieldError ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {fieldError.message}
        </p>
      ) : null}
    </div>
  );
}

/** Nova Poshta branch picker, scoped to the settlement chosen above. */
export function NpWarehouseField({ form }: NpFieldProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedSetQuery = useDebouncedCallback(
    (value: string) => setQuery(value.trim()),
    SEARCH_DEBOUNCE_MS,
  );

  const cityRef = useWatch({ control: form.control, name: "npCityRef" });
  const warehouseRef = useWatch({
    control: form.control,
    name: "npWarehouseRef",
  });

  const enabled = cityRef !== "";
  const { data, isFetching, isError } = useSearchDeliveryWarehouses(
    { cityRef, q: query === "" ? undefined : query },
    { query: { enabled } },
  );
  const options = enabled ? (data?.data ?? []) : [];

  const id = "order-create-address1";
  const fieldError = form.formState.errors.address1;

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor={id}>{t.addressAddress1}</Label>
      <Input
        id={id}
        autoComplete="off"
        placeholder={t.warehousePlaceholder}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={
          [
            !enabled ? `${id}-hint` : null,
            isError ? `${id}-unavailable` : null,
            fieldError ? `${id}-error` : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        // Opened on focus as well as on input: once a settlement is chosen the
        // branch list is short and browsable, and an operator reading options out
        // loud should not have to guess a search term first.
        onFocus={() => setOpen(true)}
        {...form.register("address1", {
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            form.setValue("npWarehouseRef", "");
            setOpen(true);
            debouncedSetQuery(event.target.value);
          },
        })}
      />

      {open && enabled ? (
        isFetching ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.npSearching}
          </p>
        ) : isError ? null : options.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.npEmpty}
          </p>
        ) : (
          <ul
            aria-label={t.warehouseSearchAria}
            className="flex flex-col gap-1 rounded-md border border-border p-2"
          >
            {options.map((warehouse) => (
              <li
                key={warehouse.ref}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">{warehouse.description}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t.npPickAria(warehouse.description)}
                  onClick={() => {
                    form.setValue("address1", warehouse.description, {
                      shouldValidate: true,
                    });
                    form.setValue("npWarehouseRef", warehouse.ref);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className="size-4" />
                  {t.customerPick}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {!enabled ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {t.warehouseHint}
        </p>
      ) : null}
      {isError ? (
        <p
          id={`${id}-unavailable`}
          role="status"
          className="text-xs text-muted-foreground"
        >
          {t.npUnavailable}
        </p>
      ) : null}
      {warehouseRef ? (
        <p className="text-xs text-muted-foreground">{t.npPicked}</p>
      ) : null}
      {fieldError ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {fieldError.message}
        </p>
      ) : null}
    </div>
  );
}
