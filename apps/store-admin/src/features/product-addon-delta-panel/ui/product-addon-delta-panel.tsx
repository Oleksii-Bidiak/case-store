"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAddonServiceControllerGetProductDeltasQueryKey,
  getAddonServiceControllerResolveForProductQueryKey,
  useAddonServiceControllerAdminFindActive,
  useAddonServiceControllerClearProductDelta,
  useAddonServiceControllerGetProductDeltas,
  useAddonServiceControllerResolveForProduct,
  useAddonServiceControllerSetProductDelta,
  type ResolvedAddonEntity,
} from "@/entities/addon-service";
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";

interface ProductAddonDeltaPanelProps {
  productId: string;
}

const d = dict.products.addonDeltas;

/** Badge copy + variant per resolved-entry source. */
function badgeFor(source: ResolvedAddonEntity["source"]) {
  switch (source) {
    case "add":
      return { label: d.badgeExclusive, variant: "default" as const };
    case "override":
      return { label: d.badgeOverridden, variant: "secondary" as const };
    default:
      return { label: d.badgeTemplate, variant: "outline" as const };
  }
}

/**
 * Product add-on delta panel (TASK-174).
 *
 * A product INHERITS the add-on services its category's template offers — live,
 * with no row of its own. This panel manages the exceptions to that, one add-on
 * at a time:
 *
 *   - «прибрати»    → a REMOVE delta: suppress an inherited service here only;
 *   - «власна ціна» → an OVERRIDE delta: this product's own price for an
 *                     inherited service (the template keeps its own);
 *   - the picker    → an ADD delta: a service exclusive to this product,
 *                     independent of any template;
 *   - «скасувати»   → DELETE the delta row entirely, reverting the product to
 *                     pure inheritance for that service.
 *
 * The list shows the RESOLVED set (what a customer actually sees), so a REMOVEd
 * service is absent from it — it is listed separately under "прибрані" so the
 * removal stays reversible.
 */
export function ProductAddonDeltaPanel({
  productId,
}: ProductAddonDeltaPanelProps) {
  const queryClient = useQueryClient();

  const resolved = useAddonServiceControllerResolveForProduct(productId);
  const deltas = useAddonServiceControllerGetProductDeltas(productId);
  const catalog = useAddonServiceControllerAdminFindActive();

  const setDelta = useAddonServiceControllerSetProductDelta();
  const clearDelta = useAddonServiceControllerClearProductDelta();

  /** Which add-on's price input is open, and its current draft value. */
  const [priceDraftFor, setPriceDraftFor] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [addPick, setAddPick] = useState("");

  const addons = resolved.data?.data ?? [];
  const deltaRows = deltas.data?.data ?? [];
  const services = catalog.data?.data ?? [];

  const removed = deltaRows.filter((row) => row.type === "REMOVE");

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getAddonServiceControllerResolveForProductQueryKey(productId),
    });
    void queryClient.invalidateQueries({
      queryKey: getAddonServiceControllerGetProductDeltasQueryKey(productId),
    });
  };

  const mutateDelta = (
    addonServiceId: string,
    type: "ADD" | "REMOVE" | "OVERRIDE",
    price?: number,
  ) => {
    setDelta.mutate(
      {
        productId,
        addonServiceId,
        data: price === undefined ? { type } : { type, price },
      },
      {
        onSuccess: () => {
          invalidate();
          setPriceDraftFor(null);
          setAddPick("");
          toast.success(d.toastSaved);
        },
        onError: () => toast.error(d.toastFailed),
      },
    );
  };

  const revert = (addonServiceId: string) => {
    clearDelta.mutate(
      { productId, addonServiceId },
      {
        onSuccess: () => {
          invalidate();
          toast.success(d.toastReverted);
        },
        onError: () => toast.error(d.toastFailed),
      },
    );
  };

  const submitPrice = (addonServiceId: string) => {
    const price = Number(priceDraft);
    if (priceDraft.trim() === "" || Number.isNaN(price) || price < 0) {
      toast.error(d.toastBadPrice);
      return;
    }
    mutateDelta(addonServiceId, "OVERRIDE", price);
  };

  // Only services that are NOT already resolved for this product can be added as
  // an exclusive — offering to "add" something already on the list is noise.
  const resolvedIds = new Set(addons.map((addon) => addon.addonServiceId));
  const addable = services.filter((service) => !resolvedIds.has(service.id));

  const isLoading = resolved.isLoading || deltas.isLoading;
  const isError = resolved.isError || deltas.isError;
  const isPending = setDelta.isPending || clearDelta.isPending;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-foreground">{d.heading}</h3>
        <p className="text-sm text-muted-foreground">{d.hint}</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-8 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadError}
        </p>
      ) : (
        <>
          {addons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.emptyResolved}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {addons.map((addon) => {
                const badge = badgeFor(addon.source);
                const isInherited = addon.source === "template";
                const isEditingPrice = priceDraftFor === addon.addonServiceId;

                return (
                  <li
                    key={addon.addonServiceId}
                    className="flex flex-col gap-2 rounded-md border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 text-sm font-medium text-foreground">
                        {addon.name}
                      </span>
                      <span className="font-mono text-sm text-muted-foreground">
                        {addon.price}
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isEditingPrice ? (
                        <>
                          <Label
                            htmlFor={`addon-price-${addon.addonServiceId}`}
                            className="sr-only"
                          >
                            {d.ownPriceLabel(addon.name)}
                          </Label>
                          <Input
                            id={`addon-price-${addon.addonServiceId}`}
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-32"
                            value={priceDraft}
                            onChange={(event) =>
                              setPriceDraft(event.target.value)
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            onClick={() => submitPrice(addon.addonServiceId)}
                          >
                            {dict.common.save}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setPriceDraftFor(null)}
                          >
                            {dict.common.cancel}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => {
                              setPriceDraftFor(addon.addonServiceId);
                              setPriceDraft(addon.price);
                            }}
                          >
                            {d.actionOwnPrice}
                          </Button>

                          {/* An ADD entry is not "inherited", so removing it makes
                              no sense — it is cleared instead. */}
                          {isInherited ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() =>
                                mutateDelta(addon.addonServiceId, "REMOVE")
                              }
                            >
                              {d.actionRemove}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() => revert(addon.addonServiceId)}
                            >
                              {d.actionRevert}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* REMOVEd services are absent from the resolved list above — surface
              them here so the opt-out stays visible and reversible. */}
          {removed.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">
                {d.removedHeading}
              </p>
              <ul className="flex flex-col gap-2">
                {removed.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-3"
                  >
                    <span className="flex-1 text-sm text-muted-foreground line-through">
                      {row.addonServiceName}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => revert(row.addonServiceId)}
                    >
                      {d.actionRevert}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Exclusive ADD picker. */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={addPick} onValueChange={setAddPick}>
              <SelectTrigger className="w-72" aria-label={d.addPickerAria}>
                <SelectValue placeholder={d.addPickerPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {addable.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={!addPick || isPending}
              onClick={() => mutateDelta(addPick, "ADD")}
            >
              {d.actionAdd}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
