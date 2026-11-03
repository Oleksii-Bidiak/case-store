"use client";

import { useState, type ChangeEvent } from "react";
import { Check } from "lucide-react";
import {
  useWatch,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
// Straight from the generated module, like the slice's index does: the
// `delivery` tag is the one Orval group the `@/shared/api` barrel does not
// re-export, and a slice must not import its own public index.
import {
  useSearchDeliveryCities,
  useSearchDeliveryWarehouses,
} from "@/shared/api/generated/delivery/delivery";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";

const SEARCH_DEBOUNCE_MS = 300;
/** The backend refuses a shorter settlement query, so don't ask it one. */
const CITY_MIN_QUERY = 2;

const t = dict.orderCreate;

/**
 * The four values the pickers read and write. Any form that holds them can host
 * the pickers — the phone order (`features/order-create`) and the delivery edit
 * of an existing order (`features/order-address-edit`, TASK-1973): moved here
 * from `features/order-create` so the two features share them without importing
 * each other.
 */
export interface NpAddressValues extends FieldValues {
  city: string;
  address1: string;
  npCityRef: string;
  npWarehouseRef: string;
}

interface NpFieldProps<T extends NpAddressValues> {
  form: UseFormReturn<T>;
  /** Element ids are `${idPrefix}-city` / `${idPrefix}-address1`. */
  idPrefix: string;
}

/**
 * RHF's `UseFormReturn` is invariant in its values, so a form with MORE fields
 * is not assignable to one with these four. Narrowed once here; every key the
 * pickers touch is one of {@link NpAddressValues}.
 */
function narrow<T extends NpAddressValues>(
  form: UseFormReturn<T>,
): UseFormReturn<NpAddressValues> {
  return form as unknown as UseFormReturn<NpAddressValues>;
}

/**
 * Nova Poshta city + warehouse pickers for the operator's create-order form
 * (TASK-426) and, since TASK-1973, the delivery edit of an existing order, mirroring `features/checkout/ui/np-city-field.tsx` and
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
 * ── Why these are registered inputs and not the shared Combobox ──────────────
 * This note used to say "store-admin has no Combobox primitive, and `shared/ui`
 * is not this change's to extend". Both halves are now false: TASK-423 added
 * `shared/ui/combobox.tsx` (a full WAI-ARIA combobox, used by three product-form
 * pickers), and this same wave extended `shared/ui` several more times. Nor is
 * free text the obstacle — that Combobox keeps whatever is typed, and the
 * storefront's own NP fields even report "directory unavailable" through its
 * `emptyText`. The reason these two fields are still hand-rolled `type="button"`
 * rows under a plain input (the `OrderLinePicker` pattern) is narrower and
 * mechanical: `Combobox` is CONTROLLED (`value` + `onInputChange`), while every
 * field on this form is RHF-REGISTERED. `setValue` on a registered field updates
 * the input itself, which is what lets picking from the list and typing by hand
 * write to one source of truth; going to `Combobox` means wrapping both fields in
 * `useController` and re-proving the free-text path. That migration is DEFERRED,
 * not impossible — weigh it honestly if you come here to add a third picker, and
 * do not re-derive the dead premise that the primitive is missing.
 *
 * ── One deliberate divergence from the storefront ────────────────────────────
 * Changing the city clears the NP refs, and clears the branch text ONLY when that
 * text came from the directory (i.e. `npWarehouseRef` was set). So what survives a
 * city change is exactly what the operator typed themselves: deleting their own
 * words while they fix a typo in the city name costs them the call. A DIRECTORY
 * branch must not survive, and that is the half this originally got wrong — «Київ»
 * + «Відділення №5» then «ні, у Бровари» left the Kyiv branch sitting in
 * `address1` while `city` became Бровари, and the only visible change was the grey
 * «обрано з довідника» line disappearing. `createOrderValuesToDto` then omits the
 * now-empty `npWarehouseRef` and ships a parcel addressed to a branch that does
 * not exist in that settlement.
 */
export function NpCityField<T extends NpAddressValues>({
  form: hostForm,
  idPrefix,
}: NpFieldProps<T>) {
  const form = narrow(hostForm);
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

  const id = `${idPrefix}-city`;
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
            // Typed by hand → this is no longer a directory address, so the refs
            // go. Whether the branch TEXT goes with them depends on where that
            // text came from, and `npWarehouseRef` is the only record of it — so
            // read it BEFORE clearing it. Set means the text is a branch name the
            // directory wrote for the OLD settlement and is now a lie; empty means
            // the operator typed it and it is theirs to keep.
            if (form.getValues("npWarehouseRef") !== "") {
              form.setValue("address1", "", {
                shouldValidate: true,
                shouldDirty: true,
              });
            }
            form.setValue("npCityRef", "", { shouldDirty: true });
            form.setValue("npWarehouseRef", "", { shouldDirty: true });
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
                    // `shouldDirty` on every write here: a pick IS an edit, and the
                    // order card holds its lock token only while the form is dirty
                    // (`useEditLockToken`) — a pick-only change must not be saved
                    // against a colleague's newer version without a 409.
                    form.setValue("city", city.name, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                    form.setValue("npCityRef", city.ref, { shouldDirty: true });
                    // Same rule as the keystroke path above, repeated rather than
                    // relied upon: today a pick is always preceded by typing, so
                    // the guard there has usually already fired — but the two are
                    // independent ways to change the settlement, and a later
                    // prefill (or a `Combobox` migration, which replaces the
                    // keystroke handler) must not be able to reintroduce a Kyiv
                    // branch under a Brovary address.
                    if (form.getValues("npWarehouseRef") !== "") {
                      form.setValue("address1", "", {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }
                    form.setValue("npWarehouseRef", "", { shouldDirty: true });
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
export function NpWarehouseField<T extends NpAddressValues>({
  form: hostForm,
  idPrefix,
}: NpFieldProps<T>) {
  const form = narrow(hostForm);
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

  const id = `${idPrefix}-address1`;
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
            form.setValue("npWarehouseRef", "", { shouldDirty: true });
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
                      shouldDirty: true,
                    });
                    form.setValue("npWarehouseRef", warehouse.ref, {
                      shouldDirty: true,
                    });
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
