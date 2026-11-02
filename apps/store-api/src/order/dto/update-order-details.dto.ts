import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DeliveryMethod } from '@prisma/client';
import { IsNovaPoshtaWaybill, normalizeWaybill } from '../../common/validators';
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
      'Nova Poshta waybill (ТТН), typed in by the operator (TASK-335): EXACTLY 14 DIGITS ' +
      '(TASK-426 / AD-ORD-18). Separators are allowed on the way in and stripped before ' +
      'storage, so `2045 0000 0000 01` is stored as `20450000000001`. Send null to clear it. ' +
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
  // Trimmed, and separators stripped, because a waybill is copy-pasted out of the
  // courier's interface far more often than it is typed. An empty result becomes
  // null — "cleared", not "the empty string". See `normalizeWaybill` for why the
  // transform refuses to touch a value that is not waybill-shaped.
  @Transform(normalizeWaybill)
  // TASK-426: the field carried only a 64-character cap, so `123` was a valid
  // waybill — and saving one on a SHIPPED order EMAILS THE CUSTOMER their tracking
  // notice, sending them to a Nova Poshta page that knows nothing about their
  // parcel. The rule counts DIGITS, not characters, for the same reason the phone
  // validators do: what arrives has been through a human's clipboard.
  @IsNovaPoshtaWaybill()
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
   * TASK-1973: the operator changes how an existing order is delivered —
   * pre-shipment only, under the same version check as the address. The server
   * rebuilds the delivery snapshot either way (TASK-1020), so a contact edit
   * never drops the method, the carrier, the pickup point or the «to be quoted»
   * flag.
   */
  @ApiPropertyOptional({
    description:
      'New delivery method (TASK-1973). Pre-shipment only (409 otherwise). A CHANGED method is ' +
      'checked like a new phone order: enabled in the settings, admitted by the admin ' +
      "delivery × payment matrix for the order's payment method, NOVA_POSHTA with " +
      'shippingAddress.npCityRef, PICKUP with an active pickupPointId. Re-prices the delivery: ' +
      'NOVA_POSHTA/PICKUP → 0 (NP is paid at the branch, B-13), COURIER → the flat price, ' +
      'OTHER → shippingCost or 0 «to be quoted». Total and balance are recomputed.',
    enum: DeliveryMethod,
    enumName: 'DeliveryMethod',
  })
  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @ApiPropertyOptional({
    description:
      'Pickup point for a PICKUP order (TASK-1806): required when switching to PICKUP; on a ' +
      'PICKUP order, a different id moves the order to that (active) point. Ignored otherwise.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('loose', { message: 'pickupPointId must be a valid UUID' })
  pickupPointId?: string;

  @ApiPropertyOptional({
    description:
      'Agreed shipping cost, UAH (0–100000, at most 2 decimals) — OTHER orders only ' +
      '(400 DELIVERY_SHIPPING_COST_NOT_ALLOWED otherwise), pre-shipment only (AD-ORD-86). ' +
      "Replaces the order's shipping cost, recomputes total and balance in one transaction, and " +
      'clears shippingAddress.shippingCostPending. Allowed on an order already paid: the balance ' +
      'then shows what is still owed.',
    example: 150,
    minimum: 0,
    maximum: 100000,
  })
  @ValidateIf((o: UpdateOrderDetailsDto) => o.shippingCost !== undefined)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100000)
  shippingCost?: number;

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
