"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  getProductControllerFindBySlugQueryOptions,
  type ProductGroupEntity,
  type ProductSiblingEntity,
} from "@/entities/product";
import { getDeviceFamilyTone } from "@/entities/device";
import {
  EMPTY_DEVICES,
  useMyDevices,
  useMyDevicesHydrated,
} from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { colorSwatch, isColorAxis } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  deviceForModelValue,
  findVariantFor,
  isModelAxis,
  modelChipLabel,
} from "../model/model-variants";

/**
 * A text chip (Product mockup §6.6): a 40px pill on the card surface, 600.
 * 44px below `lg`, where a thumb picks it (touch-target minimum).
 */
const CHIP_CLASS =
  "inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold no-underline transition-[background-color,border-color,color,transform] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-98 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100 lg:h-10";
const CHIP_IDLE =
  "border-border bg-card text-foreground hover:border-foreground/35 hover:bg-muted";
const CHIP_SELECTED =
  "border-primary bg-primary text-primary-foreground hover:bg-primary-hover";

interface ProductSiblingNavigatorProps {
  group: ProductGroupEntity;
  /** Attribute values of the position currently shown on the PDP. */
  currentAttributes: Record<string, unknown> | null | undefined;
  /** Slug of the position currently shown (used to skip self-navigation). */
  currentSlug: string;
}

/** Coerce a loosely-typed attribute value to a comparable string. */
function attrValue(
  attributes: Record<string, unknown> | null | undefined,
  axis: string,
): string | null {
  const raw = attributes?.[axis];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Find the sibling position that matches the current position on every axis
 * except `axis`, where it must equal `value`. Returns null when no such active
 * sibling exists (a data gap — the value button is then disabled).
 */
function resolveSibling(
  positions: ProductSiblingEntity[],
  axes: string[],
  currentAttributes: Record<string, unknown> | null | undefined,
  axis: string,
  value: string,
): ProductSiblingEntity | null {
  const match = positions.find((position) => {
    if (!position.isActive) return false;
    if (attrValue(position.attributes, axis) !== value) return false;
    return axes
      .filter((other) => other !== axis)
      .every(
        (other) =>
          attrValue(position.attributes, other) ===
          attrValue(currentAttributes, other),
      );
  });
  return match ?? null;
}

/**
 * ProductSiblingNavigator — renders one selector strip per attribute axis of the
 * product group. Each value leads to the sibling position whose attributes match
 * the current one on every other axis (ktc.ua/Rozetka pattern: switching a value
 * changes the page/URL rather than mutating in place). The current value is
 * marked active; values with no resolvable sibling are disabled.
 *
 * Each reachable value is a real `<Link>`, not a `router.push()` button
 * (TASK-409). That is what fixes «варіанти вантажаться заново»: Next prefetches
 * the sibling ROUTE like any link in view, and hover/focus warms the sibling's
 * PRODUCT QUERY under the very key the PDP reads — so by the time the click
 * lands the detail data is usually already cached and the page swaps instead of
 * falling back to a skeleton. It is also ordinary web navigation: middle-click,
 * ⌘-click and «copy link address» work, which a button never allowed.
 *
 * The current value stays a `<button aria-pressed>` (there is nowhere to go) and
 * an unresolvable value stays a DISABLED `<button>` — a link cannot be disabled,
 * and `aria-disabled` still navigates on Enter.
 */
export function ProductSiblingNavigator({
  group,
  currentAttributes,
  currentSlug,
}: ProductSiblingNavigatorProps) {
  const queryClient = useQueryClient();
  // Saved devices mark «their» model chips — client-only, after hydration, so
  // the cached HTML never carries them.
  const hydrated = useMyDevicesHydrated();
  const savedDevices = useMyDevices();
  const devices = hydrated ? savedDevices : EMPTY_DEVICES;
  // The model axis leads (Product mockup §6.1: model chips, then swatches);
  // the rest keep the group's own order.
  const axes = [...group.axes]
    .sort(
      (a, b) =>
        Number(isModelAxis(b.name)) - Number(isModelAxis(a.name)) ||
        a.sortOrder - b.sortOrder,
    )
    .map((axis) => axis.name);

  if (axes.length === 0) {
    return null;
  }

  /**
   * Warm the sibling's detail query on hover/focus/touch. `prefetchQuery` is a
   * no-op while the key already holds fresh data, so repeated hovers cost
   * nothing beyond the first.
   */
  const prefetchSibling = (slug: string) => {
    void queryClient.prefetchQuery(
      getProductControllerFindBySlugQueryOptions(slug),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {axes.map((axis) => {
        const currentValue = attrValue(currentAttributes, axis);

        // Distinct values for this axis, ordered by the positions' sort order.
        const values: string[] = [];
        for (const position of group.positions) {
          const value = attrValue(position.attributes, axis);
          if (value && !values.includes(value)) {
            values.push(value);
          }
        }

        if (values.length === 0) {
          return null;
        }

        const isColor = isColorAxis(axis);
        const isModel = isModelAxis(axis);

        return (
          <fieldset key={axis} className="flex flex-col">
            <legend className="mb-2 text-sm font-semibold text-foreground first-letter:uppercase">
              {axis}
              {/* Swatches hide the colour text and model chips drop the
                  «iPhone » prefix, so the full current value is named here. */}
              {(isColor || isModel) && currentValue && (
                <span className="font-normal text-muted-foreground">
                  : {currentValue}
                </span>
              )}
            </legend>
            <div
              className={cn("flex flex-wrap", isColor ? "gap-2" : "gap-1.5")}
            >
              {values.map((value) => {
                const isSelected = value === currentValue;
                // A model with no sibling in the current colour still has a
                // variant: open it in its first colour rather than disable it.
                const sibling = isSelected
                  ? null
                  : (resolveSibling(
                      group.positions,
                      axes,
                      currentAttributes,
                      axis,
                      value,
                    ) ??
                    (isModel
                      ? findVariantFor(group, currentAttributes, {
                          name: value,
                        })
                      : null));
                const unavailable = !isSelected && sibling === null;
                // A sibling resolving to the page we are already on is not a
                // destination — it renders as the current value instead.
                const target =
                  sibling && sibling.slug !== currentSlug ? sibling.slug : null;

                // One appearance, two possible elements. `swatch` is null on a
                // text axis; on the colour axis (TASK-215) the round face
                // carries the real colour and the colour TEXT stays the
                // accessible name + tooltip.
                const swatch = isColor ? colorSwatch(value) : null;
                const className = swatch
                  ? `block size-9 rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 ${
                      swatch.isLight ? "border-border" : "border-black/10"
                    } ${
                      isSelected
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "hover:scale-110"
                    }`
                  : cn(CHIP_CLASS, isSelected ? CHIP_SELECTED : CHIP_IDLE);
                const style = swatch ? { background: swatch.css } : undefined;
                // A model chip of one of the shopper's saved devices: a family
                // dot before the name and a tag after it («ваш» / its label).
                const mine = isModel
                  ? deviceForModelValue(value, devices)
                  : null;
                const tag = mine
                  ? (mine.label ?? dict.deviceFit.modelChips.mine)
                  : null;
                const content: ReactNode = swatch ? null : (
                  <>
                    {mine && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          getDeviceFamilyTone(mine.family).strong,
                        )}
                      />
                    )}
                    {isModel ? modelChipLabel(value) : value}
                    {tag && mine && (
                      <small
                        className={cn(
                          "rounded-full px-1.5 py-px text-xs leading-tight font-bold text-foreground",
                          getDeviceFamilyTone(mine.family).surface,
                        )}
                      >
                        {tag}
                      </small>
                    )}
                  </>
                );
                // The chip drops «iPhone » and may carry a tag, so the full
                // model (plus the tag) is the accessible name.
                const label = swatch
                  ? value
                  : isModel
                    ? tag
                      ? `${value} · ${tag}`
                      : value
                    : undefined;

                if (target) {
                  return (
                    <Link
                      key={value}
                      href={`/products/${target}`}
                      aria-label={label}
                      title={swatch ? value : undefined}
                      onMouseEnter={() => prefetchSibling(target)}
                      onFocus={() => prefetchSibling(target)}
                      onTouchStart={() => prefetchSibling(target)}
                      style={style}
                      className={className}
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={label}
                    title={swatch ? value : undefined}
                    disabled={unavailable}
                    style={style}
                    className={className}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
