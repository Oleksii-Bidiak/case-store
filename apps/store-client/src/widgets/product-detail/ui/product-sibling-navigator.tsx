"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  getProductControllerFindBySlugQueryOptions,
  type ProductGroupEntity,
  type ProductSiblingEntity,
} from "@/entities/product";
import { colorSwatch } from "@/shared/lib";

/**
 * Axis names treated as the COLOUR axis (rendered as round swatches instead of
 * text chips). Attribute keys are free-form admin data — seed uses `color`.
 */
const COLOR_AXES = new Set(["color", "colour", "колір"]);

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
  const axes = [...group.axes]
    .sort((a, b) => a.sortOrder - b.sortOrder)
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

        const isColorAxis = COLOR_AXES.has(axis.trim().toLowerCase());

        return (
          <fieldset key={axis} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium capitalize text-foreground">
              {axis}
              {/* Swatches hide the colour text, so surface the current one here. */}
              {isColorAxis && currentValue && (
                <span className="font-normal text-muted-foreground">
                  : {currentValue}
                </span>
              )}
            </legend>
            <div className="flex flex-wrap gap-2">
              {values.map((value) => {
                const isSelected = value === currentValue;
                const sibling = isSelected
                  ? null
                  : resolveSibling(
                      group.positions,
                      axes,
                      currentAttributes,
                      axis,
                      value,
                    );
                const unavailable = !isSelected && sibling === null;
                // A sibling resolving to the page we are already on is not a
                // destination — it renders as the current value instead.
                const target =
                  sibling && sibling.slug !== currentSlug ? sibling.slug : null;

                // One appearance, two possible elements. `swatch` is null on a
                // text axis; on the colour axis (TASK-215) the round face
                // carries the real colour and the colour TEXT stays the
                // accessible name + tooltip.
                const swatch = isColorAxis ? colorSwatch(value) : null;
                const className = swatch
                  ? `block size-9 rounded-full border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 ${
                      swatch.isLight ? "border-border" : "border-black/10"
                    } ${
                      isSelected
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "hover:scale-110"
                    }`
                  : `rounded-lg border-2 px-4 py-2 text-sm font-medium capitalize no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-foreground hover:border-primary"
                    }`;
                const style = swatch ? { background: swatch.css } : undefined;
                const content: ReactNode = swatch ? null : value;

                if (target) {
                  return (
                    <Link
                      key={value}
                      href={`/products/${target}`}
                      aria-label={swatch ? value : undefined}
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
                    aria-label={swatch ? value : undefined}
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
