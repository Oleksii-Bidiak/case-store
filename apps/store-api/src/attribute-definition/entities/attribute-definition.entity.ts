import { ApiProperty } from '@nestjs/swagger';
import { AttributeType } from '@prisma/client';

/**
 * Domain entity for a per-category structured-spec template (TASK-191).
 *
 * A clean domain entity — not the Prisma model. Returned by the
 * attribute-definition admin endpoints and reused inside the product specs
 * editor to render typed inputs. `options` is normalized to a string array
 * (empty when the definition is not a SELECT).
 */
export class AttributeDefinitionEntity {
  @ApiProperty({
    description: 'Definition unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Category this template is declared on',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  categoryId!: string;

  @ApiProperty({
    description: 'Stable, filter-safe key (kebab or camel, no spaces)',
    example: 'material',
  })
  key!: string;

  @ApiProperty({ description: 'Human-readable label', example: 'Матеріал' })
  label!: string;

  @ApiProperty({
    description: 'Value data type',
    enum: AttributeType,
    example: AttributeType.SELECT,
  })
  type!: AttributeType;

  @ApiProperty({
    description: 'Optional unit suffix appended on render',
    example: 'W',
    type: String,
    nullable: true,
    required: false,
  })
  unit!: string | null;

  @ApiProperty({
    description: 'Allowed values for a SELECT definition (empty otherwise)',
    example: ['Силікон', 'Шкіра'],
    type: [String],
  })
  options!: string[];

  @ApiProperty({
    description: 'Whether this spec is surfaced as a catalog facet + PDP highlight',
    example: true,
  })
  isFilterable!: boolean;

  @ApiProperty({ description: 'Display sort order (lower = first)', example: 0 })
  sortOrder!: number;

  /**
   * Create an AttributeDefinitionEntity from a Prisma AttributeDefinition model.
   * Normalizes the `options` JSON column into a string array.
   */
  static fromPrisma(def: {
    id: string;
    categoryId: string;
    key: string;
    label: string;
    type: AttributeType;
    unit: string | null;
    options: unknown;
    isFilterable: boolean;
    sortOrder: number;
  }): AttributeDefinitionEntity {
    const entity = new AttributeDefinitionEntity();
    entity.id = def.id;
    entity.categoryId = def.categoryId;
    entity.key = def.key;
    entity.label = def.label;
    entity.type = def.type;
    entity.unit = def.unit;
    entity.options = Array.isArray(def.options)
      ? (def.options as unknown[]).filter((o): o is string => typeof o === 'string')
      : [];
    entity.isFilterable = def.isFilterable;
    entity.sortOrder = def.sortOrder;
    return entity;
  }
}
