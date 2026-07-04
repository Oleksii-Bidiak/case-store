import { Prisma, OrderStatus, PaymentStatus } from '@prisma/client';
import type { CartWithItems } from '../cart/cart.repository';
import type { AddressDto } from './dto';

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
