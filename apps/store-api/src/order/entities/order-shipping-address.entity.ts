import { ApiProperty } from '@nestjs/swagger';
import { DeliveryMethod } from '@prisma/client';

/**
 * The address snapshot stored on an order, as the API documents it (TASK-1023).
 *
 * Swagger-only: at runtime `OrderEntity.shippingAddress` is the JSON column
 * passed through untouched (see `ShippingAddressData` in `order.types.ts`), so
 * old orders keep exactly the keys they were written with. Until TASK-1023 the
 * contract said `object` with free-form properties, which left both frontends
 * reading `deliveryMethod` / `pickupPointName` through an untyped cast — this
 * class gives the Orval-generated type real fields.
 *
 * Every snapshot field is OPTIONAL (`required: false`): an order created before
 * TASK-643 has none of the delivery keys, an NP order has no pickup keys, and a
 * pickup order has no `np*` keys. Readers must fall back to
 * `OrderEntity.deliveryMethod` when the snapshot has no `deliveryMethod`.
 *
 * `order.entity.spec.ts` pins that every key of `ShippingAddressData` is
 * declared here, so a snapshot field added later cannot silently stay
 * undocumented.
 */
export class OrderShippingAddressEntity {
  @ApiProperty({ description: 'Recipient first name', example: 'Олена' })
  firstName!: string;

  @ApiProperty({ description: 'Recipient last name', example: 'Коваль' })
  lastName!: string;

  @ApiProperty({ description: 'Company', required: false, example: 'ТОВ «Кейс»' })
  company?: string;

  @ApiProperty({
    description:
      'Street address. For PICKUP the server overwrites it with the pickup point address ' +
      '(TASK-643).',
    example: 'вул. Січових Стрільців, 37, кв. 12',
  })
  address1!: string;

  @ApiProperty({ description: 'Address line 2', required: false })
  address2?: string;

  @ApiProperty({
    description: 'City. For PICKUP the server overwrites it with the pickup point city.',
    example: 'Київ',
  })
  city!: string;

  @ApiProperty({ description: 'Region / state', required: false })
  state?: string;

  @ApiProperty({ description: 'Postal code', required: false, example: '01001' })
  postalCode?: string;

  @ApiProperty({ description: 'ISO country code', required: false, example: 'UA' })
  country?: string;

  @ApiProperty({ description: 'Recipient phone', required: false, example: '+380501234567' })
  phone?: string;

  @ApiProperty({
    description: 'Nova Poshta city ref (TASK-080); NOVA_POSHTA orders only',
    required: false,
  })
  npCityRef?: string;

  @ApiProperty({
    description: 'Nova Poshta branch ref (TASK-080); NOVA_POSHTA orders only',
    required: false,
  })
  npWarehouseRef?: string;

  @ApiProperty({
    description: 'Nova Poshta branch name as shown at checkout; NOVA_POSHTA orders only',
    required: false,
    example: 'Відділення №1: вул. Пилипа Орлика, 1',
  })
  npWarehouseName?: string;

  @ApiProperty({
    description:
      'Delivery method decided at checkout (TASK-643). Absent on orders created before it — ' +
      'fall back to the order-level `deliveryMethod`.',
    enum: DeliveryMethod,
    enumName: 'DeliveryMethod',
    required: false,
    example: DeliveryMethod.NOVA_POSHTA,
  })
  deliveryMethod?: DeliveryMethod;

  @ApiProperty({
    description:
      "Carrier that moves the parcel: 'NOVA_POSHTA' for Nova Poshta, null for pickup, the " +
      "shop's courier and OTHER (TASK-643)",
    type: String,
    nullable: true,
    required: false,
    example: 'NOVA_POSHTA',
  })
  carrier?: string | null;

  @ApiProperty({
    description:
      'True only for OTHER: the booked shipping cost (0) is a placeholder the operator will ' +
      'replace, NOT free delivery. Render "вартість уточнить оператор", never "0 ₴" (TASK-643).',
    required: false,
    example: true,
  })
  shippingCostPending?: boolean;

  @ApiProperty({
    description: 'PICKUP only: the point name as it was at checkout',
    type: String,
    nullable: true,
    required: false,
    example: 'Магазин на Хрещатику',
  })
  pickupPointName?: string | null;

  @ApiProperty({
    description: 'PICKUP only: the point address as it was at checkout',
    type: String,
    nullable: true,
    required: false,
    example: 'вул. Хрещатик, 22',
  })
  pickupPointAddress?: string | null;

  @ApiProperty({
    description: 'PICKUP only: the point working hours as typed by the owner, at checkout time',
    type: String,
    nullable: true,
    required: false,
    example: 'Пн–Сб 10:00–20:00, Нд 11:00–18:00',
  })
  pickupPointHours?: string | null;

  @ApiProperty({
    description: 'PICKUP only: the point phone at checkout time',
    type: String,
    nullable: true,
    required: false,
    example: '+380441234567',
  })
  pickupPointPhone?: string | null;

  @ApiProperty({
    description: 'PICKUP only: the point map link at checkout time',
    type: String,
    nullable: true,
    required: false,
    example: 'https://maps.google.com/?q=Хрещатик+22',
  })
  pickupPointMapUrl?: string | null;
}
