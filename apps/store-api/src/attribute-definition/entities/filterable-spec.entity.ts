import { ApiProperty } from '@nestjs/swagger';
import { AttributeDefinitionEntity } from './attribute-definition.entity';

/**
 * One offered value of a catalogue facet, with the number of products behind it
 * (TASK-489, owner decision B-10 §4 — «Силікон (12)»).
 *
 * `count` is computed over the slice the listing would currently return with
 * every OTHER active filter applied and this value's own facet excluded, so
 * ticking it lands on a page of exactly `count` products. A value no product in
 * the slice carries is not emitted at all — there is no zero here to render.
 */
export class FacetValueCountEntity {
  @ApiProperty({ description: 'The stored spec value, as it appears in `?specs=`', example: 'TPU' })
  value!: string;

  @ApiProperty({
    description: 'Products in the current slice carrying this value (never 0)',
    example: 12,
  })
  count!: number;
}

/**
 * One catalog facet for a category (TASK-191): an `isFilterable` effective
 * definition plus the values currently in use among products in the category's
 * subtree, each with its product count (TASK-489).
 */
export class FilterableSpecEntity {
  @ApiProperty({ type: AttributeDefinitionEntity })
  definition!: AttributeDefinitionEntity;

  @ApiProperty({
    description:
      'Values in use for this spec within the current catalogue slice, each with ' +
      'the number of products behind it. Ascending by value; never empty and never ' +
      'a zero count.',
    type: [FacetValueCountEntity],
  })
  values!: FacetValueCountEntity[];
}
