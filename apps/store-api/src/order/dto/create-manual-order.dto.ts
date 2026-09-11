import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
      'nobody can be reached about is not a sale.',
    type: GuestContactDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestContactDto)
  contact?: GuestContactDto;

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
