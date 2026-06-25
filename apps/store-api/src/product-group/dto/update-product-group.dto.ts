import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductGroupAxisInputDto } from './product-group-axis-input.dto';

/**
 * DTO for updating a product group (admin-only). Only provided fields change.
 * When `axes` is provided it replaces the group's axes wholesale.
 */
export class UpdateProductGroupDto {
  @ApiProperty({
    description: 'Group name',
    example: 'Tempered Glass for iPhone 15',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Group name cannot be empty' })
  @MaxLength(255, { message: 'Group name must be at most 255 characters' })
  name?: string;

  @ApiProperty({
    description: 'Ordered attribute axes (replaces the existing axes when provided)',
    type: [ProductGroupAxisInputDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductGroupAxisInputDto)
  axes?: ProductGroupAxisInputDto[];

  @ApiProperty({ description: 'Whether the group is active', example: true, required: false })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
