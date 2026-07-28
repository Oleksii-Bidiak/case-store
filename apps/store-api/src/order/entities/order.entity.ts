import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { OrderItemEntity } from './order-item.entity';
import { toTwoDecimals } from '../../addon-service';
import type { OrderWithItems, ShippingAddressData } from '../order.types';

/**
 * Customer account data attached to an order on admin responses only.
 *
 * Populated from the joined `user` relation (see `ADMIN_ORDERS_INCLUDE`) so an
 * admin can see who placed an order (email + name). Never present on
 * customer-facing order responses — those queries do not join the user.
 */
export class OrderCustomerData {
  @ApiProperty({
    description: 'Customer account ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  id!: string;

  @ApiProperty({ description: 'Customer account email', example: 'buyer@example.com' })
  email!: string;

  @ApiProperty({ description: 'First name', nullable: true, type: String, example: 'Ivan' })
  firstName!: string | null;

  @ApiProperty({ description: 'Last name', nullable: true, type: String, example: 'Petrenko' })
  lastName!: string | null;
}

/**
 * Contact details captured at guest checkout (TASK-338).
 *
 * Safe on customer-facing responses: a guest reaching their own order through the
 * emailed token is being shown the address they themselves typed. It carries no
 * account data because there is no account.
 */
export class OrderGuestData {
  @ApiProperty({ description: 'Email given at checkout', example: 'olena@example.com' })
  email!: string;

  @ApiProperty({ description: 'Phone given at checkout', example: '+380501234567' })
  phone!: string;

  @ApiProperty({ description: 'Name given at checkout', example: 'Олена Шевченко' })
  name!: string;
}

/**
 * Domain entity representing an order.
 *
 * This is a clean domain entity — not a Prisma model. All `Decimal` money
 * fields are converted to strings (via `.toString()`) to avoid floating-point
 * precision issues in JSON serialization. Address JSON columns are surfaced as
 * typed {@link ShippingAddressData} objects.
 */
export class OrderEntity {
  @ApiProperty({
    description: 'Order unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description:
      'Owning user ID, or null for a guest order (TASK-338). Exactly one of `userId` and ' +
      '`guest` is populated.',
    type: String,
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  userId!: string | null;

  @ApiProperty({
    description:
      'Contact details captured at guest checkout (TASK-338); absent on account orders. ' +
      'Kept as a snapshot of what was actually typed, even after an account later claims ' +
      'the order.',
    type: () => OrderGuestData,
    required: false,
    nullable: true,
  })
  guest?: OrderGuestData;

  @ApiProperty({ description: 'Order status', enum: OrderStatus, example: OrderStatus.PENDING })
  status!: OrderStatus;

  @ApiProperty({
    description: 'Payment status',
    enum: PaymentStatus,
    example: PaymentStatus.PENDING,
  })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ description: 'Sum of all line totals as string', example: '149.97' })
  subtotal!: string;

  @ApiProperty({ description: 'Discount applied as string', example: '0.00' })
  discount!: string;

  @ApiProperty({
    description: 'Promo code applied to the order (TASK-079), or null',
    nullable: true,
    type: String,
    example: 'SUMMER10',
  })
  discountCode!: string | null;

  @ApiProperty({ description: 'Shipping cost as string', example: '0.00' })
  shippingCost!: string;

  @ApiProperty({ description: 'Tax as string', example: '0.00' })
  tax!: string;

  @ApiProperty({
    description:
      'Sum of the frozen add-on-service snapshots across all lines (TASK-174). Like `shippingCost`, it is NEVER part of the discount base: `total = subtotal + shippingCost + addonsTotal - discount`, with `discount` clamped against `subtotal` alone.',
    example: '499.00',
  })
  addonsTotal!: string;

  @ApiProperty({ description: 'Grand total as string', example: '149.97' })
  total!: string;

  @ApiProperty({
    description: 'Shipping address snapshot',
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  shippingAddress!: ShippingAddressData | null;

  @ApiProperty({
    description: 'Billing address snapshot (falls back to shipping address)',
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  billingAddress!: ShippingAddressData | null;

  @ApiProperty({
    description: 'Customer notes',
    type: String,
    nullable: true,
    example: 'Leave at the door',
  })
  notes!: string | null;

  @ApiProperty({ description: 'Order line items', type: [OrderItemEntity] })
  items!: OrderItemEntity[];

  @ApiProperty({
    description: 'Customer account data — present only on admin order responses',
    type: () => OrderCustomerData,
    required: false,
    nullable: true,
  })
  customer?: OrderCustomerData;

  @ApiProperty({
    description:
      'When reserved stock was auto-returned to inventory on cancellation (TASK-228), ' +
      'or null while the order still holds stock / was never restocked. Set once when a ' +
      'pre-shipment order is cancelled and cleared back to null if the order is revived.',
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2024-01-01T00:00:00.000Z',
  })
  restockedAt!: Date | null;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    description:
      'Nova Poshta waybill (ТТН) entered by the operator (TASK-335), or null. Shown to the ' +
      'customer so they can track the parcel.',
    type: String,
    nullable: true,
    example: '20450000000001',
  })
  trackingNumber!: string | null;

  @ApiProperty({
    description:
      'Operator-only notes (TASK-336). Present ONLY on admin responses — distinct from ' +
      '`notes`, which is what the customer typed and is shown back to them.',
    type: String,
    required: false,
    nullable: true,
  })
  internalNotes?: string | null;

  /**
   * Create an OrderEntity from a repository order. Converts all Decimal money
   * fields to strings and maps each line into an {@link OrderItemEntity}.
   *
   * `includeInternal` is OPT-IN, and defaults to off, because the read paths that
   * feed customer responses select the whole order row — `internalNotes` is
   * sitting right there in the object. Making the caller ask for it means the
   * failure mode of a forgotten flag is "the admin misses a field", not "the
   * buyer reads the fraud note about themselves" (TASK-336).
   */
  static fromPrisma(
    order: OrderWithItems,
    options: { includeInternal?: boolean } = {},
  ): OrderEntity {
    const entity = new OrderEntity();
    entity.id = order.id;
    entity.userId = order.userId;
    entity.status = order.status;
    entity.paymentStatus = order.paymentStatus;
    entity.subtotal = order.subtotal.toString();
    entity.discount = order.discount.toString();
    entity.discountCode = order.discountCode ?? null;
    entity.shippingCost = order.shippingCost.toString();
    entity.tax = order.tax.toString();
    entity.addonsTotal = toTwoDecimals(order.addonsTotal ?? '0');
    entity.total = order.total.toString();
    entity.shippingAddress = (order.shippingAddress as ShippingAddressData | null) ?? null;
    entity.billingAddress = (order.billingAddress as ShippingAddressData | null) ?? null;
    entity.notes = order.notes;
    entity.items = order.items.map((item) => OrderItemEntity.fromPrisma(item));
    // Only set on admin reads, which join the `user` relation. Customer-facing
    // reads omit it, so `customer` stays absent from those responses (TASK-125).
    if (order.user) {
      entity.customer = {
        id: order.user.id,
        email: order.user.email,
        firstName: order.user.firstName,
        lastName: order.user.lastName,
      };
    }
    // TASK-338: a guest order has no user row, so the contact block IS the
    // customer record. Keyed off the email because that is the field the order
    // cannot be placed without; phone/name fall back to empty strings rather than
    // making the whole block vanish on a partially-filled legacy row.
    if (order.guestEmail) {
      entity.guest = {
        email: order.guestEmail,
        phone: order.guestPhone ?? '',
        name: order.guestName ?? '',
      };
    }
    entity.restockedAt = order.restockedAt;
    entity.trackingNumber = order.trackingNumber ?? null;
    // TASK-336: opt-in, never automatic — see the docblock above.
    if (options.includeInternal) {
      entity.internalNotes = order.internalNotes ?? null;
    }
    entity.createdAt = order.createdAt;
    entity.updatedAt = order.updatedAt;
    return entity;
  }
}
