import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One order line the customer wants to send back (TASK-340). */
export class ReturnItemDto {
  @ApiProperty({ description: 'Order line being returned', format: 'uuid' })
  @IsUUID()
  orderItemId!: string;

  @ApiProperty({
    description:
      'How many units of that line are coming back. Separate from the line quantity because ' +
      'a customer who bought three may return one.',
    minimum: 1,
    example: 1,
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * A customer's request to send goods back (TASK-340).
 *
 * Ukrainian law gives 14 days to return, and until now the system had no record
 * of a return at all — `REFUNDED` on an order was a label with no money and no
 * stock behind it.
 */
export class CreateReturnDto {
  @ApiProperty({
    description: 'Why the customer is returning, in their own words',
    required: false,
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiProperty({
    description: 'The lines coming back, with quantities',
    type: [ReturnItemDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'A return must name at least one item' })
  // A return cannot contain more lines than an order can — bounded so a forged
  // payload cannot turn one request into thousands of nested writes.
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}
