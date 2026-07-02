// Per-item add-on service offers (warranty / insurance / setup) shown under a
// cart line — a FRONT-END STUB. There is no backend for add-on services yet
// (TASK-174): selections live in client state only, are surfaced in the cart
// summary, but are NOT persisted through checkout. When the feature ships this
// catalog is replaced by real API data.

export interface AddonService {
  id: string;
  label: string;
  /** Price in UAH (major units, integer). */
  price: number;
}

export const ADDON_SERVICES: readonly AddonService[] = [
  { id: "warranty1", label: "Сертифікат «+1 рік гарантії»", price: 660 },
  { id: "insurance", label: "Страхування «Save Plus»", price: 1375 },
  { id: "setup", label: "Налаштування та перенесення даних", price: 299 },
] as const;

// Offers only make sense for higher-value goods; without a product category on
// the cart line we gate by price (stub heuristic — real applicability is
// per-product once the backend owns it).
const ADDON_MIN_PRICE = 2000;

/** Which add-on services apply to a cart line (empty for low-value items). */
export function addonServicesForItem(item: { price: string }): AddonService[] {
  return parseFloat(item.price) >= ADDON_MIN_PRICE ? [...ADDON_SERVICES] : [];
}

/** Stable key for a selected {line, service} pair in the CartView state map. */
export function addonKey(itemId: string, serviceId: string): string {
  return `${itemId}:${serviceId}`;
}
