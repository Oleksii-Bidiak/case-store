"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useProductControllerAdminFindAll } from "@/entities/product";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import type { DraftLine } from "../model/create-order-schema";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 8;

interface OrderLinePickerProps {
  lines: readonly DraftLine[];
  onChange: (lines: DraftLine[]) => void;
}

/**
 * Search-and-add product lines for an operator-created order (TASK-341).
 *
 * Prices are rendered but never submitted — they come from the live catalogue at
 * creation time, and this display is only so the operator can read a total back
 * to the customer on the phone. Every button is `type="button"`, since this sits
 * inside the surrounding create form.
 */
export function OrderLinePicker({ lines, onChange }: OrderLinePickerProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
  }, SEARCH_DEBOUNCE_MS);

  const searchQuery = useProductControllerAdminFindAll(
    { search, page: 1, limit: SEARCH_PAGE_SIZE },
    { query: { enabled: search.length > 0 } },
  );
  const results = search.length > 0 ? (searchQuery.data?.data ?? []) : [];
  const picked = new Set(lines.map((line) => line.productId));

  const addLine = (product: { id: string; name: string; price: string }) => {
    // Adding an already-picked product bumps its quantity rather than creating a
    // duplicate line — two rows for one product is a total the operator has to
    // add up in their head.
    if (picked.has(product.id)) {
      onChange(
        lines.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        ),
      );
      return;
    }
    onChange([
      ...lines,
      {
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: 1,
      },
    ]);
  };

  const setQuantity = (productId: string, quantity: number) => {
    onChange(
      lines.map((line) =>
        line.productId === productId
          ? { ...line, quantity: Math.max(1, quantity) }
          : line,
      ),
    );
  };

  const removeLine = (productId: string) => {
    onChange(lines.filter((line) => line.productId !== productId));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-line-search">
          {dict.orderCreate.itemsSearchPlaceholder}
        </Label>
        <Input
          id="order-line-search"
          type="search"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            debouncedSetSearch(event.target.value);
          }}
          placeholder={dict.orderCreate.itemsSearchPlaceholder}
          aria-label={dict.orderCreate.itemsSearchAria}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          {dict.orderCreate.itemsPriceHint}
        </p>
      </div>

      {search.length > 0 ? (
        searchQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            {dict.orderCreate.itemsSearching}
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {dict.orderCreate.itemsNoResults}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 rounded-md border border-border p-2">
            {results.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">
                  {product.name}
                  <span className="ml-2 text-muted-foreground">
                    {formatCurrency(product.price)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={dict.orderCreate.itemsAddAria(product.name)}
                  onClick={() => addLine(product)}
                >
                  <Plus className="size-4" />
                  {dict.orderCreate.itemsAdd}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dict.orderCreate.itemsEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li
              key={line.productId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
            >
              <span className="flex-1 truncate">{line.productName}</span>
              <span className="text-muted-foreground">
                {formatCurrency(line.price)}
              </span>
              <Input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(event) =>
                  setQuantity(line.productId, Number(event.target.value))
                }
                aria-label={dict.orderCreate.itemsQtyAria(line.productName)}
                className="w-20"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={dict.orderCreate.itemsRemoveAria(line.productName)}
                onClick={() => removeLine(line.productId)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
