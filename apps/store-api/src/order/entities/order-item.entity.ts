import { ApiProperty } from '@nestjs/swagger';
import { toTwoDecimals } from '../../addon-service';
import type { OrderItemRow } from '../order.types';

/**
 * A frozen add-on-service snapshot on an order line (TASK-174). `name`/`price`
 * were copied at order-creation time — this is a pure snapshot read, with no
 * live join back to the catalog, so a later reprice, template edit, or delta
 * edit can never rewrite what the customer was charged.
 */
export class OrderItemAddonEntity {
  @ApiProperty({ description: 'Snapshot row id' })
  id!: string;

  @ApiProperty({
    description:
      'Catalog id of the add-on service, or null if the catalog row was hard-deleted (not a path the admin has today)',
    type: String,
    nullable: true,
  })
  addonServiceId!: string | null;

  @ApiProperty({
    description: 'Service name at the time of purchase',
    example: 'Страхування від пошкоджень',
  })
  name!: string;

  @ApiProperty({ description: 'Price paid, as string', example: '1299.00' })
  price!: string;

  static fromPrisma(row: OrderItemRow['addons'][number]): OrderItemAddonEntity {
    const entity = new OrderItemAddonEntity();
    entity.id = row.id;
    entity.addonServiceId = row.addonServiceId;
    entity.name = row.name;
    entity.price = toTwoDecimals(row.price);
    return entity;
  }
}

/**
 * Domain entity representing a single line in an order.
 *
 * This is a clean domain entity — not a Prisma model. The `price` is the
 * unit price snapshotted at the time of purchase; `lineTotal` is computed
 * with cents arithmetic to avoid floating-point precision issues (the same
 * pattern as {@link CartItemEntity}). `productSlug` and `imageUrl` (the
 * product's primary image, or null) let the order-detail view render a
 * thumbnail and link to the PDP without an extra request per line.
 */
export class OrderItemEntity {
  @ApiProperty({
    description: 'Order item unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Product (position) ID this line refers to',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  productId!: string;

  @ApiProperty({
    description: 'Product name at the time of purchase',
    example: 'iPhone 15 Pro Case — Clear MagSafe',
  })
  productName!: string;

  @ApiProperty({
    description: 'URL slug for the PDP link',
    example: 'iphone-15-pro-case-clear-magsafe',
  })
  productSlug!: string;

  @ApiProperty({
    description: 'Primary image URL, null when the product has no images',
    type: String,
    nullable: true,
    required: false,
  })
  imageUrl!: string | null;

  @ApiProperty({ description: 'Quantity ordered', example: 2 })
  quantity!: number;

  @ApiProperty({
    description: 'Unit price as string, snapshotted at purchase time',
    example: '29.99',
  })
  price!: string;

  @ApiProperty({
    description: 'Line total as string (price × quantity)',
    example: '59.98',
  })
  lineTotal!: string;

  @ApiProperty({
    description:
      'Add-on services bought with this line (TASK-174) — frozen name/price snapshots, NOT part of `lineTotal` (they are reported on the order as `addonsTotal`).',
    type: [OrderItemAddonEntity],
  })
  addons!: OrderItemAddonEntity[];

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  /**
   * Create an OrderItemEntity from a repository row. Converts the Decimal
   * price to a string and computes the line total using cents arithmetic.
   */
  static fromPrisma(row: OrderItemRow): OrderItemEntity {
    const entity = new OrderItemEntity();
    entity.id = row.id;
    entity.productId = row.productId;
    entity.productName = row.product.name;
    entity.productSlug = row.product.slug;
    entity.imageUrl = row.product.images[0]?.url ?? null;
    entity.quantity = row.quantity;

    const priceStr = row.price.toString();
    entity.price = priceStr;

    // Calculate line total using cents arithmetic to avoid float errors.
    const priceCents = Math.round(parseFloat(priceStr) * 100);
    const lineTotalCents = priceCents * row.quantity;
    const dollars = Math.floor(lineTotalCents / 100);
    const cents = lineTotalCents % 100;
    entity.lineTotal = `${dollars}.${cents.toString().padStart(2, '0')}`;

    entity.addons = (row.addons ?? []).map((addon) => OrderItemAddonEntity.fromPrisma(addon));

    entity.createdAt = row.createdAt;
    return entity;
  }
}
