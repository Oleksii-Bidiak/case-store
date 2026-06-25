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
 * DTO for creating a product group (admin-only). A group links sibling product
 * positions and declares the ordered attribute axes the PDP renders (TASK-142).
 */
export class CreateProductGroupDto {
  @ApiProperty({ description: 'Group name', example: 'Tempered Glass for iPhone 15' })
  @IsString()
  @MinLength(1, { message: 'Group name is required' })
  @MaxLength(255, { message: 'Group name must be at most 255 characters' })
  name!: string;

  @ApiProperty({
    description: 'Ordered attribute axes for the group',
    type: [ProductGroupAxisInputDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductGroupAxisInputDto)
  axes?: ProductGroupAxisInputDto[];

  @ApiProperty({
    description: 'Whether the group is active',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
