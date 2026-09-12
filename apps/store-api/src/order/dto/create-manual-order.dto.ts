import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { AddressDto } from './address.dto';
import { GuestContactDto } from './guest-contact.dto';

/**
 * Contact details for an order the OPERATOR takes over the phone (TASK-426).
 *
 * ── What differs from {@link GuestContactDto}, and only that ──────────────────
 * EMAIL IS OPTIONAL HERE. Everything else — the phone rule, the name rule, the
 * normalisation — is inherited, so the two paths cannot drift apart.
 *
 * A self-service guest checkout genuinely needs the address: the confirmation
 * letter carries the order-status link, which is the buyer's ONLY way back to
 * their order. An operator taking an order by phone has the customer on the line
 * and often has no email at all, and demanding one produced exactly the outcome
 * the field was meant to prevent — a made-up address, or no order. The phone
 * number is what the courier dials and is therefore the required contact here.
 *
 * ── Why a subclass rather than loosening the public DTO ────────────────────────
 * `GuestContactDto` is the PUBLIC guest-checkout contract. Making `email`
 * optional there would let a shopper place an order we can never send a status
 * link for, silently, and the storefront could not even tell them why their
 * confirmation never arrived. So the manual path narrows its own copy instead.
 *
 * ── Why the property type still says `string` ──────────────────────────────────
 * `ManualOrderParams.guest` (`order/order.types.ts`) is a `GuestContact`, whose
 * `email` is `string` because the guest-CHECKOUT path truly requires one. At
 * runtime this field may be absent; `Order.guestEmail` is nullable
 * (`guest_email String?`), so Prisma writes NULL and nothing downstream reads it
 * for a manual order (no confirmation mail is enqueued for one). Widening
 * `GuestContact.email` instead would push `string | undefined` into the
 * guest-checkout code that hashes the access token and addresses the letter,
 * where the email is not optional at all.
 */
export class ManualOrderContactDto extends GuestContactDto {
  @ApiProperty({
    description:
      'Email, if the customer has one. OPTIONAL on an operator-created order (TASK-426) — ' +
      'unlike guest checkout, where it carries the order-status link. Validated when present.',
    required: false,
    example: 'olena@example.com',
    maxLength: 254,
  })
  // An operator's empty field arrives as `''`, which @IsOptional does NOT skip
  // (it skips null/undefined only) — so `''` would fail @IsEmail and 400 an order
  // whose customer simply has no email. Mapped to undefined, i.e. "not given".
  // The inherited trim/lowercase transform also runs; both are order-independent.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  email!: string;
}

/** One line of an operator-created order (TASK-341). */
export class ManualOrderItemDto {
  @ApiProperty({ description: 'Product to sell', format: 'uuid' })
  @IsUUID('loose')
  productId!: string;

  @ApiProperty({ description: 'How many units', minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * An order the operator places on the customer's behalf — a phone order
 * (TASK-341).
 *
 * There is deliberately NO price field. An operator-created order is still a sale
 * at the shop's price; accepting a price here would make every discount a matter
 * of whoever happens to be on the phone, and would leave no record that a
 * discount was even given.
 */
export class CreateManualOrderDto {
  @ApiProperty({
    description:
      'Existing customer account this order belongs to. Omit for a walk-in, and supply ' +
      '`contact` instead.',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('loose')
  userId?: string;

  @ApiProperty({
    description:
      'Contact details when there is no account. Required unless `userId` is given — an order ' +
      'nobody can be reached about is not a sale. Phone is required, email optional ' +
      '(TASK-426): see ManualOrderContactDto.',
    type: ManualOrderContactDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ManualOrderContactDto)
  contact?: ManualOrderContactDto;

  @ApiProperty({ description: 'Where the parcel goes', type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress!: AddressDto;

  @ApiProperty({ description: 'Lines to sell', type: [ManualOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'An order must contain at least one item' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ManualOrderItemDto)
  items!: ManualOrderItemDto[];

  @ApiProperty({
    description: 'How the customer will pay',
    enum: PaymentMethod,
    required: false,
    default: PaymentMethod.ON_DELIVERY,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ description: 'Notes shown to the customer', required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ description: 'Operator-only notes', required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
