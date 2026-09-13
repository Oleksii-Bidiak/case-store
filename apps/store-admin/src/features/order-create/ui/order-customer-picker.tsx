"use client";

import { useState } from "react";
import { Check, UserCircle } from "lucide-react";
import { useUserControllerFindAll } from "@/entities/user";
import type { UserEntity } from "@/entities/user";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import type { PickedCustomer } from "../model/create-order-schema";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 8;

interface OrderCustomerPickerProps {
  /** The account already chosen, or null while the operator is still looking. */
  selected: PickedCustomer | null;
  onSelect: (customer: PickedCustomer) => void;
  onClear: () => void;
  /** Validation message for the underlying `userId` field, when there is one. */
  error?: string;
}

/** A name we can show: an account may legitimately have neither part filled in. */
function displayName(user: UserEntity): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name === "" ? dict.orderCreate.customerNoName : name;
}

export function toPickedCustomer(user: UserEntity): PickedCustomer {
  return {
    id: user.id,
    name: displayName(user),
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email,
    phone: user.phone ?? "",
    isActive: user.isActive,
  };
}

/**
 * Find the customer an operator-created order belongs to (TASK-426).
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * A plain text field asking for `userId`, whose hint read "copy the ID from the
 * user page". Nobody knows a customer's UUID, and nobody should: an operator with
 * somebody on the phone cannot leave the form, find them in another screen, copy a
 * 36-character string and come back. In practice the ACCOUNT tab was unusable, so
 * every phone order for an existing customer was taken as a walk-in — which
 * detaches the order from the account that placed it.
 *
 * ── Shape ────────────────────────────────────────────────────────────────────
 * The same pattern as `OrderLinePicker`: local input state, a 300 ms debounce
 * (forms.md Rule 3, direct `useDebouncedCallback` import), a query that is
 * `enabled` only once there is something to search for, and a three-state result
 * list. Every button is `type="button"` — this sits inside the surrounding create
 * form, and a bare button in a form submits it.
 *
 * The search matches email, first name and last name, and since TASK-406 it does
 * so per whitespace-separated token, so «Олена Шевченко» finds the account whose
 * two names live in two different columns. It does NOT match the phone number —
 * `UserRepository.findAll` ORs over those three columns only — which is why the
 * label and the hint never promise it.
 *
 * A DEACTIVATED account is shown but cannot be picked: `adminCreateOrder` refuses
 * one with 403, and finding that out after filling in the whole form is the worst
 * possible moment. Showing it rather than filtering it out is deliberate — an
 * operator who searches for a customer they know exists must be told what happened
 * to them, not shown "nothing found".
 */
export function OrderCustomerPicker({
  selected,
  onSelect,
  onClear,
  error,
}: OrderCustomerPickerProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
  }, SEARCH_DEBOUNCE_MS);

  const searchQuery = useUserControllerFindAll(
    { search, page: 1, limit: SEARCH_PAGE_SIZE },
    { query: { enabled: search.length > 0 } },
  );
  const results = search.length > 0 ? (searchQuery.data?.data ?? []) : [];

  const t = dict.orderCreate;

  if (selected) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {t.customerSearchLabel}
        </span>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <UserCircle className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {selected.name}
              </span>
              <span className="block truncate text-muted-foreground">
                {[selected.email, selected.phone].filter(Boolean).join(" · ")}
              </span>
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              onClear();
            }}
          >
            {t.customerChange}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.customerSelectedHint}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="order-create-customer-search">
        {t.customerSearchLabel}
      </Label>
      <Input
        id="order-create-customer-search"
        type="search"
        autoComplete="off"
        value={searchInput}
        onChange={(event) => {
          setSearchInput(event.target.value);
          debouncedSetSearch(event.target.value);
        }}
        placeholder={t.customerSearchPlaceholder}
        aria-describedby="order-create-customer-search-hint"
        aria-invalid={error ? true : undefined}
      />
      <p
        id="order-create-customer-search-hint"
        className="text-xs text-muted-foreground"
      >
        {t.customerSearchHint}
      </p>

      {search.length > 0 ? (
        searchQuery.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.customerSearching}
          </p>
        ) : searchQuery.isError ? (
          // A failed lookup is not an empty one. Reporting "нічого не знайдено"
          // for our own outage sends the operator back to retype a name that was
          // right all along (the storefront defect of TASK-402).
          <p role="status" className="text-sm text-muted-foreground">
            {t.customerSearchFailed}
          </p>
        ) : results.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.customerNoResults}
          </p>
        ) : (
          // The input is named by its visible <Label> (WCAG 2.5.3 — an aria-label
          // that disagrees with the label breaks voice control); the list carries
          // the descriptive name instead.
          <ul
            aria-label={t.customerSearchAria}
            className="flex flex-col gap-1 rounded-md border border-border p-2"
          >
            {results.map((user) => {
              const name = displayName(user);

              return (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">
                      {name}
                      {!user.isActive ? (
                        <span className="ml-2 text-muted-foreground">
                          ({t.customerInactive})
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {[user.email, user.phone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {user.isActive ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t.customerPickAria(name)}
                      onClick={() => onSelect(toPickedCustomer(user))}
                    >
                      <Check className="size-4" />
                      {t.customerPick}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t.customerInactiveHint}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
