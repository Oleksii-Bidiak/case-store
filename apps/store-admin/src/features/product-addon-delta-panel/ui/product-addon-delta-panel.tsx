"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAddonServiceControllerGetProductDeltasQueryKey,
  getAddonServiceControllerResolveForProductQueryKey,
  useAddonServiceControllerAdminFindActive,
  useAddonServiceControllerClearProductDelta,
  useAddonServiceControllerGetProductDeltas,
  useAddonServiceControllerResolveForProduct,
  useAddonServiceControllerSetProductDelta,
  type AddonServiceEntity,
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

/**
 * One add-on an operator picked BEFORE the product existed (TASK-442). Replayed
 * as a `PUT .../deltas/product/:id/:addonServiceId` with `type: "ADD"` once it
 * does. `name` travels with the id purely so a failure can be reported in words
 * the operator recognises.
 */
export interface StagedAddon {
  addonServiceId: string;
  name: string;
  /** Own price for this product; `undefined` = the catalogue price. */
  price?: number;
}

interface ProductAddonDeltaPanelProps {
  /**
   * The product whose exceptions these are. Omitted in STAGED mode (TASK-442),
   * on `/products/new`.
   */
  productId?: string;
  /** STAGED mode: the exclusive add-ons picked so far. */
  value?: StagedAddon[];
  /** STAGED mode: the full next list, after a pick / price edit / removal. */
  onStage?: (next: StagedAddon[]) => void;
}

const NO_STAGED_ADDONS: StagedAddon[] = [];

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
 *   - «власна ціна» → this product's own price for the service. On an INHERITED
 *                     entry that is an OVERRIDE delta (the template keeps its
 *                     own price); on a product-exclusive one it stays an ADD,
 *                     because one row per pair means an OVERRIDE would replace
 *                     the ADD and leave nothing to override (TASK-404);
 *   - the picker    → an ADD delta: a service exclusive to this product,
 *                     independent of any template;
 *   - «скасувати»   → DELETE the delta row entirely, reverting the product to
 *                     pure inheritance for that service.
 *
 * The list shows the RESOLVED set (what a customer actually sees), so a REMOVEd
 * service is absent from it — it is listed separately under "прибрані" so the
 * removal stays reversible.
 *
 * STAGED MODE (TASK-442). Without a `productId` there is nothing to resolve and
 * nothing to except FROM — inheritance is a property of a row that exists — so
 * the panel narrows to the one thing that does make sense up front: picking
 * services exclusive to this product, optionally at their own price. Those two
 * product-keyed queries go `enabled: false`; the CATALOGUE query stays live,
 * because it is keyed by nothing.
 */
export function ProductAddonDeltaPanel({
  productId,
  value,
  onStage,
}: ProductAddonDeltaPanelProps) {
  const queryClient = useQueryClient();
  const isStaged = !productId;
  const stagedAddons = value ?? NO_STAGED_ADDONS;

  const resolved = useAddonServiceControllerResolveForProduct(productId ?? "", {
    query: { enabled: !isStaged },
  });
  const deltas = useAddonServiceControllerGetProductDeltas(productId ?? "", {
    query: { enabled: !isStaged },
  });
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
    if (!productId) return;
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
    if (!productId) return;
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
    if (!productId) return;
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

  /**
   * Save the typed price — as the delta type this entry ALREADY is (TASK-404).
   *
   * There is one delta row per (product, add-on) pair, so ADD/REMOVE/OVERRIDE
   * are mutually exclusive: sending OVERRIDE for a product-exclusive entry
   * replaced its ADD row, leaving an OVERRIDE with no template row under it —
   * and the service disappeared from the product. An exclusive keeps its own
   * price as an ADD; only an inherited (or already overridden) entry overrides.
   */
  const submitPrice = (addon: ResolvedAddonEntity) => {
    const price = Number(priceDraft);
    if (priceDraft.trim() === "" || Number.isNaN(price) || price < 0) {
      toast.error(d.toastBadPrice);
      return;
    }
    mutateDelta(
      addon.addonServiceId,
      addon.source === "add" ? "ADD" : "OVERRIDE",
      price,
    );
  };

  // ── STAGED mode (TASK-442) ────────────────────────────────────────────────
  const stageAdd = (addonServiceId: string) => {
    const service = services.find((row) => row.id === addonServiceId);
    if (!service) return;
    onStage?.([...stagedAddons, { addonServiceId, name: service.name }]);
    setAddPick("");
  };

  const stageRemove = (addonServiceId: string) =>
    onStage?.(
      stagedAddons.filter((row) => row.addonServiceId !== addonServiceId),
    );

  const stagePrice = (addonServiceId: string) => {
    const price = Number(priceDraft);
    if (priceDraft.trim() === "" || Number.isNaN(price) || price < 0) {
      toast.error(d.toastBadPrice);
      return;
    }
    onStage?.(
      stagedAddons.map((row) =>
        row.addonServiceId === addonServiceId ? { ...row, price } : row,
      ),
    );
    setPriceDraftFor(null);
  };

  // Only services that are NOT already resolved for this product can be added as
  // an exclusive — offering to "add" something already on the list is noise.
  // Staged mode has no resolved set; the staged picks play that role.
  const resolvedIds = new Set(
    isStaged
      ? stagedAddons.map((row) => row.addonServiceId)
      : addons.map((addon) => addon.addonServiceId),
  );
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

      {isStaged ? (
        <>
          <p className="text-sm text-muted-foreground">{d.stagedHint}</p>
          {stagedAddons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.stagedEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {stagedAddons.map((row) => {
                const service = services.find(
                  (candidate) => candidate.id === row.addonServiceId,
                );
                const isEditingPrice = priceDraftFor === row.addonServiceId;
                const shownPrice =
                  row.price !== undefined
                    ? String(row.price)
                    : (service?.price ?? "");

                return (
                  <li
                    key={row.addonServiceId}
                    className="flex flex-col gap-2 rounded-md border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 text-sm font-medium text-foreground">
                        {row.name}
                      </span>
                      <span className="font-mono text-sm text-muted-foreground">
                        {shownPrice}
                      </span>
                      <Badge variant="default">{d.badgeExclusive}</Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isEditingPrice ? (
                        <>
                          <Label
                            htmlFor={`addon-price-${row.addonServiceId}`}
                            className="sr-only"
                          >
                            {d.ownPriceLabel(row.name)}
                          </Label>
                          <Input
                            id={`addon-price-${row.addonServiceId}`}
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
                            onClick={() => stagePrice(row.addonServiceId)}
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
                            onClick={() => {
                              setPriceDraftFor(row.addonServiceId);
                              setPriceDraft(shownPrice);
                            }}
                          >
                            {d.actionOwnPrice}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => stageRemove(row.addonServiceId)}
                          >
                            {d.actionRevert}
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <AddonPicker
            addable={addable}
            value={addPick}
            onChange={setAddPick}
            disabled={false}
            onAdd={() => stageAdd(addPick)}
          />
        </>
      ) : isLoading ? (
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
                            onClick={() => submitPrice(addon)}
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

          <AddonPicker
            addable={addable}
            value={addPick}
            onChange={setAddPick}
            disabled={isPending}
            onAdd={() => mutateDelta(addPick, "ADD")}
          />
        </>
      )}
    </section>
  );
}

interface AddonPickerProps {
  addable: AddonServiceEntity[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onAdd: () => void;
}

/**
 * The "make a service exclusive to this product" picker — identical in both
 * modes, and the ONLY control staged mode offers. Extracted so the staged branch
 * reuses it verbatim instead of growing a near-copy that drifts.
 */
function AddonPicker({
  addable,
  value,
  onChange,
  disabled,
  onAdd,
}: AddonPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onValueChange={onChange}>
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
        disabled={!value || disabled}
        onClick={onAdd}
      >
        {d.actionAdd}
      </Button>
    </div>
  );
}
