import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

/** A single image's new ordering + primary flag. */
export class ReorderImageDto {
  @ApiProperty({ description: 'Image ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('loose')
  id!: string;

  @ApiProperty({ description: 'New display sort order (0-based)', example: 0 })
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @ApiProperty({ description: 'Whether this image is the primary (cover) image', example: true })
  @IsBoolean()
  isPrimary!: boolean;
}

/** Full reorder payload for a product's image set. */
export class ReorderImagesDto {
  @ApiProperty({ type: [ReorderImageDto], description: 'Ordering for every image of the product' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderImageDto)
  items!: ReorderImageDto[];
}
