import { ApiProperty } from '@nestjs/swagger';
import { ProductImageEntity } from './product-image.entity';
import { ProductBrandEntity } from './product-brand.entity';
import { ProductCompatibleDeviceEntity } from './product-compatible-device.entity';
import {
  ProductVariantSummaryEntity,
  type VariantSiblingInput,
} from './product-variant-summary.entity';
import { ProductSpecEntity, buildProductSpecs, type SpecValueRow } from './product-spec.entity';
import { LOW_STOCK_THRESHOLD } from '../product.constants';

/**
 * Public-facing variant of {@link ProductEntity} for the storefront.
 *
 * It carries every field {@link ProductEntity} exposes **except** the raw
 * `stock` integer, which would leak internal inventory levels. In its place two
 * derived booleans are exposed:
 *
 *   - `inStock`  — `stock > 0`
 *   - `lowStock` — `0 < stock <= {@link LOW_STOCK_THRESHOLD}`
 *
 * `fromPrisma` still *receives* `stock` (to compute the booleans) but never
 * assigns it to the returned object, so it never reaches the JSON serializer.
 *
 * Used by `ProductService.findAll` (`GET /products`) and `findBySlug`
 * (`GET /products/:slug`). The admin path (`findById`, `GET /products/admin/:id`)
 * keeps the full {@link ProductEntity} with raw `stock`.
 */
export class PublicProductEntity {
  @ApiProperty({
    description: 'Product unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'iPhone 15 Pro Case — Clear MagSafe' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'iphone-15-pro-case-clear-magsafe' })
  slug!: string;

  @ApiProperty({
    description: 'Product description (markdown)',
    example: 'Premium clear case...',
    type: String,
    nullable: true,
    required: false,
  })
  description!: string | null;

  @ApiProperty({
    description: 'Product price as string (avoids float precision)',
    example: '29.99',
  })
  price!: string;

  @ApiProperty({
    description: 'Original price for discount display',
    example: '39.99',
    type: String,
    nullable: true,
    required: false,
  })
  compareAtPrice!: string | null;

  @ApiProperty({
    description: 'Stock Keeping Unit',
    example: 'IP15-PRO-CASE-CLR',
    type: String,
    nullable: true,
    required: false,
  })
  sku!: string | null;

  @ApiProperty({
    description: 'Whether the position has any stock available',
    example: true,
  })
  inStock!: boolean;

  @ApiProperty({
    description: 'Whether the position is running low (in stock but at or below the low threshold)',
    example: false,
  })
  lowStock!: boolean;

  @ApiProperty({
    description: 'Category ID the product belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  categoryId!: string;

  @ApiProperty({
    description: 'Group this position belongs to (siblings share a group), or null when standalone',
    example: '550e8400-e29b-41d4-a716-446655440000',
    type: String,
    nullable: true,
    required: false,
  })
  groupId!: string | null;

  @ApiProperty({
    description: 'Manufacturer / brand summary, or null when the product has no brand',
    type: ProductBrandEntity,
    nullable: true,
    required: false,
  })
  brand!: ProductBrandEntity | null;

  @ApiProperty({
    description: 'Attribute values for this position within its group (keyed by group axis names)',
    example: { color: 'blue', pack: 'single' },
    // TASK-304: @nestjs/swagger 11 dropped the 'object' string literal from

    // ApiPropertyOptions['type']; the Object constructor emits the identical

    // "type": "object" in the OpenAPI schema.

    type: Object,
    additionalProperties: true,
    required: false,
  })
  attributes!: Record<string, string>;

  @ApiProperty({ description: 'Sort order of this position within its group', example: 0 })
  positionOrder!: number;

  @ApiProperty({ description: 'Whether the product is active', example: true })
  isActive!: boolean;

  @ApiProperty({
    description: 'SEO meta title override (falls back to name when empty)',
    example: 'iPhone 15 Pro Clear MagSafe Case | Store',
    type: String,
    nullable: true,
    required: false,
  })
  metaTitle!: string | null;

  @ApiProperty({
    description: 'SEO meta description override (falls back to the product description when empty)',
    example: 'Shop the clear MagSafe-compatible case for iPhone 15 Pro.',
    type: String,
    nullable: true,
    required: false,
  })
  metaDescription!: string | null;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    description: 'Average approved-review rating (1–5), or null when there are no reviews',
    example: 4.5,
    type: Number,
    nullable: true,
  })
  ratingAverage!: number | null;

  @ApiProperty({
    description: 'Number of approved reviews this product has',
    example: 128,
  })
  ratingCount!: number;

  @ApiProperty({
    description:
      'Primary (cover) image for list/card rendering, or null when the product has no images',
    type: ProductImageEntity,
    nullable: true,
    required: false,
  })
  primaryImage?: ProductImageEntity | null;

  @ApiProperty({
    description:
      'Compact variant summary for list cards: distinct colours, advertised "from" price, ' +
      'and the default (cheapest) variant for quick-add. For a standalone product this ' +
      'collapses to a single variant (the product itself).',
    type: ProductVariantSummaryEntity,
  })
  variantSummary!: ProductVariantSummaryEntity;

  @ApiProperty({
    description: 'Device models this position is compatible with (TASK-190)',
    type: [ProductCompatibleDeviceEntity],
    required: false,
  })
  compatibleDeviceModels!: ProductCompatibleDeviceEntity[];

  @ApiProperty({
    description:
      'Structured specifications (TASK-191): hydrated key/label/unit/value rows for the ' +
      'PDP "Характеристики" table. Empty on list responses and for products with no specs.',
    type: [ProductSpecEntity],
  })
  specs!: ProductSpecEntity[];

  @ApiProperty({
    description:
      'The isFilterable subset of specs (capped), for the PDP "Коротко про товар" highlights strip.',
    type: [ProductSpecEntity],
  })
  highlights!: ProductSpecEntity[];

  /**
   * Create a PublicProductEntity from a Prisma Product model. Accepts the same
   * shape as {@link ProductEntity.fromPrisma} (including `stock`), derives
   * `inStock`/`lowStock`, and deliberately omits `stock` from the result so the
   * raw inventory count never reaches a public response.
   */
  static fromPrisma(product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: { toString(): string };
    compareAtPrice: { toString(): string } | null;
    sku: string | null;
    stock: number;
    categoryId: string;
    groupId?: string | null;
    brand?: { id: string; name: string; slug: string; logo: string | null } | null;
    attributes?: unknown;
    positionOrder?: number;
    isActive: boolean;
    metaTitle?: string | null;
    metaDescription?: string | null;
    createdAt: Date;
    updatedAt: Date;
    ratingAverage?: number | null;
    ratingCount?: number;
    primaryImage?: {
      id: string;
      url: string;
      alt: string | null;
      blurDataUrl?: string | null;
      sortOrder: number;
      isPrimary: boolean;
    } | null;
    /**
     * Active sibling positions of this product's variant group (supplied by the
     * list query). When omitted or empty — e.g. on the detail path or a
     * standalone product — the summary derives from the product itself.
     */
    variantSiblings?: VariantSiblingInput[];
    compatibleDeviceModels?: Array<{
      id: string;
      name: string;
      slug: string;
      brandName: string;
    }>;
    /**
     * Structured spec-value rows (joined with their definition) for the detail
     * path (TASK-191). Absent on list responses — specs/highlights are then
     * empty arrays.
     */
    specValues?: SpecValueRow[];
  }): PublicProductEntity {
    const entity = new PublicProductEntity();
    entity.id = product.id;
    entity.name = product.name;
    entity.slug = product.slug;
    entity.description = product.description;
    entity.price = product.price.toString();
    entity.compareAtPrice = product.compareAtPrice ? product.compareAtPrice.toString() : null;
    entity.sku = product.sku;
    // Derive public availability signals from stock; the raw count is never
    // assigned to the entity, so it never reaches the JSON response.
    entity.inStock = product.stock > 0;
    entity.lowStock = product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;
    entity.categoryId = product.categoryId;
    entity.groupId = product.groupId ?? null;
    entity.brand = product.brand ? ProductBrandEntity.fromPrisma(product.brand) : null;
    entity.attributes = (product.attributes as Record<string, string> | null) ?? {};
    entity.positionOrder = product.positionOrder ?? 0;
    entity.isActive = product.isActive;
    entity.metaTitle = product.metaTitle ?? null;
    entity.metaDescription = product.metaDescription ?? null;
    entity.createdAt = product.createdAt;
    entity.updatedAt = product.updatedAt;
    entity.ratingAverage =
      product.ratingAverage != null ? Math.round(product.ratingAverage * 10) / 10 : null;
    entity.ratingCount = product.ratingCount ?? 0;
    entity.primaryImage = product.primaryImage
      ? ProductImageEntity.fromPrisma(product.primaryImage)
      : null;
    // Build the variant summary from the group's active siblings when provided
    // (list path); otherwise treat the product as its own sole variant.
    const siblings: VariantSiblingInput[] =
      product.variantSiblings && product.variantSiblings.length > 0
        ? product.variantSiblings
        : [
            {
              id: product.id,
              slug: product.slug,
              price: product.price,
              attributes: product.attributes,
              stock: product.stock,
              positionOrder: product.positionOrder ?? 0,
            },
          ];
    entity.variantSummary = ProductVariantSummaryEntity.fromSiblings(
      product.groupId ?? null,
      siblings,
    );
    entity.compatibleDeviceModels = (product.compatibleDeviceModels ?? []).map((m) =>
      ProductCompatibleDeviceEntity.fromSummary(m),
    );
    const { specs, highlights } = buildProductSpecs(product.specValues);
    entity.specs = specs;
    entity.highlights = highlights;
    return entity;
  }
}
