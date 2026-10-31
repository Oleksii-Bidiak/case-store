// «Сам … у продажу» (TASK-2069, Д3-2): the device itself among the products.
//
// The store sells smartphones (and watches) too. A device of the recognised
// model = a product of the device's own category whose NAME names that model:
// «Смартфон Apple iPhone 15 Pro» for iPhone 15 Pro — not iPhone 15, not
// iPhone 15 Pro Max, and never an accessory «… для iPhone 15 Pro».

import {
  detectDeviceModelInQuery,
  type MatchableDeviceModel,
} from "@/entities/device";
import {
  SEARCH_GRID_ROW,
  parseDeviceQuery,
  type DeviceKind,
} from "@/features/search";

/**
 * The category a device of each kind is filed under (seed slugs — a contract,
 * see prisma/seed/data/categories.data.ts). Watches use the LEAF «Смарт-
 * годинники», not the root, whose subtree also holds the straps. No tablets
 * category exists yet: the unknown slug matches nothing, so an iPad reads as
 * "not sold" — which is true.
 */
export const DEVICE_SALE_CATEGORY: Readonly<Record<DeviceKind, string>> = {
  phone: "smartphones",
  watch: "smart-watches",
  tablet: "tablets",
};

/** How many device cards the block shows — one row of the /search grid at `xl`. */
export const MAX_SOLD_DEVICES = SEARCH_GRID_ROW;

/**
 * The products that ARE the model. `models` is the full model list — the name
 * must name THIS model better than any other one.
 */
export function pickSoldDevices<
  P extends { name: string },
  M extends MatchableDeviceModel,
>(products: readonly P[], model: M, models: readonly M[]): P[] {
  return products.filter((product) => {
    // «Ремінець … для Apple Watch Series 10» names the model too — but an
    // accessory word means it is not the device.
    if (parseDeviceQuery(product.name).productWord !== null) return false;
    return (
      detectDeviceModelInQuery(product.name, models)?.match.model.name ===
      model.name
    );
  });
}

interface PricedProduct {
  price: string;
  variantSummary?: { priceFrom: string } | null;
}

/** The cheapest «від» price across the devices, as a decimal string. */
export function minDevicePrice(
  products: readonly PricedProduct[],
): string | null {
  let min = Number.POSITIVE_INFINITY;
  for (const p of products) {
    const value = Number(p.variantSummary?.priceFrom ?? p.price);
    if (Number.isFinite(value) && value < min) min = value;
  }
  return Number.isFinite(min) ? String(min) : null;
}

const countFormatter = new Intl.NumberFormat("uk-UA");

/** Digits grouped with a space, no noun: «1 280». */
export function formatCount(n: number): string {
  return countFormatter.format(n);
}
