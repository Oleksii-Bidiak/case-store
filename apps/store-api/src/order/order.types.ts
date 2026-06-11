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
  postalCode: string;
  country: string;
  phone?: string;
}

/**
 * A single order line as returned by repository queries, including the
 * snapshotted product/variant reference details.
 */
export interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  price: { toString(): string }; // Prisma Decimal
  createdAt: Date;
  product: { id: string; name: string; slug: string };
  variant: { id: string; name: string } | null;
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
  shippingCost: { toString(): string };
  tax: { toString(): string };
  total: { toString(): string };
  shippingAddress: Prisma.JsonValue | null;
  billingAddress: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemRow[];
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
}
