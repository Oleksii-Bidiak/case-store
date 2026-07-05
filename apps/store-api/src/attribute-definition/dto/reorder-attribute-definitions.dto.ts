import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for reordering a category's structured-spec templates (admin-only). The
 * body carries the definition ids in their new display order; the service
 * rewrites each definition's `sortOrder` to its index in this array.
 */
export class ReorderAttributeDefinitionsDto {
  @ApiProperty({
    description: 'Definition ids in the desired display order',
    example: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'orderedIds must not be empty' })
  @IsUUID(4, { each: true, message: 'Each id must be a valid UUID' })
  orderedIds!: string[];
}
