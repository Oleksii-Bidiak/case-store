import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for full-replacing a category's OWN add-on template (admin-only, TASK-174).
 *
 * An EMPTY array is meaningful, not a validation error: it clears the category's
 * own template, restoring pure inheritance from its nearest ancestor.
 */
export class SetCategoryTemplateDto {
  @ApiProperty({
    description:
      "The complete set of add-on services in this category's own template. Empty = clear the own template and fall back to inheritance.",
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String],
  })
  @IsArray({ message: 'addonServiceIds must be an array' })
  @IsUUID('all', { each: true, message: 'Each add-on service id must be a valid UUID' })
  addonServiceIds!: string[];
}
