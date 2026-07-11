import { Prisma, OrderStatus, PaymentStatus, OrderHistoryChangeType } from '@prisma/client';
import type { CartWithItems } from '../cart/cart.repository';
import type { AddressDto } from './dto';

/**
 * A single order-status-history audit row as returned by the repository
 * (TASK-251). Mirrors the `OrderStatusHistory` Prisma model. STATUS rows
 * populate `fromStatus`/`toStatus` (payment pair null); PAYMENT_STATUS rows
 * populate `fromPaymentStatus`/`toPaymentStatus` (status pair null). `changedBy`
 * is null for system-authored rows (order creation, future payment webhook).
 */
export interface OrderStatusHistoryRow {
  id: string;
  orderId: string;
  changeType: OrderHistoryChangeType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  fromPaymentStatus: PaymentStatus | null;
  toPaymentStatus: PaymentStatus | null;
  changedBy: string | null;
  changedAt: Date;
}

/**
 * Typed shape of the address JSON snapshot embedded in an order.
 * Mirrors {@link AddressDto}. The order stores addresses as `Json?` columns
 * (snapshot semantics), so this interface is used to deserialize them back
 * into a typed object inside the entity.
 */
export interface ShippingAddressData {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  // Optional on AddressDto (TASK-229) — snapshots created before the server-side
  // country default may lack both fields, so reads must not assume them.
  postalCode?: string;
  country?: string;
  phone?: string;
  /** Nova Poshta delivery refs (TASK-080) — present only for NP-routed orders. */
  npCityRef?: string;
  npWarehouseName?: string;
  npWarehouseRef?: string;
}

/**
 * A single order line as returned by repository queries, including the
 * snapshotted product (position) reference details.
 */
export interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: { toString(): string }; // Prisma Decimal
  createdAt: Date;
  product: { id: string; name: string; slug: string; images: Array<{ url: string }> };
  /**
   * Frozen add-on snapshots bought with this line (TASK-174). `name`/`price` are
   * copied at order-creation time, exactly like `OrderItem.price` snapshots
   * `Product.price` — a later catalog reprice, template edit, or delta edit never
   * rewrites them.
   */
  addons: OrderItemAddonRow[];
}

/**
 * One frozen add-on snapshot on an order line (TASK-174).
 */
export interface OrderItemAddonRow {
  id: string;
  addonServiceId: string | null;
  name: string;
  price: { toString(): string }; // Prisma Decimal
}

/**
 * The add-on snapshot the service resolved for a cart line at order-creation
 * time, ready to be frozen into `OrderItemAddon` rows (TASK-174).
 */
export interface OrderAddonSnapshot {
  addonServiceId: string;
  name: string;
  /** Effective price as a decimal string, as returned by the resolver. */
  price: string;
}

/**
 * Order with its items and related product/variant details.
 * This is the shape returned by all order queries — it mirrors the
 * `CartWithItems` pattern in `cart.repository.ts`.
 */
export interface OrderWithItems {
  id: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: { toString(): string };
  discount: { toString(): string };
  discountCode: string | null;
  shippingCost: { toString(): string };
  tax: { toString(): string };
  /**
   * Sum of the frozen add-on snapshots across all lines (TASK-174). Excluded
   * from the discount base, exactly like `shippingCost`:
   * `total = subtotal + shippingCost + addonsTotal - discount`.
   */
  addonsTotal: { toString(): string };
  total: { toString(): string };
  shippingAddress: Prisma.JsonValue | null;
  billingAddress: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * TASK-228: when an automatic cancellation last returned this order's stock
   * to inventory; null while the order still "owns" its items. The service
   * consults it to re-reserve stock on revive and to prevent double restocks.
   */
  restockedAt: Date | null;
  items: OrderItemRow[];
  /**
   * Owning user account, selected only by the admin read paths
   * (`findAll` / `findByIdForAdmin`) via `ADMIN_ORDERS_INCLUDE`. Absent on
   * customer-facing and mutation queries, which use the lean `ORDERS_INCLUDE`.
   */
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

/**
 * Parameters for creating an order from a cart. The service resolves and
 * validates the cart, then hands the already-loaded cart lines to the
 * repository so the transactional write is a pure data apply.
 */
export interface CreateOrderParams {
  userId: string;
  cartId: string;
  cartItems: CartWithItems['items'];
  /**
   * The add-ons to freeze onto each line, keyed by CART ITEM id (TASK-174). The
   * service re-resolves them fresh at order-creation time — exactly like stock
   * and the discount are re-validated fresh — so a selection that has since
   * become inapplicable is already gone by the time the repository sees it. A
   * line with no selected add-ons is simply absent from the map.
   */
  addonsByCartItemId?: Map<string, OrderAddonSnapshot[]>;
  shippingAddress: AddressDto;
  billingAddress?: AddressDto;
  notes?: string;
  /**
   * Estimated Nova Poshta shipping cost (UAH) computed by the service from the
   * delivery estimate. Absent for free-text/manual orders → repository writes 0.
   */
  shippingCost?: number;
  /**
   * Optional promo-code discount to apply inside the order transaction
   * (TASK-079). The service has already recomputed the amount authoritatively
   * via DiscountService.computeDiscount; the repository persists `amount` +
   * `code` on the order, subtracts it from the total, and runs `redeem` (the
   * service's cap re-check + redemption insert) within the same `$transaction`,
   * so a cap race or a deactivation rolls the whole order back.
   */
  discount?: {
    /** Recomputed discount amount as a decimal string ("XX.YY"). */
    amount: string;
    /** The applied promo code (uppercase), snapshotted on the order. */
    code: string;
    /** Redeem callback bound to the discount + user; called with the new order id and the tx. */
    redeem: (orderId: string, tx: Prisma.TransactionClient) => Promise<void>;
  };
}
