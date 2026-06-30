import { ApiProperty } from '@nestjs/swagger';

/**
 * Minimal sibling-position shape consumed by the variant-summary derivation.
 * Mirrors the columns the repository selects for a group's active positions.
 */
export interface VariantSiblingInput {
  id: string;
  slug: string;
  price: { toString(): string };
  attributes: unknown;
  stock: number;
  positionOrder: number;
}

/** Axis key (case-insensitive) that holds a position's colour value. */
const COLOR_AXIS_KEY = 'color';

/**
 * Read the colour value from a position's `attributes` JSON. The axis is keyed
 * by name (case-insensitive `color`); returns `null` when there is no colour
 * axis or the value is not a non-empty string.
 */
function readColor(attributes: unknown): string | null {
  if (attributes == null || typeof attributes !== 'object') {
    return null;
  }
  for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
    if (key.toLowerCase() === COLOR_AXIS_KEY && typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return null;
}

/**
 * One distinct colour option within a product's variant group, with a
 * representative buyable position so cards can render a swatch and (optionally)
 * deep-link to that colour.
 */
export class ProductVariantColorEntity {
  @ApiProperty({ description: 'Colour display value (axis value)', example: 'Navy Blue' })
  value!: string;

  @ApiProperty({ description: 'Representative position (product) id for this colour' })
  productId!: string;

  @ApiProperty({ description: 'Representative position slug', example: 'usb-c-cable-navy-blue' })
  slug!: string;

  @ApiProperty({ description: 'Whether the representative position has stock', example: true })
  inStock!: boolean;
}

/**
 * Compact variant summary surfaced on each product in the LIST response
 * (TASK-077). It lets a {@link ProductCard} render colour dots and a
 * "from {price}" advertised price plus a quick-add of the default (cheapest)
 * variant, WITHOUT a second request for the full product group.
 *
 * For a standalone product (no group) the summary collapses to a single
 * variant: the product itself.
 */
export class ProductVariantSummaryEntity {
  @ApiProperty({
    description: 'Group id the product belongs to, or null when standalone',
    type: String,
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  groupId!: string | null;

  @ApiProperty({
    description: 'Number of active sibling positions in the group (>= 1)',
    example: 3,
  })
  variantCount!: number;

  @ApiProperty({
    description: 'Cheapest (advertised "from") price across active positions, as string',
    example: '12.99',
  })
  priceFrom!: string;

  @ApiProperty({ description: 'Id of the default (cheapest) position for quick-add' })
  defaultVariantId!: string;

  @ApiProperty({
    description: 'Slug of the default (cheapest) position',
    example: 'usb-c-cable-1m',
  })
  defaultVariantSlug!: string;

  @ApiProperty({ description: 'Whether the default position is in stock', example: true })
  defaultInStock!: boolean;

  @ApiProperty({
    type: [ProductVariantColorEntity],
    description: 'Distinct colour options across the group, ordered by position order',
  })
  colors!: ProductVariantColorEntity[];

  /**
   * Build a summary from a group's active sibling positions. The caller passes
   * the positions that make up the variant group (for a standalone product this
   * is a one-element array carrying the product itself). The list is never
   * empty — callers fall back to the product-as-sole-variant.
   *
   * Determinism: positions are sorted by `positionOrder`, then price, then id,
   * so the default variant and colour ordering are stable across requests.
   */
  static fromSiblings(
    groupId: string | null,
    siblings: VariantSiblingInput[],
  ): ProductVariantSummaryEntity {
    const sorted = [...siblings].sort((a, b) => {
      if (a.positionOrder !== b.positionOrder) {
        return a.positionOrder - b.positionOrder;
      }
      const priceDiff = Number(a.price.toString()) - Number(b.price.toString());
      if (priceDiff !== 0) {
        return priceDiff;
      }
      return a.id.localeCompare(b.id);
    });

    // Default (advertised) variant = the cheapest position. `sorted` is ordered
    // by positionOrder first, so reduce by numeric price to find the minimum.
    const cheapest = sorted.reduce((min, cur) =>
      Number(cur.price.toString()) < Number(min.price.toString()) ? cur : min,
    );

    // Distinct colours in first-seen (positionOrder) order; the first position
    // of each colour is its representative swatch.
    const colors: ProductVariantColorEntity[] = [];
    const seen = new Set<string>();
    for (const position of sorted) {
      const value = readColor(position.attributes);
      if (value === null || seen.has(value)) {
        continue;
      }
      seen.add(value);
      const color = new ProductVariantColorEntity();
      color.value = value;
      color.productId = position.id;
      color.slug = position.slug;
      color.inStock = position.stock > 0;
      colors.push(color);
    }

    const entity = new ProductVariantSummaryEntity();
    entity.groupId = groupId;
    entity.variantCount = sorted.length;
    entity.priceFrom = cheapest.price.toString();
    entity.defaultVariantId = cheapest.id;
    entity.defaultVariantSlug = cheapest.slug;
    entity.defaultInStock = cheapest.stock > 0;
    entity.colors = colors;
    return entity;
  }
}
