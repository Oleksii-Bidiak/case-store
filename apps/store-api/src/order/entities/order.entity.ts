import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { OrderItemEntity } from './order-item.entity';
import type { OrderWithItems, ShippingAddressData } from '../order.types';

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
    description: 'Owning user ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  userId!: string;

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

  @ApiProperty({ description: 'Shipping cost as string', example: '0.00' })
  shippingCost!: string;

  @ApiProperty({ description: 'Tax as string', example: '0.00' })
  tax!: string;

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

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create an OrderEntity from a repository order. Converts all Decimal money
   * fields to strings and maps each line into an {@link OrderItemEntity}.
   */
  static fromPrisma(order: OrderWithItems): OrderEntity {
    const entity = new OrderEntity();
    entity.id = order.id;
    entity.userId = order.userId;
    entity.status = order.status;
    entity.paymentStatus = order.paymentStatus;
    entity.subtotal = order.subtotal.toString();
    entity.discount = order.discount.toString();
    entity.shippingCost = order.shippingCost.toString();
    entity.tax = order.tax.toString();
    entity.total = order.total.toString();
    entity.shippingAddress = (order.shippingAddress as ShippingAddressData | null) ?? null;
    entity.billingAddress = (order.billingAddress as ShippingAddressData | null) ?? null;
    entity.notes = order.notes;
    entity.items = order.items.map((item) => OrderItemEntity.fromPrisma(item));
    entity.createdAt = order.createdAt;
    entity.updatedAt = order.updatedAt;
    return entity;
  }
}
