import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AddressDto } from './address.dto';

/**
 * Operator-editable fields that are not part of the order's lifecycle
 * (TASK-335 / TASK-336).
 *
 * Kept off the status endpoint on purpose: a waybill number and a status change
 * are different decisions with different consequences (one of them emails the
 * customer), and merging them would make "just fix a typo in the ТТН" capable of
 * moving the order.
 */
export class UpdateOrderDetailsDto {
  @ApiProperty({
    description:
      'Nova Poshta waybill (ТТН), typed in by the operator (TASK-335). Send null to clear it. ' +
      'Setting it on an already-SHIPPED order that had none sends the customer their ' +
      'tracking notice.',
    required: false,
    nullable: true,
    maxLength: 64,
    example: '20450000000001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  // Trimmed because a waybill is copy-pasted out of the courier's interface far
  // more often than it is typed, and it arrives with whitespace. An empty result
  // becomes null — "cleared", not "the empty string".
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  trackingNumber?: string | null;

  @ApiProperty({
    description:
      'Operator-only notes (TASK-336). NEVER returned on customer-facing order endpoints — ' +
      "`notes` is the customer's own field and the two are different things. Send null to clear.",
    required: false,
    nullable: true,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  internalNotes?: string | null;

  @ApiProperty({
    description:
      'Replacement delivery address (TASK-341). Accepted only BEFORE the parcel ships — once ' +
      'it is with the courier the address on the waybill is the one that counts, and editing ' +
      'the order would only make the record disagree with reality.',
    type: AddressDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress?: AddressDto;

  /**
   * Optimistic-lock token — the same contract as
   * {@link UpdateOrderStatusDto.expectedUpdatedAt}, for the same reason: two
   * operators with one order open.
   */
  @ApiProperty({
    description:
      "The order's `updatedAt` as the client last read it. When supplied and no longer " +
      'current, the request is rejected with 409 ORDER_STALE.',
    required: false,
    format: 'date-time',
    example: '2026-07-28T10:15:30.000Z',
  })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
