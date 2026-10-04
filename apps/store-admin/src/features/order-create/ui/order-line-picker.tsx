"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useProductControllerAdminFindAll } from "@/entities/product";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn, formatCurrency } from "@/shared/lib";
import type { DraftLine } from "../model/create-order-schema";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 8;

const t = dict.orderCreate;

interface OrderLinePickerProps {
  lines: readonly DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  /** productId → the server's refusal of that line (Н3). */
  lineErrors?: Readonly<Record<string, string>>;
}

/**
 * Search-and-add product lines for an operator-created order (TASK-341; wave
 * 198 Н1/Н3).
 *
 * Each result says what the operator needs before adding it: price, SKU and the
 * FREE stock (`stock` — already net of reservations); a product with none left
 * is shown but cannot be added. Lines get a −/+ stepper around the quantity
 * field (still typeable), their sum, and «×».
 *
 * Prices are rendered but never submitted — the catalogue decides them at
 * creation time. Every button is `type="button"`: this sits inside the form.
 */
export function OrderLinePicker({
  lines,
  onChange,
  lineErrors = {},
}: OrderLinePickerProps) {
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

  const addLine = (product: {
    id: string;
    name: string;
    price: string;
    sku?: string | null;
    stock: number;
  }) => {
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
        sku: product.sku ?? null,
        stock: product.stock,
      },
    ]);
  };

  const setQuantity = (productId: string, quantity: number) => {
    onChange(
      lines.map((line) =>
        line.productId === productId
          ? { ...line, quantity: Math.max(1, quantity || 1) }
          : line,
      ),
    );
  };

  const removeLine = (productId: string) => {
    onChange(lines.filter((line) => line.productId !== productId));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-line-search" className="sr-only">
          {t.itemsSearchPlaceholder}
        </Label>
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="order-line-search"
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              debouncedSetSearch(event.target.value);
            }}
            placeholder={t.itemsSearchPlaceholder}
            aria-label={t.itemsSearchAria}
            className="w-full pl-9"
          />
        </div>
      </div>

      {search.length > 0 ? (
        searchQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t.itemsSearching}</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.itemsNoResults}</p>
        ) : (
          <ul className="flex flex-col gap-1 rounded-lg border border-border p-2 shadow-card">
            {results.map((product) => {
              const noStock = product.stock <= 0;
              return (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-foreground">
                      {product.name}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        noStock
                          ? "font-medium text-warning"
                          : "text-muted-foreground",
                      )}
                    >
                      {noStock
                        ? t.itemNoStock
                        : [
                            product.sku ? t.itemSku(product.sku) : null,
                            t.itemFree(product.stock),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <b className="font-semibold text-foreground tabular-nums">
                      {formatCurrency(product.price)}
                    </b>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={noStock}
                      aria-label={t.itemsAddAria(product.name)}
                      onClick={() => addLine(product)}
                    >
                      <PlusIcon aria-hidden="true" className="size-4" />
                      {t.itemsAdd}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {lines.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => {
            const error = lineErrors[line.productId];
            const errorId = `order-line-${line.productId}-error`;
            const atStock =
              line.stock !== undefined && line.quantity >= line.stock;
            return (
              <li
                key={line.productId}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm",
                  error
                    ? "border-destructive bg-destructive/5"
                    : "border-border",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-foreground">{line.productName}</span>
                  {error ? (
                    <span
                      id={errorId}
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {error}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {[
                        t.itemPerUnit(formatCurrency(line.price)),
                        line.stock !== undefined
                          ? t.itemFree(line.stock)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-md border border-input">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.itemsQtyDecrease(line.productName)}
                      disabled={line.quantity <= 1}
                      onClick={() =>
                        setQuantity(line.productId, line.quantity - 1)
                      }
                    >
                      <MinusIcon aria-hidden="true" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) =>
                        setQuantity(line.productId, Number(event.target.value))
                      }
                      aria-label={t.itemsQtyAria(line.productName)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      className="h-8 w-14 border-0 text-center shadow-none"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.itemsQtyIncrease(line.productName)}
                      disabled={atStock}
                      onClick={() =>
                        setQuantity(line.productId, line.quantity + 1)
                      }
                    >
                      <PlusIcon aria-hidden="true" />
                    </Button>
                  </span>
                  <b className="w-24 text-right font-semibold text-foreground tabular-nums">
                    {formatCurrency(Number(line.price) * line.quantity)}
                  </b>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.itemsRemoveAria(line.productName)}
                    onClick={() => removeLine(line.productId)}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="text-xs text-muted-foreground">{t.itemsPriceHint}</p>
    </div>
  );
}
