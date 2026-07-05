import { ApiProperty } from '@nestjs/swagger';
import { AttributeDefinitionEntity } from './attribute-definition.entity';

/**
 * One catalog facet for a category (TASK-191): an `isFilterable` effective
 * definition plus the distinct values currently in use among products in the
 * category's subtree. The storefront renders a select control per entry.
 */
export class FilterableSpecEntity {
  @ApiProperty({ type: AttributeDefinitionEntity })
  definition!: AttributeDefinitionEntity;

  @ApiProperty({
    description: 'Distinct values in use for this spec within the category subtree',
    example: ['Силікон', 'Шкіра'],
    type: [String],
  })
  values!: string[];
}
