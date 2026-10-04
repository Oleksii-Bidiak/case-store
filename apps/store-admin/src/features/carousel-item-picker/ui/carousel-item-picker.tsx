"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  GripVertical,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useProductControllerAdminFindAll } from "@/entities/product";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { formatCurrency } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import type { TreeItem } from "@/shared/lib/sortable-tree";
import {
  Badge,
  Button,
  Input,
  LiveAnnouncer,
  SortableTree,
  useAnnouncer,
  type SortableTreeRowRenderProps,
} from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";

const c = dict.carouselItems;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 8;

/** One hand-picked product — what the row shows and what `setItems` needs. */
export interface CarouselPickedItem {
  productId: string;
  name: string;
  imageUrl?: string | null;
  price: string;
  isActive: boolean;
}

export interface CarouselItemPickerProps {
  /** The ordered list. Owned by the host, saved with the carousel's «Зберегти». */
  items: readonly CarouselPickedItem[];
  onChange: (next: CarouselPickedItem[]) => void;
}

/**
 * «Товари каруселі» for a MANUAL carousel (TASK-139; CarouselsProposal КР5/КР6/
 * КР8, wave 198 — TASK-1074).
 *
 * CONTROLLED since wave 198: the host owns the list and saves it with the one
 * «Зберегти» (`PUT /admin/carousels/:id/items` right after the carousel itself),
 * so the list can be built before the carousel exists. Until then every click
 * here was its own full-replace PUT.
 *
 * Order: drag a row by ⠿ (pointer), or — the job the old ↑/↓ buttons did —
 * the arrow keys / Home / End on that same ⠿ (keyboard). A move posts a
 * «Скасувати» toast; the rows are numbered so the order reads without
 * dragging. Search runs through the admin product list (name, description,
 * SKU) and shows the price and stock; products already in the list say «У
 * каруселі» instead of offering «Додати».
 */
export function CarouselItemPicker(props: CarouselItemPickerProps) {
  return (
    <LiveAnnouncer>
      <PickerBody {...props} />
    </LiveAnnouncer>
  );
}

function PickerBody({ items, onChange }: CarouselItemPickerProps) {
  const keyboardHintId = useId();
  const { announcePolite } = useAnnouncer();
  const handleIdPrefix = useId();
  /** The row whose ⠿ must get focus back once the new order has rendered. */
  const focusAfterMove = useRef<string | null>(null);
  const undoToastId = useRef<string | number | null>(null);

  // Keep keyboard focus on the moved row's handle once it has re-rendered.
  useEffect(() => {
    const productId = focusAfterMove.current;
    if (productId === null) return;
    focusAfterMove.current = null;
    document.getElementById(`${handleIdPrefix}${productId}`)?.focus();
  }, [items, handleIdPrefix]);

  // A toast that outlives the picker would undo into a list that is gone.
  useEffect(
    () => () => {
      if (undoToastId.current !== null) toast.dismiss(undoToastId.current);
    },
    [],
  );

  const ids = items.map((item) => item.productId);
  const byId = useMemo(
    () => new Map(items.map((item) => [item.productId, item])),
    [items],
  );
  const treeItems: TreeItem[] = items.map((item) => ({
    id: item.productId,
    parentId: null,
    label: item.name,
  }));

  /** Commit a new order, with «Скасувати» back to the order it replaced. */
  const commitMove = (nextIds: string[], movingId: string) => {
    const previous = [...items];
    const next = nextIds
      .map((id) => byId.get(id))
      .filter((item): item is CarouselPickedItem => item !== undefined);
    onChange(next);
    const at = nextIds.indexOf(movingId);
    const message = dict.reorderList.movedToast.moved(
      byId.get(movingId)?.name ?? "",
      at + 1,
      nextIds.length,
    );
    announcePolite(message);
    if (undoToastId.current !== null) toast.dismiss(undoToastId.current);
    undoToastId.current = toast.undo(message, {
      onUndo: () => {
        undoToastId.current = null;
        onChange(previous);
      },
    });
  };

  const moveByKey = (productId: string, key: string): boolean => {
    const from = ids.indexOf(productId);
    const to =
      key === "ArrowUp"
        ? from - 1
        : key === "ArrowDown"
          ? from + 1
          : key === "Home"
            ? 0
            : key === "End"
              ? ids.length - 1
              : null;
    if (to === null) return false;
    if (to < 0) {
      announcePolite(dict.reorderList.announce.atTop);
      return true;
    }
    if (to >= ids.length) {
      announcePolite(dict.reorderList.announce.atBottom);
      return true;
    }
    if (to === from) return true;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, productId);
    focusAfterMove.current = productId;
    commitMove(next, productId);
    return true;
  };

  const add = (item: CarouselPickedItem) => {
    if (ids.includes(item.productId)) return;
    onChange([...items, item]);
  };

  const remove = (productId: string) =>
    onChange(items.filter((item) => item.productId !== productId));

  const renderRow = (rowProps: SortableTreeRowRenderProps) => {
    const item = byId.get(rowProps.item.id);
    if (!item) return null;
    return (
      <PickedRow
        key={item.productId}
        item={item}
        position={rowProps.index + 1}
        isDragging={rowProps.isDragging}
        setNodeRef={rowProps.setNodeRef}
        style={rowProps.style}
        handleProps={rowProps.handleProps}
        handleId={`${handleIdPrefix}${item.productId}`}
        keyboardHintId={keyboardHintId}
        onKeyMove={(key) => moveByKey(item.productId, key)}
        onRemove={() => remove(item.productId)}
      />
    );
  };

  return (
    <FormSectionCard
      title={
        <span className="inline-flex items-center gap-2">
          {c.heading}
          <span
            aria-hidden="true"
            className="inline-flex min-w-5 justify-center rounded-full bg-muted px-1.5 text-xs leading-4.5 font-normal tabular-nums"
          >
            {items.length}
          </span>
        </span>
      }
      actions={
        <p className="text-xs text-muted-foreground max-md:hidden">{c.hint}</p>
      }
    >
      <p className="text-xs text-muted-foreground md:hidden">{c.hint}</p>
      <p id={keyboardHintId} className="sr-only">
        {c.keyboardHint}
      </p>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <ProductSearch selectedIds={ids} onAdd={add} />

        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {c.emptyHint}
          </p>
        ) : (
          <ul
            aria-label={c.heading}
            className="flex flex-col overflow-hidden rounded-md border border-border"
          >
            <SortableTree
              items={treeItems}
              maxDepth={1}
              renderRow={renderRow}
              onMove={(_groups, next, movingId) =>
                commitMove(
                  next.map((item) => item.id),
                  movingId,
                )
              }
            />
          </ul>
        )}
      </div>
    </FormSectionCard>
  );
}

interface PickedRowProps {
  item: CarouselPickedItem;
  position: number;
  isDragging: boolean;
  setNodeRef: SortableTreeRowRenderProps["setNodeRef"];
  style: SortableTreeRowRenderProps["style"];
  handleProps: SortableTreeRowRenderProps["handleProps"];
  /** DOM id of the ⠿ — how focus finds it again after a keyboard move. */
  handleId: string;
  keyboardHintId: string;
  onKeyMove: (key: string) => boolean;
  onRemove: () => void;
}

function PickedRow({
  item,
  position,
  isDragging,
  setNodeRef,
  style,
  handleProps,
  handleId,
  keyboardHintId,
  onKeyMove,
  onRemove,
}: PickedRowProps) {
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 border-t border-border bg-card px-2 py-2 first:border-t-0",
        isDragging && "relative z-10 shadow-elevated ring-2 ring-primary",
      )}
    >
      <button
        type="button"
        {...handleProps}
        id={handleId}
        aria-label={dict.reorderList.handleLabel(item.name)}
        aria-describedby={keyboardHintId}
        onKeyDown={(event) => {
          if (onKeyMove(event.key)) event.preventDefault();
        }}
        className="inline-flex size-11 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:size-8"
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <span
        aria-hidden="true"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground"
      >
        {position}
      </span>
      <ProductThumb url={item.imageUrl} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">{item.name}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {formatCurrency(item.price)}
          {!item.isActive && (
            <Badge variant="secondary">{c.inactiveBadge}</Badge>
          )}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="max-md:size-11"
        aria-label={c.removeAria(item.name)}
        onClick={onRemove}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </li>
  );
}

function ProductSearch({
  selectedIds,
  onAdd,
}: {
  selectedIds: readonly string[];
  onAdd: (item: CarouselPickedItem) => void;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
  }, SEARCH_DEBOUNCE_MS);

  const query = useProductControllerAdminFindAll(
    { search, page: 1, limit: SEARCH_PAGE_SIZE },
    { query: { enabled: search.length > 0 } },
  );
  const results = search.length > 0 ? (query.data?.data ?? []) : [];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={input}
          placeholder={c.searchPlaceholder}
          aria-label={c.searchPlaceholder}
          className="pl-9"
          onChange={(event) => {
            setInput(event.target.value);
            debounced(event.target.value);
          }}
          // Inside the carousel <form>: Enter must not submit it.
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </div>

      {search.length === 0 ? (
        <p className="text-xs text-muted-foreground">{c.searchHint}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {c.searchError}
        </p>
      ) : query.isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-12 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.searchEmpty}</p>
      ) : (
        <ul
          aria-label={c.searchPlaceholder}
          className="flex flex-col overflow-hidden rounded-md border border-border"
        >
          {results.map((product) => {
            const added = selectedIds.includes(product.id);
            return (
              <li
                key={product.id}
                className="flex items-center gap-2 border-t border-border px-2 py-2 first:border-t-0"
              >
                <ProductThumb url={product.primaryImage?.url} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-foreground">
                    {product.name}
                  </span>
                  <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>{formatCurrency(product.price)}</span>
                    {product.stock > 0 ? (
                      <span>{c.inStock(product.stock)}</span>
                    ) : (
                      <span className="text-warning">{c.outOfStock}</span>
                    )}
                  </span>
                </span>
                {added ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                    <CheckIcon aria-hidden="true" className="size-3.5" />
                    {c.alreadyAdded}
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() =>
                      onAdd({
                        productId: product.id,
                        name: product.name,
                        imageUrl: product.primaryImage?.url ?? null,
                        price: product.price,
                        isActive: product.isActive,
                      })
                    }
                  >
                    <PlusIcon aria-hidden="true" />
                    {c.addLabel}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProductThumb({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span
        aria-hidden="true"
        className="size-9 shrink-0 rounded-sm border border-dashed border-border bg-muted/50"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a stored product image URL
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-9 shrink-0 rounded-sm object-cover"
    />
  );
}
