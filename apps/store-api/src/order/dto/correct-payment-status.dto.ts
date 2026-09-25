import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PaymentStatus } from '@prisma/client';

/** The only states a mistaken REFUNDED mark may be corrected to (TASK-620). */
export const PAYMENT_CORRECTION_TARGETS = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
] as const;

/**
 * Body of `POST /api/admin/orders/:orderId/payment-correction` (TASK-620,
 * decision B-11 №7): lift an operator's mistaken «Кошти повернено».
 *
 * The reason is REQUIRED — a correction of a money mark with no explanation is
 * exactly the entry an owner cannot interpret a month later. It is written to
 * the action log with the rest of the body by the audit interceptor.
 */
export class CorrectPaymentStatusDto {
  @ApiProperty({
    description: 'What the mistaken REFUNDED mark should have been',
    enum: PAYMENT_CORRECTION_TARGETS,
    enumName: 'PaymentCorrectionTarget',
    example: PaymentStatus.PAID,
  })
  @IsIn(PAYMENT_CORRECTION_TARGETS, {
    message: 'paymentStatus must be PAID or PARTIALLY_REFUNDED',
  })
  paymentStatus!: (typeof PAYMENT_CORRECTION_TARGETS)[number];

  @ApiProperty({
    description: 'Why the mark is being corrected — required, stored in the action log',
    example: 'Помилково натиснула «Кошти повернено» замість «Частково повернено»',
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'reason is required' })
  @MaxLength(500)
  reason!: string;
}
