/**
 * Delivery settings, pickup points and the Nova Poshta references the seeded
 * orders point at (TASK-2569 / TASK-2563).
 *
 * The seed never calls Nova Poshta. The refs below were fetched ONCE from the
 * public NP API (`searchSettlements` → `DeliveryCity`, `getWarehouses`), keyless,
 * on 2026-11-25, and are frozen here. They are the values the storefront stores
 * as `npCityRef` / `npWarehouseRef` when a shopper picks a city and a branch, so
 * an order seeded with them reads exactly like one placed at checkout.
 */

/** Courier delivery as the shop configures it in «Налаштування → Доставка». */
export const COURIER_SETTINGS = {
  cityName: 'Київ',
  /** UAH. */
  price: 150,
  /** UAH; a product subtotal from this amount up rides free (`isCourierFree`). */
  freeFrom: 3000,
} as const;

/**
 * The Nova Poshta shipping cost booked on a seeded NP order, in UAH.
 *
 * At checkout this is the carrier's own estimate (`DeliveryService.estimateShipping`
 * via `OrderService.estimateNpShipping`), a network call the seed cannot make. One
 * fixed, plausible value for a small parcel stands in for it — NOT a rule of the
 * shop (there is no "free from N" for Nova Poshta).
 */
export const NP_SHIPPING_ESTIMATE = 95;

/** One NP branch as the storefront's autocomplete returns it. */
export interface NpBranchSeed {
  ref: string;
  /** NP `Description` — what checkout writes into `address1` and `npWarehouseName`. */
  name: string;
}

/** One NP city with two of its branches. */
export interface NpCitySeed {
  /** The NP `DeliveryCity` ref — the value stored as `npCityRef`. */
  ref: string;
  name: string;
  branches: [NpBranchSeed, NpBranchSeed];
}

export const NP_CITIES = {
  kyiv: {
    ref: '8d5a980d-391c-11dd-90d9-001a92567626',
    name: 'Київ',
    branches: [
      {
        ref: '1ec09d88-e1c2-11e3-8c4a-0050568002cf',
        name: 'Відділення №1: вул. Пирогівський шлях, 135',
      },
      { ref: '7b422fbe-e1b8-11e3-8c4a-0050568002cf', name: 'Відділення №2: вул. Богатирська, 11' },
    ],
  },
  lviv: {
    ref: 'db5c88f5-391c-11dd-90d9-001a92567626',
    name: 'Львів',
    branches: [
      { ref: '1ec09d2e-e1c2-11e3-8c4a-0050568002cf', name: 'Відділення №1: вул. Городоцька, 359' },
      { ref: '39931b6c-e1c2-11e3-8c4a-0050568002cf', name: 'Відділення №2: вул. Пластова, 7' },
    ],
  },
  odesa: {
    ref: 'db5c88d0-391c-11dd-90d9-001a92567626',
    name: 'Одеса',
    branches: [
      {
        ref: '7b422fc4-e1b8-11e3-8c4a-0050568002cf',
        name: 'Відділення №2: вул. Базова, 16 (Промринок, 7 км)',
      },
      {
        ref: '169227dc-e1c2-11e3-8c4a-0050568002cf',
        name: 'Відділення №3: вул. Дальницька, 23/4',
      },
    ],
  },
} as const satisfies Record<string, NpCitySeed>;

export type NpCityKey = keyof typeof NP_CITIES;

/** A pickup point as the admin creates it (`CreatePickupPointDto`). */
export interface PickupPointSeed {
  /** Seed key — the id is `deterministicUuid('pickup-point-' + key)`. */
  key: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  workingHours: string | null;
  mapUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

/**
 * Two points the storefront offers and one switched off — the admin list shows
 * the toggle, and no seeded order is ever placed at the inactive one (checkout
 * refuses an inactive point, `OrderService.resolvePickupPoint`).
 */
export const pickupPointsData: PickupPointSeed[] = [
  {
    key: 'kyiv-khreshchatyk',
    name: 'Магазин на Хрещатику',
    city: 'Київ',
    address: 'вул. Хрещатик, 22',
    phone: '+380441234567',
    workingHours: 'Пн–Пт 10:00–20:00, Сб–Нд 11:00–18:00',
    mapUrl:
      'https://maps.google.com/?q=%D0%9A%D0%B8%D1%97%D0%B2+%D0%A5%D1%80%D0%B5%D1%89%D0%B0%D1%82%D0%B8%D0%BA+22',
    isActive: true,
    sortOrder: 0,
  },
  {
    key: 'lviv-rynok',
    name: 'Шоурум у Львові',
    city: 'Львів',
    address: 'пл. Ринок, 10',
    phone: '+380322345678',
    workingHours: 'Щодня 10:00–19:00',
    mapUrl: null,
    isActive: true,
    sortOrder: 1,
  },
  {
    key: 'kyiv-podil',
    name: 'Точка на Подолі (зачинена на ремонт)',
    city: 'Київ',
    address: 'вул. Сагайдачного, 5',
    phone: null,
    workingHours: null,
    mapUrl: null,
    isActive: false,
    sortOrder: 2,
  },
];
