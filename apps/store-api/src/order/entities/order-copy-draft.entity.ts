import { ApiProperty } from '@nestjs/swagger';
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * «Створити копію» (TASK-2048): what `/orders/new?copyOf=<id>` starts from —
 * `GET /api/admin/orders/:id/copy-draft`. A PREFILL, never a contract: the
 * operator edits it, and `POST /api/admin/orders` re-checks and re-prices
 * everything. The original's promo code is deliberately absent.
 */

export class OrderCopyDraftCustomerEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'olena@example.com' })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;
}

export class OrderCopyDraftContactEntity {
  @ApiProperty({ example: 'Олена Коваль' })
  name!: string;

  @ApiProperty({ example: '+380501234567' })
  phone!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;
}

/** The recipient and destination of the original, as the create form fills them. */
export class OrderCopyDraftAddressEntity {
  @ApiProperty({ example: 'Олена' })
  firstName!: string;

  @ApiProperty({ example: 'Коваль' })
  lastName!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 'Київ' })
  city!: string;

  @ApiProperty({ example: 'Відділення №12' })
  address1!: string;

  @ApiProperty({ type: String, nullable: true })
  postalCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nova Poshta city ref' })
  npCityRef!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nova Poshta branch ref' })
  npWarehouseRef!: string | null;
}

export class OrderCopyDraftLineEntity {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Чохол iPhone 15' })
  productName!: string;

  @ApiProperty({ type: String, nullable: true })
  sku!: string | null;

  @ApiProperty({ description: 'TODAY’s catalogue price — display only', example: '549.00' })
  price!: string;

  @ApiProperty({ description: 'Quantity, clamped to what can be sold', example: 1 })
  quantity!: number;

  @ApiProperty({
    description:
      'What the copy may take: shelf stock plus the units cancelling the original releases ' +
      '(only while it is pre-shipment and still holds them)',
    example: 3,
  })
  stock!: number;
}

export class OrderCopyDraftDroppedEntity {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Чохол iPhone 15' })
  productName!: string;

  @ApiProperty({ description: 'Quantity on the original', example: 2 })
  requested!: number;

  @ApiProperty({ description: '0 = dropped; otherwise the clamped quantity', example: 1 })
  copied!: number;

  @ApiProperty({
    enum: ['DELETED', 'INACTIVE', 'OUT_OF_STOCK', 'CLAMPED'],
    enumName: 'OrderCopyDropReason',
  })
  reason!: 'DELETED' | 'INACTIVE' | 'OUT_OF_STOCK' | 'CLAMPED';
}

export class OrderCopyDraftEntity {
  @ApiProperty({ format: 'uuid' })
  sourceOrderId!: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  sourceStatus!: OrderStatus;

  @ApiProperty({
    description:
      'Whether «Скасувати #старе — замінено» is offered (and ticked): the original is ' +
      'PENDING/CONFIRMED/PROCESSING',
  })
  canCancelOriginal!: boolean;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  userId!: string | null;

  @ApiProperty({ type: OrderCopyDraftCustomerEntity, nullable: true })
  customer!: OrderCopyDraftCustomerEntity | null;

  @ApiProperty({ type: OrderCopyDraftContactEntity, nullable: true })
  contact!: OrderCopyDraftContactEntity | null;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ enum: DeliveryMethod, enumName: 'DeliveryMethod' })
  deliveryMethod!: DeliveryMethod;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  pickupPointId!: string | null;

  @ApiProperty({ type: OrderCopyDraftAddressEntity, nullable: true })
  shippingAddress!: OrderCopyDraftAddressEntity | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The agreed «Інша доставка» cost; null when none was agreed or another method',
  })
  shippingCost!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Notes the customer gave' })
  notes!: string | null;

  @ApiProperty({ type: [OrderCopyDraftLineEntity] })
  items!: OrderCopyDraftLineEntity[];

  @ApiProperty({
    type: [OrderCopyDraftDroppedEntity],
    description: 'Lines not copied, or copied with a lower quantity — the operator is warned',
  })
  dropped!: OrderCopyDraftDroppedEntity[];

  @ApiProperty({
    description:
      'What the original holds (paid − refunded, kopecks): moves to the copy as «Залік», up to ' +
      'its total, once the original is cancelled',
    example: 0,
  })
  heldKop!: number;
}
