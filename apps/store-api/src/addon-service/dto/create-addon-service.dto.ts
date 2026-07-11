import { IsString, IsOptional, IsBoolean, IsNumber, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for creating an add-on service (admin-only, TASK-174).
 *
 * `price` is a plain number on the wire (mirrors `CreateProductDto.price`) and
 * is persisted as a `Decimal(10,2)`. Unlike a product, an add-on may legitimately
 * be free (`0`) — e.g. a complimentary trade-in valuation — so the minimum is 0,
 * not 0.01.
 */
export class CreateAddonServiceDto {
  @ApiProperty({
    description: 'Add-on service name',
    example: 'Гарантійний сертифікат (24 міс.)',
  })
  @IsString()
  @MaxLength(255, { message: 'Name must be at most 255 characters' })
  name!: string;

  @ApiProperty({
    description: 'What the service covers — shown to the customer in the cart',
    example: 'Продовжена гарантія на 24 місяці.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must be at most 2000 characters' })
  description?: string;

  @ApiProperty({ description: 'Price (may be 0 for a free service)', example: 499 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0, { message: 'Price must not be negative' })
  price!: number;

  @ApiProperty({
    description: 'Whether the service is offered (reversible visibility toggle)',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
