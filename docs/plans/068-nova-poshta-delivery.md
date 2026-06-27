# Plan: Nova Poshta Delivery Integration

> **Status:** 🔄 In Progress
> **Phase:** Phase 3 — Checkout & Orders (Tier 1 Ukrainian business practice extension)
> **Created:** 2026-06-27
> **Last Updated:** 2026-06-27
> **BACKLOG Task:** TASK-080

---

## Overview

Replace the free-text city + delivery-address fields in checkout with Nova Poshta API-backed
autocompletes. The customer selects a Ukrainian city by name (NP city search), then selects an NP
branch (warehouse) within that city. The backend proxy calls the NP API (keeping the API key
server-side), caches NP reference data via the existing Redis/in-memory `CacheService`, computes a
shipping cost + ETA estimate, persists the NP city/warehouse refs in the `shippingAddress` JSON
snapshot on the Order, and stores the estimated `shippingCost` on the Order row (the column already
exists with a default of 0.00 — the order/address path needs **no** Prisma migration). The only
schema change is the new `DeliverySetting` singleton table (TASK-080-E) that holds the
admin-configurable dispatch origin used to parameterise the cost estimate.

Manual (free-text) delivery remains available as a graceful fallback when `NP_API_KEY` is not
configured.

---

## Scope

### In Scope

- New `DeliveryModule` in `store-api` with a `NovaPoshtaClient` (Node.js built-in `fetch`),
  `DeliveryService`, `DeliveryRepository`, and `DeliveryController`
- Three public endpoints: city search, warehouse search, shipping cost + ETA estimate
- `NP_API_KEY` env-var addition to `EnvironmentVariables` (the API key only); `NP_SENDER_CITY_REF`
  is an **optional bootstrap fallback** for the dispatch origin — the source of truth is an
  admin-editable `DeliverySetting` (see below)
- **Admin-configurable dispatch origin** (TASK-080-E) — a singleton `DeliverySetting` row
  (sender city ref + name, optional sender warehouse, default parcel weight) persisted in the DB
  and edited from store-admin. This is internal operator data, never shown to customers; it feeds
  the cost estimate's "from" point. A new Prisma migration adds the `DeliverySetting` model.
- Redis/in-memory caching of NP responses via the existing `CacheService`
- Extension of `AddressDto` and `ShippingAddressData` with optional `npCityRef`,
  `npWarehouseName`, `npWarehouseRef` fields (no Prisma migration — stored in existing `Json?`
  `shippingAddress` column)
- Order creation populates `shippingCost` from the NP estimate (if NP refs are present)
- Orval regeneration after backend shape changes
- Frontend `Combobox` primitive in `shared/ui`
- `NpCityField` and `NpWarehouseField` in `features/checkout/ui`, replacing the free-text `city`
  and `deliveryAddress` inputs
- Debounced search in both autocomplete fields using `useDebouncedCallback` (forms.md Rule 3)
- Shipping cost + ETA display in `CheckoutOrderSummary`
- Unit tests for `DeliveryService` and both frontend autocomplete components

### Out of Scope

- NP parcel tracking or status lookup
- Courier delivery to door (warehouse-to-warehouse only in MVP)
- Full NP sender-account / counterparty management — the admin config covers only the dispatch
  **origin point** (sender city, optional sender warehouse) and the default parcel weight, not NP
  account credentials, return addresses, or multiple dispatch locations
- `estimatedDeliveryDate` column on `Order` — ETA is displayed during checkout but not persisted
- Multi-carrier delivery support
- Real payment integration (TASK-034/081)
- Multi-step checkout flow (tracked separately in TASK-146)

---

## User Stories

1. As a customer, I want to type my city name and pick it from a filtered list, so that the
   correct Nova Poshta city reference is recorded without relying on my spelling.
2. As a customer, I want to see branches of my chosen city and select one, so that the correct
   branch code is stored without manual entry errors.
3. As a customer, I want to see an estimated shipping cost and delivery time before I confirm the
   order, so I can decide whether to proceed.
4. As an operator, I want the NP city and branch refs persisted on the Order record, so I can look
   up the shipment details without calling the customer.
5. As a developer, I want the NP API key to live only on the server side, so it is never exposed
   to browser clients.

---

## Current-State Findings

### Checkout frontend

- `apps/store-client/src/features/checkout/model/checkout-schema.ts` (line 27–28): `city` and
  `deliveryAddress` are plain `z.string().min(1, …)` fields with no NP reference semantics.
- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx` (line 44–58):
  `DELIVERY_FIELDS` renders `city` (autoComplete `"address-level2"`) and `deliveryAddress`
  (autoComplete `"street-address"`, full-width) as uncontrolled `<Input>` elements via `register`.
  Comment on line 28 explicitly defers NP work to TASK-080.
- `apps/store-client/src/features/checkout/model/use-checkout.ts` (line 43–49): maps `values.city`
  → `AddressDto.city` and `values.deliveryAddress` → `AddressDto.address1`; country hardcoded to
  `"UA"`.
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` (line 103): hardcodes
  `<CheckoutStepIndicator current={1} />` — this cosmetic issue is tracked in TASK-146, not here.
- `apps/store-client/src/widgets/checkout/ui/checkout-order-summary.tsx`: does not currently show
  shipping cost (it is always 0).
- `apps/store-client/src/features/checkout/model/use-checkout-prefill.ts` (line 45–46): explicitly
  resets `city` and `deliveryAddress` to empty strings, noting NP work as TASK-080.

### Backend

- `apps/store-api/src/order/dto/address.dto.ts` (line 37–44): `address1` carries
  `"Delivery address — street address or Nova Poshta branch (free text)"`. No NP ref fields exist
  yet.
- `apps/store-api/src/order/order.types.ts` (lines 12–22): `ShippingAddressData` has `city:
string` and `address1: string` but no `npCityRef`, `npWarehouseName`, or `npWarehouseRef`.
- `apps/store-api/prisma/schema.prisma` (lines 208–235): the `Order` model already has
  `shippingAddress Json? @map("shipping_address") // {city, warehouse, address, ref}` (the comment
  confirms NP refs were always intended) and `shippingCost Decimal @default(0)`. **No Prisma
  migration is required.**
- `apps/store-api/src/order/order.service.ts` (line 136–143): `createOrder` passes no
  `shippingCost` to the repository — the default 0.00 is used.
- `apps/store-api/src/config/env.validation.ts`: already has optional Redis, mail, and CSRF vars
  as a pattern. `NP_API_KEY` and `NP_SENDER_CITY_REF` follow the same `@IsOptional() @IsString()`
  pattern.
- No existing `DeliveryModule` or NP client. The package.json does not include `@nestjs/axios`, but
  Node.js 18+ `fetch` (available in this stack) is sufficient — no new backend dependency needed.

### Frontend shared/ui

- `apps/store-client/src/shared/ui/index.ts`: exports `Select` (Radix static select), `Input`,
  `PhoneInput`, `Skeleton`. No `Combobox` or autocomplete primitive exists yet.
- `apps/store-client/src/shared/ui/select.tsx`: Radix `Select` — drop-down with static options,
  not suitable for async search. A new `Combobox` component is needed.

### forms.md compliance notes for autocomplete

- The city search input is focus-sensitive: must use Rule 1b (`lastPushedRef` guarded `useEffect`)
  if seeded from an external source (e.g. `useCheckoutPrefill` reset).
- Debounce via `useDebouncedCallback` from `@/shared/lib/use-debounced-callback` (Rule 3, direct
  import — not through the barrel).
- The selected `npCityRef` and `npWarehouseRef` are hidden form fields driven by the user's
  combobox selection, not from async server data, so Rule 1a/1b does not apply to them directly.

---

## Technical Design

### Data Model (No Prisma Migration Required)

The `Order.shippingAddress` (`Json?`) column already holds a `ShippingAddressData` snapshot. The
interface is extended with three optional NP-specific fields:

```typescript
// apps/store-api/src/order/order.types.ts — extended ShippingAddressData
export interface ShippingAddressData {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string; // Human-readable warehouse name / description
  address2?: string;
  city: string; // Human-readable city name (e.g. "Київ")
  state?: string;
  postalCode?: string;
  country: string;
  phone?: string;
  // TASK-080: Nova Poshta API reference fields
  npCityRef?: string; // NP city UUID (for operator lookup and estimate)
  npWarehouseName?: string; // NP warehouse description snapshot
  npWarehouseRef?: string; // NP warehouse UUID
}
```

The `shippingCost` `Decimal` column (already exists, `@default(0)`) will be populated from the NP
estimate when NP refs are provided. No column additions are needed.

### Environment Variables

New additions to `apps/store-api/src/config/env.validation.ts`:

```typescript
// Nova Poshta API integration (TASK-080)
// Both optional: the app boots without NP credentials; delivery endpoints
// return 503 when NP_API_KEY is absent, and the checkout falls back to
// free-text fields.
@IsOptional()
@IsString()
NP_API_KEY?: string;

// Bootstrap fallback for the store's dispatch-origin city (NP city UUID), used
// in the cost estimate ONLY when the admin DeliverySetting row has no
// senderCityRef yet. Once an operator saves the origin in store-admin, that DB
// value wins. Default fallback: Kyiv UUID "db5c88e0-391c-11dd-90d9-001a92567626".
@IsOptional()
@IsString()
NP_SENDER_CITY_REF?: string;
```

### Admin-configurable dispatch origin (`DeliverySetting`)

The shipping cost estimate needs a **sender** (dispatch origin) city — and the cost varies by how
far the parcel travels. Hard-coding that origin in an env var means a redeploy to change it, so the
origin is stored as a single editable record and exposed to operators in store-admin. This is purely
internal data — it is **never** rendered to customers; it only parameterises the NP `getDocumentPrice`
call.

**Prisma model** (new migration — follow the `prisma-migration` skill; this is a normal config
table, not an `isActive`/`deletedAt` concern):

```prisma
// Singleton: exactly one row, id fixed to "singleton".
model DeliverySetting {
  id                 String   @id @default("singleton")
  senderCityRef      String?  // NP city UUID of the dispatch origin
  senderCityName     String?  // human-readable, shown in the admin form
  senderWarehouseRef String?  // optional specific dispatch branch
  defaultWeightKg    Float    @default(0.5) // used when parcel weight is unknown
  updatedAt          DateTime @updatedAt
}
```

**Resolution order** for the sender origin used in an estimate (first non-empty wins):

1. `DeliverySetting.senderCityRef` (admin-set, source of truth)
2. `NP_SENDER_CITY_REF` env var (bootstrap fallback)
3. Built-in Kyiv default UUID

The same order applies to weight: `DeliverySetting.defaultWeightKg` → `0.5 kg`. Because the service
reads a DB row, `DeliveryService` gains a `DeliveryRepository` (Prisma) — the service itself still
never imports `PrismaClient` directly (Clean Architecture).

**Admin endpoints** (RBAC admin-only, reuse the existing roles guard):

| Method | Path                         | Body / returns                             |
| ------ | ---------------------------- | ------------------------------------------ |
| GET    | /api/admin/delivery-settings | → `{ data: DeliverySettingDto }`           |
| PUT    | /api/admin/delivery-settings | `UpdateDeliverySettingDto` → `{ data: … }` |

The admin city field reuses the same NP city-search proxy as the storefront (`GET /api/delivery/cities`)
so the operator picks a real NP city ref rather than typing a UUID.

### Backend (NestJS — Clean Architecture)

New module directory: `apps/store-api/src/delivery/`

#### NovaPoshtaClient

A plain NestJS `@Injectable()` service that wraps the NP API v2 JSON endpoint
(`https://api.novaposhta.ua/v2.0/json/`) using Node.js built-in `fetch`. Not a Prisma
repository — it has zero DB dependency. Injected into `DeliveryService`.

```typescript
// Conceptual interface
class NovaPoshtaClient {
  searchCities(query: string): Promise<NpCityRaw[]>;
  searchWarehouses(cityRef: string, query?: string): Promise<NpWarehouseRaw[]>;
  estimateShipping(params: {
    recipientCityRef: string;
    senderCityRef: string;
    weight?: number; // kg, defaults to 0.5
  }): Promise<{ cost: number; etaDays: number | null }>;
}
```

All NP requests are `POST https://api.novaposhta.ua/v2.0/json/` with body
`{ apiKey, modelName, calledMethod, methodProperties }`.

#### DeliveryService

Business logic layer. Receives the `NovaPoshtaClient` and `CacheService` (both injectable globally).

```typescript
class DeliveryService {
  searchCities(q: string): Promise<NpCityDto[]>;
  // min 2-char guard; cache key "np:cities:{q}"; TTL 1h
  searchWarehouses(cityRef: string, q?: string): Promise<NpWarehouseDto[]>;
  // cache key "np:warehouses:{cityRef}:{q}"; TTL 30min
  estimateShipping(recipientCityRef: string): Promise<NpEstimateDto>;
  // resolves sender origin + weight from DeliveryRepository (admin DeliverySetting),
  // falling back to NP_SENDER_CITY_REF / Kyiv / 0.5kg;
  // cache key "np:estimate:{senderRef}:{recipientRef}"; TTL 30min
  getSettings(): Promise<DeliverySettingDto>; // admin read (origin point + default weight)
  updateSettings(dto): Promise<DeliverySettingDto>; // admin write (upsert singleton)
  isConfigured(): boolean;
  // returns true when NP_API_KEY is present
}
```

When `isConfigured()` returns `false`, all methods throw `ServiceUnavailableException` with
message `"Nova Poshta integration is not configured"`.

#### DeliveryController

Controller prefix: `delivery`. Global API prefix is `api`, so routes become `/api/delivery/…`.
No `@UseGuards(JwtAuthGuard)` — these endpoints are public (customers need them before checkout,
and guests will need them if guest checkout is added later).

| Method | Path                     | Query params              | Response body                |
| ------ | ------------------------ | ------------------------- | ---------------------------- |
| GET    | /api/delivery/cities     | `q: string` (min 2 chars) | `{ data: NpCityDto[] }`      |
| GET    | /api/delivery/warehouses | `cityRef: string`, `q?`   | `{ data: NpWarehouseDto[] }` |
| GET    | /api/delivery/estimate   | `cityRef: string`         | `{ data: NpEstimateDto }`    |

Apply `@Throttle` decorator (e.g. 60 req/min per IP) to prevent NP API abuse via this proxy.

#### Response DTOs (Swagger-decorated)

```typescript
class NpCityDto {
  ref: string; // NP UUID e.g. "db5c88e0-..."
  name: string; // "Київ"
  regionName: string; // "Київська область"
}

class NpWarehouseDto {
  ref: string; // NP UUID
  name: string; // "Відділення №1 (до 30 кг)"
  number: string; // "1"
  address: string; // "вул. Хрещатик, 22"
}

class NpEstimateDto {
  cost: string; // formatted, e.g. "45.00" (UAH)
  etaDays: number | null; // null when NP does not return an ETA
}
```

#### DeliveryModule

```typescript
@Module({
  providers: [NovaPoshtaClient, DeliveryService],
  controllers: [DeliveryController],
  exports: [DeliveryService], // exported so OrderModule can inject it
})
export class DeliveryModule {}
```

Import `DeliveryModule` in both `AppModule` and `OrderModule`.

### Order Integration

`CreateOrderParams` and `CreateOrderDto.shippingAddress` are updated to carry the NP refs.
`OrderService.createOrder` checks whether `shippingAddress.npCityRef` is present and, if so,
calls `DeliveryService.estimateShipping(npCityRef)` to obtain a cost. This cost is forwarded to
`OrderRepository.createFromCart` as a new optional `shippingCost` field, which the repository
writes to the Order row instead of the default 0.

If `DeliveryService` throws (NP API down, key absent), the fallback is `shippingCost = 0`. Order
creation is never blocked by a delivery-cost failure.

### API Contract (Orval)

After TASK-080-A and TASK-080-B complete:

1. Export updated Swagger spec:
   `npm run swagger:export -w apps/store-api`
2. Regenerate client hooks for `store-client`:
   `/generate-api` command (or `npm run generate-api -w apps/store-client`)

New generated hooks consumed by the frontend (illustrative names — depend on Orval config):

- `useDeliveryControllerSearchCities({ params: { q } })`
- `useDeliveryControllerSearchWarehouses({ params: { cityRef, q } })`
- `useDeliveryControllerEstimate({ params: { cityRef } }, { query: { enabled: !!cityRef } })`

All Orval-generated files live in `apps/store-client/src/shared/api/generated/` and must not be
hand-edited (pre-commit hook guards this).

### Frontend (Next.js — FSD)

#### shared/ui — Combobox primitive

New `Combobox` component: a controlled text input with an absolutely-positioned dropdown list.
Built from existing `Input` and `Skeleton` primitives — zero new `npm` dependencies.

```typescript
interface ComboboxOption {
  value: string; // machine key (e.g. NP ref UUID)
  label: string; // primary display text
  sublabel?: string; // secondary (e.g. region name)
}

interface ComboboxProps {
  id?: string;
  value: string; // currently selected option value (or "" if none)
  onSelect: (option: ComboboxOption) => void;
  query: string; // controlled input value
  onQueryChange: (q: string) => void;
  options: ComboboxOption[];
  isLoading?: boolean;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}
```

The dropdown opens when `query.length >= 2` and options or a loading state are available. Click
outside / `Escape` closes it. Each option is a `<li role="option">` in a `<ul role="listbox">`.

The input itself is focus-sensitive (Rule 1b if ever seeded externally): internal `lastPushedRef`
guard is used within the `NpCityField` and `NpWarehouseField` wrappers, not inside `Combobox`
itself (Combobox is a pure presentational component).

#### features/checkout — hooks

`use-np-city-search.ts`

```typescript
// Direct import per forms.md Rule 3 (not via barrel)
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";

export function useNpCitySearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounce = useDebouncedCallback(setDebouncedQuery, 300);

  const { data, isFetching } = useDeliveryControllerSearchCities(
    { q: debouncedQuery },
    { query: { enabled: debouncedQuery.length >= 2 } },
  );

  const handleQueryChange = (q: string) => {
    setQuery(q);
    debounce(q);
  };

  return {
    query,
    cities: data?.data ?? [],
    isLoading: isFetching,
    setQuery: handleQueryChange,
  };
}
```

`use-np-warehouse-search.ts` — same pattern, gated on `cityRef` being non-empty.

#### features/checkout — NpCityField

An RHF `Controller`-wrapped `Combobox`. Controls two hidden form values: `city` (human name) and
`npCityRef` (NP UUID). When the user selects an option, both are set via `setValue`. If the user
clears the query, both reset to `""`.

#### features/checkout — NpWarehouseField

Same pattern. Controls `deliveryAddress` (warehouse name/description snapshot) and `npWarehouseRef`
(NP UUID). Disabled and shows a hint when no city is yet selected.

#### checkout-schema.ts extension

```typescript
export const checkoutSchema = z.object({
  firstName: …,
  lastName: …,
  phone: …,
  city: z.string().min(1, dict.checkout.validation.city),
  deliveryAddress: z.string().min(1, dict.checkout.validation.deliveryAddress),
  // Optional NP refs — populated by the autocomplete; absent when the user
  // types free-text without selecting from the list (graceful degradation).
  npCityRef: z.string().optional(),
  npWarehouseRef: z.string().optional(),
  notes: z.string().max(500, …).optional(),
});
```

#### checkout-address-form.tsx changes

Remove `city` and `deliveryAddress` from `DELIVERY_FIELDS`. Replace them with:

```tsx
<Controller
  name="city"
  control={control}
  render={({ field, fieldState }) => (
    <NpCityField
      field={field}
      error={fieldState.error}
      control={control}
    />
  )}
/>
<Controller
  name="deliveryAddress"
  control={control}
  render={({ field, fieldState }) => (
    <NpWarehouseField
      field={field}
      error={fieldState.error}
      control={control}
      cityRef={cityRefValue}  // watched from npCityRef
    />
  )}
/>
```

Both components render their own label, input, dropdown, and error message — the generic
`renderField` loop no longer handles these two.

#### use-checkout.ts changes

Add `npCityRef` and `npWarehouseRef` to the `AddressDto` mapping:

```typescript
shippingAddress: {
  firstName: values.firstName,
  lastName: values.lastName,
  phone: values.phone,
  city: values.city,
  address1: values.deliveryAddress,
  country: "UA",
  npCityRef: values.npCityRef || undefined,
  npWarehouseRef: values.npWarehouseRef || undefined,
},
```

#### checkout-order-summary.tsx changes

Add shipping cost display. Use the `useDeliveryControllerEstimate` hook (enabled when `npCityRef`
is selected). Show:

- `"Розраховується…"` while loading
- `"Безкоштовно"` if cost is 0
- Formatted UAH cost (via existing `formatMoney`) otherwise
- ETA line: `"Орієнтовно N–M днів"` when `etaDays` is available

The summary uses `useWatch({ control, name: "npCityRef" })` to read the selected city ref from the
parent form without prop-drilling.

#### dictionary.ts additions

New keys under `checkout`:

```typescript
npCityPlaceholder: "Введіть місто (мін. 2 символи)",
npCityEmptyText: "Міст не знайдено",
npCityLabel: "Місто (Нова Пошта)",
npWarehousePlaceholder: "Виберіть відділення",
npWarehouseEmptyText: "Відділень не знайдено",
npWarehouseLabel: "Відділення Нової Пошти",
npWarehouseHint: "Спершу оберіть місто",
npShippingCost: "Вартість доставки",
npShippingCalculating: "Розраховується…",
npShippingFree: "Безкоштовно",
npEtaLabel: (days: number) => `Орієнтовно ${days}–${days + 1} роб. днів`,
```

---

## Tasks

### TASK-080-A: Backend DeliveryModule — NP client, service, controller, config

**Type:** feat
**Scope:** store-api
**Complexity:** M (2–4h)
**TDD Required:** Yes — unit tests for `DeliveryService` (mock `NovaPoshtaClient`) written before
implementation
**Depends on:** none

**Acceptance Criteria:**

- [ ] `NP_API_KEY` and `NP_SENDER_CITY_REF` added to `EnvironmentVariables` as `@IsOptional()
    @IsString()` fields; `validateEnv` still passes with neither set
- [ ] `NovaPoshtaClient` injectable service uses Node.js built-in `fetch` to call
      `https://api.novaposhta.ua/v2.0/json/`; throws `ServiceUnavailableException` when
      `NP_API_KEY` is absent
- [ ] `DeliveryService.searchCities(q)` throws `BadRequestException` when `q.length < 2`; caches
      responses using `CacheService` with a 1-hour TTL; returns `NpCityDto[]`
- [ ] `DeliveryService.searchWarehouses(cityRef, q?)` caches responses with a 30-minute TTL;
      returns `NpWarehouseDto[]`
- [ ] `DeliveryService.estimateShipping(recipientCityRef)` falls back to `{ cost: "0", etaDays:
    null }` when the NP API call fails (never throws to callers)
- [ ] `DeliveryController` exposes `GET /api/delivery/cities`, `/warehouses`, `/estimate`; Swagger
      decorators present on all three; `@Throttle` applied
- [ ] `DeliveryModule` imported in `AppModule`; `DeliveryService` exported for `OrderModule`
- [ ] `npm run test -w apps/store-api` green (existing 401+ tests unaffected; new
      `delivery.service.spec.ts` added)
- [ ] `npm run build -w apps/store-api` and `npm run typecheck` clean

**Files to create/modify:**

- `apps/store-api/src/delivery/nova-poshta.client.ts` — create; HTTP client wrapping NP API v2
- `apps/store-api/src/delivery/delivery.service.ts` — create; business logic + caching
- `apps/store-api/src/delivery/delivery.service.spec.ts` — create; unit tests (TDD, written first)
- `apps/store-api/src/delivery/delivery.controller.ts` — create; three GET endpoints
- `apps/store-api/src/delivery/dto/np-city-search-query.dto.ts` — create
- `apps/store-api/src/delivery/dto/np-warehouse-search-query.dto.ts` — create
- `apps/store-api/src/delivery/dto/np-estimate-query.dto.ts` — create
- `apps/store-api/src/delivery/dto/np-city.dto.ts` — create; Swagger-decorated response shape
- `apps/store-api/src/delivery/dto/np-warehouse.dto.ts` — create
- `apps/store-api/src/delivery/dto/np-estimate.dto.ts` — create
- `apps/store-api/src/delivery/index.ts` — create; barrel export
- `apps/store-api/src/delivery/delivery.module.ts` — create
- `apps/store-api/src/config/env.validation.ts` — add `NP_API_KEY`, `NP_SENDER_CITY_REF`
- `apps/store-api/src/app.module.ts` — import `DeliveryModule`

---

### TASK-080-B: Address DTO extension + Order shippingCost integration + Orval regen

**Type:** feat
**Scope:** store-api + shared (Orval regen affects generated files in store-client)
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-080-A

**Acceptance Criteria:**

- [ ] `AddressDto` has three new optional fields: `npCityRef?: string`, `npWarehouseName?:
    string`, `npWarehouseRef?: string` (all `@IsString() @IsOptional() @MaxLength(100)`)
- [ ] `ShippingAddressData` interface updated to match the extended DTO; existing Order reads
      typecheck cleanly (fields are optional — old snapshot rows without NP refs are unaffected)
- [ ] `CreateOrderParams` includes `shippingCost?: number`
- [ ] `OrderRepository.createFromCart` writes the provided `shippingCost` (or `0` if absent) to
      the `Order.shippingCost` column
- [ ] `OrderService.createOrder` calls `DeliveryService.estimateShipping(npCityRef)` when
      `shippingAddress.npCityRef` is present; uses the returned cost; catches any error and falls
      back to `0` so order creation never fails due to delivery-cost lookup
- [ ] `OrderModule` imports `DeliveryModule`
- [ ] Orval regen produces updated `addressDto.ts` model in
      `apps/store-client/src/shared/api/generated/models/` with the three new optional fields
- [ ] `npm run build -w apps/store-api` clean; `npm run typecheck` for both apps clean

**Files to create/modify:**

- `apps/store-api/src/order/dto/address.dto.ts` — add `npCityRef`, `npWarehouseName`,
  `npWarehouseRef` optional fields
- `apps/store-api/src/order/order.types.ts` — extend `ShippingAddressData` and
  `CreateOrderParams`
- `apps/store-api/src/order/order.repository.ts` — accept and write `shippingCost` in
  `createFromCart`
- `apps/store-api/src/order/order.service.ts` — inject `DeliveryService`; compute `shippingCost`
  from NP estimate
- `apps/store-api/src/order/order.module.ts` — import `DeliveryModule`
- `apps/store-client/src/shared/api/generated/**` — Orval regen (do not hand-edit)

---

### TASK-080-C: Frontend autocomplete + checkout wiring

**Type:** feat
**Scope:** store-client
**Complexity:** L (4–8h)
**TDD Required:** No
**Depends on:** TASK-080-B

**Acceptance Criteria:**

- [ ] `Combobox` in `shared/ui` renders a controlled input + dropdown (`role="listbox"`) with
      loading state (shows `Skeleton`) and empty state; keyboard accessible (arrow navigation,
      Enter to select, Escape to close); ARIA attributes correct (`aria-expanded`,
      `aria-activedescendant`)
- [ ] `Combobox` exported from `apps/store-client/src/shared/ui/index.ts`
- [ ] `useNpCitySearch` hook debounces via `useDebouncedCallback` (direct import from
      `@/shared/lib/use-debounced-callback`); fires query only when `q.length >= 2`; returns
      `{ query, cities, isLoading, setQuery }`
- [ ] `useNpWarehouseSearch` hook gated on non-empty `cityRef`; returns `{ warehouses, isLoading }`
- [ ] `NpCityField` sets both `city` (human name, via `setValue`) and `npCityRef` (UUID) on the
      form when a city is selected; clears both when the query is cleared; shows field-level error
      from RHF `fieldState.error`
- [ ] `NpWarehouseField` sets both `deliveryAddress` (warehouse description) and `npWarehouseRef`
      on the form; is disabled with a hint when `npCityRef` is empty; resets on city change
- [ ] `checkoutSchema` includes optional `npCityRef` and `npWarehouseRef` string fields; Zod type
      `CheckoutFormValues` updated accordingly
- [ ] `checkout-address-form.tsx` replaces the `city` and `deliveryAddress` plain `Input` elements
      with `NpCityField` and `NpWarehouseField`; phone `Controller` block unchanged
- [ ] `use-checkout.ts` passes `npCityRef` and `npWarehouseRef` (as `undefined` when absent) in
      the `shippingAddress` DTO
- [ ] `CheckoutOrderSummary` shows shipping cost line: `"Розраховується…"` while fetching,
      formatted UAH cost otherwise; shows ETA when `etaDays` is non-null
- [ ] All dictionary strings for NP autocomplete fields added to
      `apps/store-client/src/shared/config/dictionary.ts`
- [ ] `features/checkout/index.ts` exports `NpCityField`, `NpWarehouseField`, and the two hooks
- [ ] `npm run build -w apps/store-client` clean; `npm run typecheck` clean;
      `npm run lint -w apps/store-client` clean
- [ ] 103+ existing store-client tests remain green (`npm run test -w apps/store-client`)

**Files to create/modify:**

- `apps/store-client/src/shared/ui/combobox.tsx` — create; autocomplete primitive
- `apps/store-client/src/shared/ui/index.ts` — add `Combobox` export
- `apps/store-client/src/features/checkout/model/checkout-schema.ts` — add `npCityRef`,
  `npWarehouseRef` optional fields
- `apps/store-client/src/features/checkout/model/use-np-city-search.ts` — create
- `apps/store-client/src/features/checkout/model/use-np-warehouse-search.ts` — create
- `apps/store-client/src/features/checkout/ui/np-city-field.tsx` — create
- `apps/store-client/src/features/checkout/ui/np-warehouse-field.tsx` — create
- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx` — swap city/delivery
  inputs for NP autocomplete components
- `apps/store-client/src/features/checkout/model/use-checkout.ts` — add NP refs to DTO mapping
- `apps/store-client/src/features/checkout/index.ts` — export new components/hooks
- `apps/store-client/src/widgets/checkout/ui/checkout-order-summary.tsx` — add shipping cost +
  ETA display
- `apps/store-client/src/shared/config/dictionary.ts` — add NP autocomplete dictionary keys

---

### TASK-080-D: Tests

**Type:** test
**Scope:** store-api + store-client
**Complexity:** M (2–4h)
**TDD Required:** Yes (DeliveryService unit tests were the Red phase of TASK-080-A; this task adds
the remaining coverage)
**Depends on:** TASK-080-C

**Acceptance Criteria:**

- [ ] `delivery.service.spec.ts` covers: `searchCities` min-length guard (throws on `q="K"`);
      cache hit path (client not called second time); `estimateShipping` fallback to `{ cost: "0",
    etaDays: null }` on client error; `isConfigured()` returns `false` when `NP_API_KEY` absent
- [ ] E2E / integration test covers `GET /api/delivery/cities?q=Ки` with mocked `NovaPoshtaClient`
      returning stubbed cities; verifies response shape `{ data: NpCityDto[] }`
- [ ] `combobox.test.tsx` covers: dropdown opens on input with `>= 2` chars; Escape closes;
      selecting an option calls `onSelect`; loading skeleton renders; keyboard navigation
- [ ] `np-city-field.test.tsx` covers: typing "Ки" triggers MSW handler; selecting a city sets
      `city` and `npCityRef` in the form; clearing the input resets both
- [ ] `checkout-address-form.test.tsx` updated: supplies mocked `control` (as in the existing
      test), stubs the Orval city/warehouse hooks via MSW, verifies the NP fields are present and
      free-text city/deliveryAddress `Input` elements are removed
- [ ] `npm run test -w apps/store-api` green
- [ ] `npm run test -w apps/store-client` green

**Files to create/modify:**

- `apps/store-api/src/delivery/delivery.service.spec.ts` — extend (Red was written in TASK-080-A)
- `apps/store-api/test/delivery.e2e-spec.ts` (or `delivery.int-spec.ts`) — create
- `apps/store-client/src/shared/ui/combobox.test.tsx` — create
- `apps/store-client/src/features/checkout/ui/np-city-field.test.tsx` — create
- `apps/store-client/src/features/checkout/ui/checkout-address-form.test.tsx` — update
- `apps/store-client/src/shared/test/msw-handlers.ts` — add NP endpoint handlers

---

### TASK-080-E: Admin-configurable dispatch origin (`DeliverySetting`)

**Type:** feat
**Scope:** store-api + store-admin (+ Prisma migration + Orval regen)
**Complexity:** M (3–5h)
**TDD Required:** No (service upsert covered by a unit test)
**Depends on:** TASK-080-A (needs `DeliveryService` + the NP city-search proxy for the admin picker)

**Acceptance Criteria:**

- [ ] Prisma `DeliverySetting` singleton model added (`id` fixed `"singleton"`, `senderCityRef?`,
      `senderCityName?`, `senderWarehouseRef?`, `defaultWeightKg` default `0.5`, `updatedAt`);
      migration created via `prisma migrate dev` and `prisma generate` run
- [ ] `DeliveryRepository` (Prisma) with `getSettings()` (returns the row or a default-shaped
      object when absent) and `upsertSettings(dto)` (upsert on the fixed id)
- [ ] `DeliveryService.estimateShipping` resolves the sender origin + weight in order:
      `DeliverySetting` → `NP_SENDER_CITY_REF` → Kyiv default / `0.5kg`; a unit test asserts the
      DB value overrides the env fallback
- [ ] `DeliveryController` (or an admin sub-controller) exposes `GET` + `PUT
    /api/admin/delivery-settings`, guarded admin-only via the existing roles guard; Swagger
      decorated; `DeliverySettingDto` / `UpdateDeliverySettingDto` validated with class-validator
- [ ] Orval regen produces the admin hooks in `apps/store-admin/src/shared/api/generated/`
- [ ] store-admin settings page (e.g. `app/(dashboard)/settings/delivery`) with a form: sender
      city (reuses the NP city-search hook so the operator picks a real ref, not a raw UUID),
      optional sender warehouse, default weight; save → toast; values reload via `values`/`reset`
      per forms.md
- [ ] Page is reachable from admin navigation; copy is UA (added to `store-admin` dictionary)
- [ ] The setting is never exposed on any public/storefront endpoint or response
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, and `npm run test` clean for both
      `store-api` and `store-admin`

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — add `DeliverySetting` model
- `apps/store-api/prisma/migrations/**` — new migration
- `apps/store-api/src/delivery/delivery.repository.ts` — create (Prisma access)
- `apps/store-api/src/delivery/delivery.service.ts` — read settings in estimate; add
  `getSettings`/`updateSettings`
- `apps/store-api/src/delivery/delivery.controller.ts` — add admin GET/PUT endpoints
- `apps/store-api/src/delivery/dto/delivery-setting.dto.ts`,
  `apps/store-api/src/delivery/dto/update-delivery-setting.dto.ts` — create
- `apps/store-api/src/delivery/delivery.module.ts` — register the repository
- `apps/store-admin/src/**` — delivery settings page, form, nav entry, dictionary strings
- `apps/store-admin/src/shared/api/generated/**` — Orval regen (do not hand-edit)

---

## Migration Steps

1. **TASK-080-A** — Implement the backend `DeliveryModule`. No DB schema changes. Export updated
   Swagger spec after this is green.
2. **TASK-080-B** — Extend `AddressDto` and `ShippingAddressData`. Update `OrderService`/
   `OrderRepository`. Run Orval (`/generate-api`) to regenerate `shared/api/generated/`.
3. **TASK-080-C** — Build the frontend `Combobox` primitive, `NpCityField`, `NpWarehouseField`,
   and wire them into the checkout form. Verify the summary shows the cost.
4. **TASK-080-D** — Complete test coverage; ensure all existing tests remain green.
5. **TASK-080-E** — Add the `DeliverySetting` model + migration, the `DeliveryRepository`, the
   admin GET/PUT endpoints, and the store-admin settings page. Wire the estimate to read the
   admin-set origin. Run Orval for the admin app.
6. **Environment setup** — Add `NP_API_KEY` to `.env` (never commit it). `NP_SENDER_CITY_REF` is
   optional — it only seeds the dispatch origin until an operator sets it in store-admin. Without
   `NP_API_KEY` the app boots normally; delivery endpoints return 503 and the checkout falls back to
   accepting free-text city/address input.

---

## Cross-Task Dependencies

| This task  | Depends on    | Why                                                                                                                                           |
| ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-080-A | —             | Foundational; no prior dependency                                                                                                             |
| TASK-080-B | TASK-080-A    | `DeliveryService` must be available for injection into Order                                                                                  |
| TASK-080-B | TASK-080-A    | Orval regen requires backend spec to include delivery routes                                                                                  |
| TASK-080-C | TASK-080-B    | Generated hooks must exist before the frontend can consume them                                                                               |
| TASK-080-D | TASK-080-C    | Tests verify the fully-wired feature                                                                                                          |
| TASK-080-E | TASK-080-A    | Reuses `DeliveryService` + NP city-search proxy; can ship in parallel with C/D (estimate uses the env fallback until the admin origin is set) |
| TASK-135   | (predecessor) | `useCheckoutPrefill` already handles `city`/`deliveryAddress`                                                                                 |

                                 reset (resets to `""`) — TASK-080 replaces those fields;
                                 `useCheckoutPrefill` does not need changes               |

| TASK-146 | (sibling) | Cosmetic checkout stepper is tracked there; no changes needed
here to `checkout-view.tsx:103` |

---

## Risks & Mitigations

| Risk                                                  | Mitigation                                                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NP API key not yet provisioned                        | App boots and works without it; delivery endpoints return 503; checkout falls back to free-text entry.                                                                                           |
| NP API rate limits                                    | `CacheService` caches city responses (1h TTL) and warehouse responses (30min TTL). `@Throttle` on proxy.                                                                                         |
| NP API downtime during order submit                   | `OrderService.createOrder` catches `estimateShipping` errors and falls back to `shippingCost = 0`.                                                                                               |
| NP city/warehouse UUIDs are very long UUIDs           | Stored in JSON blob (no column length constraint). `@MaxLength(100)` on DTO is safe; actual refs are 36 chars.                                                                                   |
| Cost estimate accuracy depends on the dispatch origin | The origin (sender city) is admin-editable (`DeliverySetting`, TASK-080-E), so the operator can set their real dispatch point without a redeploy; defaults to the env fallback / Kyiv until set. |
| Weight unknown at checkout (cost estimate)            | Default weight is configurable in the admin `DeliverySetting` (`defaultWeightKg`, default 0.5 kg). Label the figure as an estimate, not a guaranteed price.                                      |
| `checkoutSchema` now has optional NP fields           | Free-text entry remains valid; schema does not require NP refs. Operators continue to handle free-text orders manually as before.                                                                |
| Order confirmation email shows `shippingCost`         | Email template currently reads `order.shippingAddress.address1` as free text; adding NP fields is additive and backward-compatible.                                                              |
| Orval regen is guarded by pre-commit hook             | Run `/generate-api` before committing; the hook blocks hand-edited generated files.                                                                                                              |

---

## Notes

- The NP API base URL is `https://api.novaposhta.ua/v2.0/json/` (JSON POST for all methods).
  `NovaPoshtaClient` should accept the base URL as a constructor parameter (injected from config)
  so it can be overridden in tests with a mock server URL.
- The dispatch-origin city is set by the operator in store-admin (`DeliverySetting`, TASK-080-E).
  `NP_SENDER_CITY_REF` is only a bootstrap fallback; it defaults to the Kyiv NP city UUID
  (`db5c88e0-391c-11dd-90d9-001a92567626`) when neither the admin setting nor the env var is set.
- The cost estimate uses `ServiceType: "WarehouseWarehouse"` (branch-to-branch), which is the
  typical small-parcel delivery mode in Ukraine.
- Future extension (out of scope here): add `estimatedDeliveryDate DateTime?` to the `Order`
  Prisma model and persist the ETA returned at order creation. A separate migration would be
  needed (follow the `prisma-migration` skill conventions — `estimatedDeliveryDate` is nullable,
  not an `isActive`/`deletedAt` field).
- `useDebouncedCallback` must be imported directly (not from the barrel) per `forms.md` Rule 3
  and the comment in `apps/store-client/src/shared/lib/index.ts:10`.
