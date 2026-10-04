"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import {
  useProductControllerAdminFindAll,
  type ProductEntity,
} from "@/entities/product";
import { useProductGroupControllerFindAll } from "@/entities/product-group";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/shared/ui";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { formatCurrency } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

const g = dict.productGroups;

const PAGE = 20;

interface AddPositionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onAdd: (ids: string[]) => void;
  isPending: boolean;
}

/**
 * «Додати позиції в групу» (ProductGroupsProposal ГТ7): search the catalogue,
 * tick products, add them in one write (`PATCH /products/group`, the same bulk
 * endpoint the product list uses). A product already in a group cannot be
 * ticked — the API would silently MOVE it, and taking a variant out of another
 * family by accident is the mistake this guards against.
 *
 * The artboard scopes the search to the group's category; the group payload
 * carries no category, so the search covers the catalogue (API tail).
 */
export function AddPositionsDialog({
  open,
  onOpenChange,
  groupId,
  onAdd,
  isPending,
}: AddPositionsDialogProps) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const debounced = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
  }, 300);

  const results = useProductControllerAdminFindAll(
    { page: 1, limit: PAGE, search: search || undefined },
    { query: { enabled: open && search.length > 0 } },
  );
  // No page/limit: the complete list — only to NAME the group a product is in.
  const groups = useProductGroupControllerFindAll(undefined, {
    query: { enabled: open },
  });
  const groupNames = useMemo(
    () =>
      new Map((groups.data?.data ?? []).map((group) => [group.id, group.name])),
    [groups.data],
  );

  const products = results.data?.data ?? [];

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const close = (next: boolean) => {
    if (!next) {
      setText("");
      setSearch("");
      setSelected(new Set());
    }
    onOpenChange(next);
  };

  const blockedReason = (product: ProductEntity): string | null => {
    if (!product.groupId) return null;
    if (product.groupId === groupId) return g.pickerInThis;
    const name = groupNames.get(product.groupId);
    return name ? g.pickerInOther(name) : g.pickerInOtherUnnamed;
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-150">
        <DialogHeader>
          <DialogTitle>{g.pickerTitle}</DialogTitle>
          <DialogDescription>{g.pickerHint}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={text}
            aria-label={g.pickerSearchAria}
            placeholder={g.pickerSearch}
            className="pl-9"
            onChange={(event) => {
              setText(event.target.value);
              debounced(event.target.value);
            }}
          />
        </div>

        {search.length === 0 ? (
          <p className="text-sm text-muted-foreground">{g.pickerPrompt}</p>
        ) : results.isLoading ? (
          <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground">{g.pickerEmpty}</p>
        ) : (
          <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border">
            {products.map((product) => {
              const blocked = blockedReason(product);
              const checkboxId = `pick-${product.id}`;
              const facts = [
                ...Object.entries(product.attributes ?? {}).map(
                  ([name, value]) => `${name}: ${String(value)}`,
                ),
                formatCurrency(product.price),
              ].join(" · ");
              return (
                <li
                  key={product.id}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5",
                    selected.has(product.id) && "bg-primary/7",
                    blocked && "text-muted-foreground",
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={selected.has(product.id)}
                    disabled={Boolean(blocked)}
                    onCheckedChange={() => toggle(product.id)}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={checkboxId}
                    className="flex min-w-0 flex-col gap-0.5"
                  >
                    <span
                      className={cn(
                        "text-sm font-medium break-words",
                        blocked ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {product.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {blocked ?? facts}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {g.pickerSelected(selected.size)}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              className="max-md:h-11"
            >
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              disabled={selected.size === 0 || isPending}
              onClick={() => onAdd([...selected])}
              className="max-md:h-11"
            >
              {isPending ? dict.common.saving : g.pickerSubmit(selected.size)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
