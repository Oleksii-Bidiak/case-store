import { ApiProperty } from '@nestjs/swagger';
import { Payment, PaymentAttemptStatus } from '@prisma/client';

/**
 * Domain entity for one payment attempt — not a Prisma model.
 *
 * `Decimal` is surfaced as a string for the same reason it is on
 * {@link OrderEntity}: JSON has one numeric type and it is a float, so money
 * that round-trips through `number` eventually loses a kopiyka.
 */
export class PaymentEntity {
  @ApiProperty({
    description: 'Payment attempt id. This is the identifier sent to the provider as ITS order id',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Order this attempt belongs to' })
  orderId!: string;

  @ApiProperty({ description: 'Payment adapter key', example: 'liqpay' })
  provider!: string;

  @ApiProperty({ description: 'Amount charged, as a decimal string', example: '1249.00' })
  amount!: string;

  @ApiProperty({ description: 'ISO 4217 currency code', example: 'UAH' })
  currency!: string;

  @ApiProperty({ description: 'Lifecycle of this attempt', enum: PaymentAttemptStatus })
  status!: PaymentAttemptStatus;

  @ApiProperty({
    description: "The provider's own id for the transaction",
    nullable: true,
    type: String,
  })
  providerPaymentId!: string | null;

  @ApiProperty({ description: 'Provider error code', nullable: true, type: String })
  failureCode!: string | null;

  @ApiProperty({ description: 'Provider error message', nullable: true, type: String })
  failureMessage!: string | null;

  @ApiProperty({ description: 'When the attempt reached a final state', nullable: true })
  settledAt!: Date | null;

  @ApiProperty({ description: 'When the attempt was opened' })
  createdAt!: Date;

  static fromPrisma(payment: Payment): PaymentEntity {
    const entity = new PaymentEntity();
    entity.id = payment.id;
    entity.orderId = payment.orderId;
    entity.provider = payment.provider;
    entity.amount = payment.amount.toString();
    entity.currency = payment.currency;
    entity.status = payment.status;
    entity.providerPaymentId = payment.providerPaymentId;
    entity.failureCode = payment.failureCode;
    entity.failureMessage = payment.failureMessage;
    entity.settledAt = payment.settledAt;
    entity.createdAt = payment.createdAt;
    return entity;
  }
}

/**
 * Everything the storefront needs to hand the customer to the provider.
 *
 * `fields` is deliberately opaque (`Record<string, string>`): LiqPay wants
 * `data` + `signature`, another provider may want nothing at all. The storefront
 * renders whatever is here into a form and submits it — see
 * {@link HostedCheckoutHandoff}.
 */
export class PaymentCheckoutEntity {
  @ApiProperty({ description: 'The payment attempt this handoff belongs to' })
  paymentId!: string;

  @ApiProperty({ description: "The provider's hosted checkout URL" })
  url!: string;

  @ApiProperty({ description: 'How the browser must reach it', enum: ['POST', 'GET'] })
  method!: 'POST' | 'GET';

  @ApiProperty({
    description: 'Signed form fields to submit. Never contains the private key',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { data: 'eyJ2ZXJzaW9uIjo3…', signature: '0adgJ8F2Ds5HCVkcz4…' },
  })
  fields!: Record<string, string>;
}
