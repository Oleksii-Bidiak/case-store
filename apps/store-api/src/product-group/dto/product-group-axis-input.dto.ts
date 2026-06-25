import { IsString, IsOptional, IsInt, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * One attribute axis of a product group (e.g. "color", "pack"). Axes are
 * replaced wholesale on update, so each carries its own display order.
 */
export class ProductGroupAxisInputDto {
  @ApiProperty({ description: 'Axis name', example: 'color' })
  @IsString()
  @MaxLength(50, { message: 'Axis name must be at most 50 characters' })
  name!: string;

  @ApiProperty({
    description: 'Display order of the axis',
    example: 0,
    required: false,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sort order must be an integer' })
  @Min(0, { message: 'Sort order cannot be negative' })
  sortOrder?: number;
}
