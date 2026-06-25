"use client";

import { useRouter } from "next/navigation";
import type {
  ProductGroupEntity,
  ProductSiblingEntity,
} from "@/entities/product";

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
 * product group. Each value button navigates to the sibling position whose
 * attributes match the current one on every other axis (ktc.ua/Rozetka pattern:
 * switching a value changes the page/URL rather than mutating in place). The
 * current value is marked active; values with no resolvable sibling are disabled.
 */
export function ProductSiblingNavigator({
  group,
  currentAttributes,
  currentSlug,
}: ProductSiblingNavigatorProps) {
  const router = useRouter();
  const axes = [...group.axes]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((axis) => axis.name);

  if (axes.length === 0) {
    return null;
  }

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

        return (
          <fieldset key={axis} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium capitalize text-foreground">
              {axis}
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

                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={unavailable}
                    onClick={() => {
                      if (sibling && sibling.slug !== currentSlug) {
                        router.push(`/products/${sibling.slug}`);
                      }
                    }}
                    className={`rounded-lg border-2 px-4 py-2 text-sm font-medium capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                      isSelected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-foreground hover:border-primary"
                    }`}
                  >
                    {value}
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
