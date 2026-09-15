import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@prisma/client';
import { centsToString, toCents, toTwoDecimals } from '../../addon-service';
import { ORDER_NUMBER_LENGTH } from '../dto/order-lookup.dto';
import type { ShippingAddressData } from '../order.types';

/**
 * The slice of an order the public lookup query actually reads (TASK-483).
 *
 * Declared here, beside the projection it feeds, rather than in `order.types.ts`
 * with the admin row shapes: this one is deliberately NARROW, and a shape that
 * lives next to the wide ones is a shape somebody widens by reflex.
 */
export interface PublicOrderRow {
  id: string;
  createdAt: Date;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  subtotal: { toString(): string };
  discount: { toString(): string };
  shippingCost: { toString(): string };
  addonsTotal: { toString(): string } | null;
  total: { toString(): string };
  trackingNumber: string | null;
  shippingAddress: unknown;
  items: Array<{
    quantity: number;
    price: { toString(): string };
    product: { name: string };
    addons: Array<{ name: string; price: { toString(): string } }>;
  }>;
}

/**
 * One purchased line, as a stranger holding the order number and the phone is
 * allowed to see it.
 */
export class PublicOrderItemEntity {
  @ApiProperty({ description: 'Product name at the time of purchase', example: 'Чохол MagSafe' })
  productName!: string;

  @ApiProperty({ description: 'Quantity ordered', example: 2 })
  quantity!: number;

  @ApiProperty({ description: 'Unit price as string', example: '299.00' })
  price!: string;

  @ApiProperty({ description: 'Line total as string (price × quantity)', example: '598.00' })
  lineTotal!: string;

  @ApiProperty({
    description: 'Add-on services bought with this line — frozen name/price snapshots',
    type: [String],
    example: ['Страхування від пошкоджень'],
  })
  addons!: string[];
}

/**
 * Where the parcel is going, reduced to what the buyer already knows and a
 * courier would read aloud anyway (TASK-483).
 *
 * City and Nova Poshta branch ONLY. `address1` — the street and flat number of a
 * courier delivery — is absent from this class entirely, which is the reason
 * this is a separate class rather than `ShippingAddressData` with a couple of
 * fields left unset: a field that is merely unassigned comes back the first time
 * somebody widens a `select`.
 */
export class PublicOrderDeliveryEntity {
  @ApiProperty({
    description: 'Destination city, or null when the order carries no address snapshot',
    type: String,
    nullable: true,
    example: 'Київ',
  })
  city!: string | null;

  @ApiProperty({
    description: 'Nova Poshta branch, or null for a courier delivery (the street is NEVER shown)',
    type: String,
    nullable: true,
    example: 'Відділення №12',
  })
  warehouse!: string | null;
}

/**
 * PublicOrderEntity — what `POST /api/orders/lookup` answers with (TASK-483).
 *
 * ── A SEPARATE projection, not `OrderEntity` with fields hidden ───────────────
 * Owner's decision, B-5 §3. The difference matters at the moment somebody adds
 * an `include` to a query or a field to the entity: a hidden field comes back,
 * a field that was never declared cannot. So this class has no `id`, no
 * `guest` block, no `customer`, no `notes`, no `internalNotes`, no street
 * address — not "null", not "omitted on this path": absent.
 *
 * ── Why it is narrower than the emailed-token page ────────────────────────────
 * The line is drawn by the strength of the proof. A link from the confirmation
 * email proves possession of the INBOX, so `/orders/guest/:token` shows the
 * whole order. This form proves knowledge of two strings, one of which is a
 * phone number that relatives, colleagues and the courier all know. It may
 * therefore tell you how your parcel is doing; it may not tell you where the
 * buyer lives.
 *
 * What it shows: the number, the date, both statuses, the lines with quantities
 * and sums, the money, the delivery city + branch, and the waybill.
 */
export class PublicOrderEntity {
  @ApiProperty({
    description: 'The 8-character order number printed on the confirmation email',
    example: '94F5F971',
  })
  number!: string;

  @ApiProperty({ description: 'When the order was placed', example: '2026-09-14T10:15:30.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Order status', enum: OrderStatus, example: OrderStatus.SHIPPED })
  status!: OrderStatus;

  @ApiProperty({
    description: 'Payment status',
    enum: PaymentStatus,
    example: PaymentStatus.PENDING,
  })
  paymentStatus!: PaymentStatus;

  @ApiProperty({
    description: 'How the buyer chose to pay',
    enum: PaymentMethod,
    example: PaymentMethod.ON_DELIVERY,
  })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ description: 'Purchased lines', type: [PublicOrderItemEntity] })
  items!: PublicOrderItemEntity[];

  @ApiProperty({ description: 'Sum of the lines as string', example: '598.00' })
  subtotal!: string;

  @ApiProperty({ description: 'Discount applied as string', example: '0.00' })
  discount!: string;

  @ApiProperty({ description: 'Shipping cost as string', example: '70.00' })
  shippingCost!: string;

  @ApiProperty({ description: 'Sum of the add-on snapshots as string', example: '0.00' })
  addonsTotal!: string;

  @ApiProperty({ description: 'Grand total as string', example: '668.00' })
  total!: string;

  @ApiProperty({ description: 'Delivery destination', type: () => PublicOrderDeliveryEntity })
  delivery!: PublicOrderDeliveryEntity;

  @ApiProperty({
    description: 'Nova Poshta waybill (ТТН), or null while the parcel has not been handed over',
    type: String,
    nullable: true,
    example: '20450000000001',
  })
  trackingNumber!: string | null;

  /**
   * Build the public projection from the narrow row the lookup repository reads.
   *
   * Money is summed in integer cents, like everywhere else in this codebase:
   * three lines of 33.33 must add up to 99.99 and not to 99.99000000000001.
   */
  static fromRow(row: PublicOrderRow): PublicOrderEntity {
    const address = (row.shippingAddress as ShippingAddressData | null) ?? null;

    const entity = new PublicOrderEntity();
    entity.number = row.id.slice(0, ORDER_NUMBER_LENGTH).toUpperCase();
    entity.createdAt = row.createdAt;
    entity.status = row.status;
    entity.paymentStatus = row.paymentStatus;
    entity.paymentMethod = row.paymentMethod ?? PaymentMethod.ON_DELIVERY;
    entity.items = row.items.map((item) => ({
      productName: item.product.name,
      quantity: item.quantity,
      price: toTwoDecimals(item.price),
      lineTotal: centsToString(toCents(item.price) * item.quantity),
      addons: item.addons.map((addon) => addon.name),
    }));
    entity.subtotal = toTwoDecimals(row.subtotal);
    entity.discount = toTwoDecimals(row.discount);
    entity.shippingCost = toTwoDecimals(row.shippingCost);
    entity.addonsTotal = toTwoDecimals(row.addonsTotal ?? '0');
    entity.total = toTwoDecimals(row.total);
    entity.delivery = {
      city: address?.city ?? null,
      warehouse: address?.npWarehouseName ?? null,
    };
    entity.trackingNumber = row.trackingNumber ?? null;
    return entity;
  }
}
