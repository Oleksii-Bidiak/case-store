import { http, HttpResponse } from "msw";
import type { CartEntity, CartItemEntity } from "@/entities/cart";
import type { OrderEntity, OrderItemEntity } from "@/entities/order";
import type { UserEntity } from "@/entities/user";
import type { NpCityDto, NpWarehouseDto } from "@/entities/delivery";

/**
 * Default MSW handlers for store-client component tests.
 *
 * Patterns use a leading `*` so the origin (default `http://localhost:3001`) is
 * absorbed regardless of `NEXT_PUBLIC_API_URL`. Each handler returns the same
 * `{ data, meta? }` envelope shape the real API emits, keyed to the generated
 * model types (see `@/shared/api/generated/models`). Override per-test with
 * `server.use(...)`.
 */

/** Build a cart item with sensible defaults; override any field per-test. */
export function makeCartItem(
  overrides: Partial<CartItemEntity> = {},
): CartItemEntity {
  return {
    id: "item-1",
    productId: "product-1",
    quantity: 2,
    productName: "iPhone 15 Pro Case — Clear",
    price: "499.00",
    stock: 50,
    isActive: true,
    lineTotal: "998.00",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Build a cart envelope from a list of items, deriving totals. */
export function makeCart(items: CartItemEntity[] = [makeCartItem()]): {
  data: CartEntity;
} {
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotalCents = items.reduce(
    (cents, i) => cents + Math.round(Number(i.price) * 100) * i.quantity,
    0,
  );
  return {
    data: {
      id: "cart-1",
      userId: null,
      items,
      totals: {
        subtotal: (subtotalCents / 100).toFixed(2),
        itemCount,
        uniqueItems: items.length,
      },
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  };
}

/** Build an order line item with sensible defaults; override any field per-test. */
export function makeOrderItem(
  overrides: Partial<OrderItemEntity> = {},
): OrderItemEntity {
  return {
    id: "order-item-1",
    productId: "product-1",
    productName: "iPhone 15 Pro Case — Clear",
    quantity: 2,
    price: "499.00",
    lineTotal: "998.00",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Build an order envelope with a UA shipping address by default (the shape the
 * checkout flow produces: `deliveryAddress` → `address1`, `country: "UA"`).
 */
export function makeOrder(overrides: Partial<OrderEntity> = {}): {
  data: OrderEntity;
} {
  return {
    data: {
      id: "order-1",
      userId: "user-1",
      status: "PENDING",
      paymentStatus: "PENDING",
      subtotal: "998.00",
      discount: "0.00",
      shippingCost: "0.00",
      tax: "0.00",
      total: "998.00",
      shippingAddress: {
        firstName: "Олег",
        lastName: "Коваль",
        phone: "+380501234567",
        city: "Київ",
        address1: "Відділення №1",
        country: "UA",
      },
      billingAddress: null,
      notes: null,
      items: [makeOrderItem()],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

/**
 * Build a current-user profile envelope with UA defaults; override any field
 * per-test (e.g. `makeUser({ phone: null })`). Matches `GET /api/users/me`.
 */
export function makeUser(overrides: Partial<UserEntity> = {}): {
  data: UserEntity;
} {
  return {
    data: {
      id: "user-1",
      email: "oleg@example.com",
      firstName: "Олег",
      lastName: "Коваль",
      phone: "+380501234567",
      role: "CUSTOMER",
      isActive: true,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

/** Build a Nova Poshta city result; override any field per-test. */
export function makeCity(overrides: Partial<NpCityDto> = {}): NpCityDto {
  return {
    ref: "city-ref-1",
    name: "м. Київ, Київська обл.",
    area: "Київська",
    warehouses: 1234,
    ...overrides,
  };
}

/** Build a Nova Poshta warehouse result; override any field per-test. */
export function makeWarehouse(
  overrides: Partial<NpWarehouseDto> = {},
): NpWarehouseDto {
  return {
    ref: "wh-ref-1",
    description: "Відділення №1: вул. Хрещатик, 22",
    number: "1",
    typeOfWarehouse: "type-1",
    ...overrides,
  };
}

export const handlers = [
  // Cart read — a populated guest cart by default.
  http.get("*/api/cart", () => HttpResponse.json(makeCart())),

  // Current-user profile — a populated UA profile by default.
  http.get("*/api/users/me", () => HttpResponse.json(makeUser())),

  // Nova Poshta delivery proxy (TASK-080) — sensible defaults; override per-test.
  http.get("*/api/delivery/cities", () =>
    HttpResponse.json({ data: [makeCity()] }),
  ),
  http.get("*/api/delivery/warehouses", () =>
    HttpResponse.json({ data: [makeWarehouse()] }),
  ),
  http.get("*/api/delivery/estimate", () =>
    HttpResponse.json({ data: { cost: "60.00", etaDays: 2 } }),
  ),

  // Cart mutations — echo a minimal success envelope; tests assert the call,
  // and components refetch the cart afterwards.
  http.patch("*/api/cart/items/:itemId", () => HttpResponse.json(makeCart())),
  http.delete("*/api/cart/items/:itemId", () =>
    HttpResponse.json(makeCart([])),
  ),
  http.delete("*/api/cart", () => HttpResponse.json(makeCart([]))),
  http.post("*/api/cart/items", () =>
    HttpResponse.json(makeCart(), { status: 201 }),
  ),

  // Orders — create returns a minimal order envelope.
  http.post("*/api/orders", () =>
    HttpResponse.json(
      { data: { id: "order-1", status: "PENDING" } },
      { status: 201 },
    ),
  ),

  // Order cancel — returns the order with the new CANCELLED status.
  http.patch("*/api/orders/:orderId/cancel", () =>
    HttpResponse.json(makeOrder({ status: "CANCELLED" })),
  ),

  // Auth — login/register return a token envelope.
  http.post("*/api/auth/login", () =>
    HttpResponse.json({ data: { accessToken: "test.access.token" } }),
  ),
  http.post("*/api/auth/register", () =>
    HttpResponse.json(
      { data: { accessToken: "test.access.token" } },
      { status: 201 },
    ),
  ),
  http.post("*/api/auth/refresh", () =>
    HttpResponse.json({ data: {} }, { status: 401 }),
  ),

  // CSRF token fetched lazily by the axios instance before guest mutations.
  http.get("*/api/csrf-token", () =>
    HttpResponse.json({ data: { csrfToken: "test-csrf" } }),
  ),
];
