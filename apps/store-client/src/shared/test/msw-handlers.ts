import { http, HttpResponse } from "msw";
import type { CartEntity, CartItemEntity } from "@/entities/cart";

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

export const handlers = [
  // Cart read — a populated guest cart by default.
  http.get("*/api/cart", () => HttpResponse.json(makeCart())),

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
