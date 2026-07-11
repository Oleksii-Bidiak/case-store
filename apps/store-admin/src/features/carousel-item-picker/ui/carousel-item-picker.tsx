"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  getAdminCarouselControllerGetItemsQueryKey,
  useAdminCarouselControllerGetItems,
  useAdminCarouselControllerSetItems,
  type CarouselItemEntity,
} from "@/entities/carousel";
import { useProductControllerAdminFindAll } from "@/entities/product";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { Badge, Button, Input } from "@/shared/ui";
import { dict } from "@/shared/config";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 8;

interface CarouselItemPickerProps {
  /** The carousel being edited — items cannot exist before the carousel does. */
  carouselId: string;
}

/**
 * MANUAL-carousel item panel (TASK-139): a debounced search-and-add box over
 * the admin product list, plus the current hand-picked item list with
 * accessible move-up/move-down + remove buttons (mirrors ProductImageManager's
 * move-buttons reordering — no DnD dependency). Every change persists through
 * ONE full-replace `setItems` mutation (the `persistOrder` shape); the list
 * itself is derived straight from the TanStack Query cache — no local ordered
 * copy to keep in sync (forms.md Rule 2b is satisfied by having no seeded
 * local state at all).
 *
 * Rendered inside the carousel edit form — every button is `type="button"` so
 * nothing here submits the surrounding <form>.
 */
export function CarouselItemPicker({ carouselId }: CarouselItemPickerProps) {
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
  }, SEARCH_DEBOUNCE_MS);

  const itemsQueryKey = getAdminCarouselControllerGetItemsQueryKey(carouselId);
  const {
    data: itemsData,
    isLoading,
    isError,
  } = useAdminCarouselControllerGetItems(carouselId);
  const items = itemsData?.data ?? [];

  const searchQuery = useProductControllerAdminFindAll(
    { search, page: 1, limit: SEARCH_PAGE_SIZE },
    { query: { enabled: search.length > 0 } },
  );
  const results = search.length > 0 ? (searchQuery.data?.data ?? []) : [];

  const setItems = useAdminCarouselControllerSetItems();
  const busy = setItems.isPending;

  /** Persist a complete replacement item set (indexes become sortOrder). */
  const persistItems = (productIds: string[]) => {
    setItems.mutate(
      {
        id: carouselId,
        data: {
          items: productIds.map((productId, index) => ({
            productId,
            sortOrder: index,
          })),
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: itemsQueryKey });
          toast.success(dict.carouselItems.toastSaved);
        },
        onError: () => toast.error(dict.carouselItems.toastSaveFailed),
      },
    );
  };

  const currentIds = items.map((item) => item.productId);

  const addProduct = (productId: string) => {
    if (currentIds.includes(productId)) return;
    persistItems([...currentIds, productId]);
  };

  const removeItem = (productId: string) => {
    persistItems(currentIds.filter((id) => id !== productId));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= currentIds.length) return;
    const next = [...currentIds];
    [next[index], next[target]] = [next[target], next[index]];
    persistItems(next);
  };

  return (
    <section
      aria-label={dict.carouselItems.heading}
      className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-foreground">
          {dict.carouselItems.heading}
        </h3>
        <p className="text-sm text-muted-foreground">
          {dict.carouselItems.hint}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          type="search"
          value={searchInput}
          placeholder={dict.carouselItems.searchPlaceholder}
          aria-label={dict.carouselItems.searchPlaceholder}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSetSearch(e.target.value);
          }}
          // The picker lives inside the carousel edit <form> — Enter in the
          // search box must not submit the surrounding form.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />

        {search.length > 0 &&
          (searchQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {dict.carouselItems.searchError}
            </p>
          ) : searchQuery.isLoading ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {dict.carouselItems.searchEmpty}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {results.map((product) => {
                const added = currentIds.includes(product.id);
                return (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {product.name}
                      <span className="ml-2 text-muted-foreground">
                        {product.price} ₴
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || added}
                      onClick={() => addProduct(product.id)}
                    >
                      <Plus />
                      {added
                        ? dict.carouselItems.alreadyAdded
                        : dict.carouselItems.addLabel}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.carouselItems.loadError}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dict.carouselItems.emptyHint}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {items.map((item, index) => (
            <CarouselItemRow
              key={item.id}
              item={item}
              index={index}
              lastIndex={items.length - 1}
              busy={busy}
              onMove={move}
              onRemove={removeItem}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface CarouselItemRowProps {
  item: CarouselItemEntity;
  index: number;
  lastIndex: number;
  busy: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (productId: string) => void;
}

function CarouselItemRow({
  item,
  index,
  lastIndex,
  busy,
  onMove,
  onRemove,
}: CarouselItemRowProps) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {item.product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.product.imageUrl}
            alt=""
            className="size-9 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="size-9 shrink-0 rounded bg-muted" />
        )}
        <span className="min-w-0 truncate text-sm text-foreground">
          {item.product.name}
          <span className="ml-2 text-muted-foreground">
            {item.product.price} ₴
          </span>
        </span>
        {!item.product.isActive && (
          <Badge variant="secondary">{dict.carouselItems.inactiveBadge}</Badge>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={dict.carouselItems.moveUpAria(item.product.name)}
          disabled={busy || index === 0}
          onClick={() => onMove(index, -1)}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={dict.carouselItems.moveDownAria(item.product.name)}
          disabled={busy || index === lastIndex}
          onClick={() => onMove(index, 1)}
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={dict.carouselItems.removeAria(item.product.name)}
          disabled={busy}
          onClick={() => onRemove(item.productId)}
        >
          <Trash2 className="text-destructive" />
        </Button>
      </div>
    </li>
  );
}
