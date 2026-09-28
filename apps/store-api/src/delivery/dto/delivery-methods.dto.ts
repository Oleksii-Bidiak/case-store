import { ApiProperty } from '@nestjs/swagger';
import { DeliveryMethod, PaymentMethod } from '@prisma/client';

/**
 * A pickup point as the storefront sees it (TASK-643). The shop's bookkeeping —
 * `isActive`, `sortOrder`, timestamps — is not part of the public contract.
 */
export class PickupPointPublicDto {
  @ApiProperty({ format: 'uuid', example: '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11' })
  id!: string;

  @ApiProperty({ example: 'Магазин на Хрещатику' })
  name!: string;

  @ApiProperty({ example: 'Київ' })
  city!: string;

  @ApiProperty({ example: 'вул. Хрещатик, 1' })
  address!: string;

  @ApiProperty({ type: String, nullable: true, example: '+380441234567' })
  phone!: string | null;

  @ApiProperty({
    description: 'Free text, shown as typed',
    type: String,
    nullable: true,
    example: 'Пн–Пт 10:00–19:00',
  })
  workingHours!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'https://maps.app.goo.gl/…' })
  mapUrl!: string | null;
}

/** The courier's public terms (TASK-643). */
export class CourierTermsDto {
  @ApiProperty({ description: 'Flat courier price, UAH (decimal string)', example: '120.00' })
  price!: string;

  @ApiProperty({
    description:
      'Product subtotal (UAH, decimal string) from which the courier is free, inclusive. ' +
      'Null = never free.',
    type: String,
    nullable: true,
    example: '1500.00',
  })
  freeFrom!: string | null;

  @ApiProperty({
    description: 'The city the courier works in',
    type: String,
    nullable: true,
    example: 'Київ',
  })
  cityName!: string | null;
}

/**
 * Which payment methods each delivery method admits — the server's own matrix
 * (`order/delivery-payment-matrix.ts`), served so the storefront disables exactly
 * the options the server would refuse (plan 184, risk «Два джерела правди»).
 */
export class DeliveryPaymentMatrixDto {
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod', isArray: true })
  NOVA_POSHTA!: PaymentMethod[];

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod', isArray: true })
  PICKUP!: PaymentMethod[];

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod', isArray: true })
  COURIER!: PaymentMethod[];

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod', isArray: true })
  OTHER!: PaymentMethod[];
}

/**
 * What the checkout may offer right now (TASK-643): the source of the storefront's
 * delivery step, replacing any env variable or constant (B-6 §7).
 */
export class DeliveryMethodsDto {
  @ApiProperty({
    description:
      'Enabled delivery methods, always in the order NOVA_POSHTA, PICKUP, COURIER, OTHER. ' +
      'PICKUP is listed only while at least one active pickup point exists.',
    enum: DeliveryMethod,
    enumName: 'DeliveryMethod',
    isArray: true,
    example: ['NOVA_POSHTA', 'OTHER'],
  })
  methods!: DeliveryMethod[];

  @ApiProperty({ type: CourierTermsDto })
  courier!: CourierTermsDto;

  @ApiProperty({
    description: 'Active pickup points in the shop’s order; empty while pickup is disabled',
    type: [PickupPointPublicDto],
  })
  pickupPoints!: PickupPointPublicDto[];

  @ApiProperty({ type: DeliveryPaymentMatrixDto })
  paymentMatrix!: DeliveryPaymentMatrixDto;
}

/** Response envelope for `GET /api/delivery/methods`. */
export class DeliveryMethodsResponse {
  @ApiProperty({ type: DeliveryMethodsDto })
  data!: DeliveryMethodsDto;
}
