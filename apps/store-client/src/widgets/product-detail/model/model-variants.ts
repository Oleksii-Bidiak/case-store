// Model variants of a product group (Product mockup §6.3 c/f, §6.6, rule 7).
//
// A case sold for several phones is ONE group whose positions differ on a
// «Модель» axis («iPhone 15 Pro», «iPhone 15», …). The API does not send the
// compatible models of each sibling, so a sibling is tied to a saved device
// by its model-axis VALUE: the value names a device model, and it is compared
// with the device's catalogue name after normalisation. No model axis, or a
// value that names no saved device → no variant (the row then says «Не
// підходить», never a guessed «є варіант»).

import type { MyDevice } from "@/entities/my-devices";
import type {
  ProductGroupEntity,
  ProductSiblingEntity,
} from "@/entities/product";

type Attributes = Record<string, unknown> | null | undefined;

/** «Модель», «Модель пристрою», «model» — the axis that names the device. */
export function isModelAxis(name: string): boolean {
  // `\b` is ASCII-only in JS: it never matches after a Cyrillic word.
  return /^(модель|model)(?![\p{L}\p{N}])/iu.test(name.trim());
}

/** The group's model axis name, or `null` when it varies on other axes only. */
export function findModelAxis(group: ProductGroupEntity | null | undefined) {
  return group?.axes.find((axis) => isModelAxis(axis.name))?.name ?? null;
}

function attr(attributes: Attributes, axis: string): string | null {
  const raw = attributes?.[axis];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** `iPhone 15 Pro+` / `iphone-15-pro-plus` → `iphone15proplus`. */
export function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** The chip text: the model name without the «iPhone » prefix (§6.6). */
export function modelChipLabel(value: string): string {
  return value.replace(/^iphone\s+/i, "");
}

/** The saved device a model-axis value names, if any. */
export function deviceForModelValue<D extends Pick<MyDevice, "name">>(
  value: string,
  devices: readonly D[],
): D | null {
  const key = normalizeModelName(value);
  return devices.find((d) => normalizeModelName(d.name) === key) ?? null;
}

/** The current position's model-axis value («iPhone 15 Pro»), if any. */
export function currentModelValue(
  group: ProductGroupEntity | null | undefined,
  attributes: Attributes,
): string | null {
  const axis = findModelAxis(group);
  return axis ? attr(attributes, axis) : null;
}

/**
 * The active sibling made for `device`: its model value names the device;
 * among those, the one that matches the current position on every OTHER axis
 * (same colour) wins, else the first in sort order. `null` = no variant.
 * May return the current position itself — the caller compares slugs.
 */
export function findVariantFor(
  group: ProductGroupEntity | null | undefined,
  currentAttributes: Attributes,
  device: Pick<MyDevice, "name">,
): ProductSiblingEntity | null {
  const axis = findModelAxis(group);
  if (!group || !axis) return null;
  const key = normalizeModelName(device.name);
  const candidates = [...group.positions]
    .filter((p) => p.isActive)
    .filter((p) => {
      const value = attr(p.attributes, axis);
      return value !== null && normalizeModelName(value) === key;
    })
    .sort((a, b) => a.positionOrder - b.positionOrder);
  if (candidates.length === 0) return null;
  const others = group.axes.map((a) => a.name).filter((n) => n !== axis);
  return (
    candidates.find((p) =>
      others.every(
        (other) => attr(p.attributes, other) === attr(currentAttributes, other),
      ),
    ) ?? candidates[0]
  );
}

/** One chip of the «Є варіанти для» list in the «Сумісність» tab. */
export interface ModelVariant {
  /** The model-axis value, e.g. «iPhone 15». */
  model: string;
  /** The sibling to open. */
  slug: string;
}

/**
 * Every OTHER model the group is made for, each with the sibling to open
 * (same colour where possible), in the group's sort order.
 */
export function otherModelVariants(
  group: ProductGroupEntity | null | undefined,
  currentAttributes: Attributes,
): ModelVariant[] {
  const axis = findModelAxis(group);
  if (!group || !axis) return [];
  const current = attr(currentAttributes, axis);
  const seen = new Set<string>();
  const out: ModelVariant[] = [];
  for (const position of [...group.positions].sort(
    (a, b) => a.positionOrder - b.positionOrder,
  )) {
    const model = attr(position.attributes, axis);
    if (!model || model === current || seen.has(model)) continue;
    seen.add(model);
    const sibling = findVariantFor(group, currentAttributes, { name: model });
    if (sibling) out.push({ model, slug: sibling.slug });
  }
  return out;
}
