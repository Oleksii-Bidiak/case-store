import { ApiProperty } from '@nestjs/swagger';
import { AttributeType } from '@prisma/client';
import { MAX_HIGHLIGHTS } from '../product.constants';

/**
 * Raw spec-value row (a ProductAttributeValue joined with its definition) as
 * loaded by the repository. Shared input shape for {@link buildProductSpecs}.
 */
export interface SpecValueRow {
  value: string;
  definition: {
    key: string;
    label: string;
    type: AttributeType;
    unit: string | null;
    isFilterable: boolean;
    sortOrder: number;
  };
}

/**
 * A hydrated, ready-to-render structured specification for a product (TASK-191).
 *
 * Built by joining a {@link ProductAttributeValue} with its
 * {@link AttributeDefinition} template, so the storefront PDP can render the
 * "Характеристики" table (and the "Коротко про товар" highlights strip) with no
 * further lookups. Deliberately named `spec` (not `attribute`) to avoid clashing
 * with `Product.attributes` (the variant-axis JSON) — see plan 112.
 */
export class ProductSpecEntity {
  @ApiProperty({ description: 'Stable definition key', example: 'material' })
  key!: string;

  @ApiProperty({ description: 'Human-readable label', example: 'Матеріал' })
  label!: string;

  @ApiProperty({
    description: 'Value data type (drives client formatting)',
    enum: AttributeType,
    example: AttributeType.SELECT,
  })
  type!: AttributeType;

  @ApiProperty({
    description: 'Optional unit suffix',
    example: 'W',
    type: String,
    nullable: true,
    required: false,
  })
  unit!: string | null;

  @ApiProperty({ description: 'The value in canonical string form', example: 'Силікон' })
  value!: string;

  @ApiProperty({
    description: 'Whether this spec is a catalog facet / PDP highlight',
    example: true,
  })
  isFilterable!: boolean;

  /**
   * Build a ProductSpecEntity from a Prisma ProductAttributeValue joined with
   * its AttributeDefinition. Rows whose definition failed to join are skipped by
   * the caller.
   */
  static fromPrisma(row: SpecValueRow): ProductSpecEntity {
    const entity = new ProductSpecEntity();
    entity.key = row.definition.key;
    entity.label = row.definition.label;
    entity.type = row.definition.type;
    entity.unit = row.definition.unit;
    entity.value = row.value;
    entity.isFilterable = row.definition.isFilterable;
    return entity;
  }
}

/**
 * Build the `specs` list and the `highlights` subset from a product's raw
 * spec-value rows (TASK-191). `specs` is ordered by each definition's
 * `sortOrder` then `label`; `highlights` is the `isFilterable` subset capped at
 * {@link MAX_HIGHLIGHTS} — the "Коротко про товар" grid. Returns empty arrays
 * when a product has no spec values, so callers render their empty states.
 */
export function buildProductSpecs(rows: SpecValueRow[] | undefined | null): {
  specs: ProductSpecEntity[];
  highlights: ProductSpecEntity[];
} {
  if (!rows || rows.length === 0) {
    return { specs: [], highlights: [] };
  }
  const ordered = [...rows].sort(
    (a, b) =>
      a.definition.sortOrder - b.definition.sortOrder ||
      a.definition.label.localeCompare(b.definition.label),
  );
  const specs = ordered.map((row) => ProductSpecEntity.fromPrisma(row));
  const highlights = specs.filter((spec) => spec.isFilterable).slice(0, MAX_HIGHLIGHTS);
  return { specs, highlights };
}
