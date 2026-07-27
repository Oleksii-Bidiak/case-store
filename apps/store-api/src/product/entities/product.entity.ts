import { ApiProperty } from '@nestjs/swagger';
import { ProductImageEntity } from './product-image.entity';
import { ProductBrandEntity } from './product-brand.entity';
import { ProductCompatibleDeviceEntity } from './product-compatible-device.entity';
import { ProductSpecEntity, buildProductSpecs, type SpecValueRow } from './product-spec.entity';

/**
 * Domain entity representing a product.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by ProductService methods and contains only
 * the data that should be exposed to the client.
 *
 * Decimal fields (price, compareAtPrice) are converted to strings
 * to avoid floating-point precision issues in JSON serialization.
 * Relation fields (variants, images, reviews, orderItems, cartItems)
 * are EXCLUDED from the base entity.
 */
export class ProductEntity {
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
    description: 'Available (free-to-sell) stock quantity for this position',
    example: 150,
  })
  stock!: number;

  @ApiProperty({
    description:
      'Reserved quantity — units tied up in unshipped (PENDING/CONFIRMED/PROCESSING) ' +
      'orders, derived on read (TASK-254). Admin-only informational figure; `stock` ' +
      'already had these units subtracted at order creation. Optional on the input, ' +
      'always present on the output (defaults to 0 on mutation-echo reads).',
    example: 5,
  })
  reservedQty!: number;

  @ApiProperty({
    description:
      'Physical on-shelf quantity = stock + reservedQty (derived arithmetic, TASK-254). ' +
      'Admin-only informational figure. Always present on the output.',
    example: 155,
  })
  physicalQty!: number;

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
    description: 'Device models this position is compatible with (TASK-190)',
    type: [ProductCompatibleDeviceEntity],
    required: false,
  })
  compatibleDeviceModels!: ProductCompatibleDeviceEntity[];

  @ApiProperty({
    description: 'Structured specifications (TASK-191). Empty unless the caller hydrated them.',
    type: [ProductSpecEntity],
  })
  specs!: ProductSpecEntity[];

  @ApiProperty({
    description: 'The isFilterable subset of specs (capped) — PDP highlights strip.',
    type: [ProductSpecEntity],
  })
  highlights!: ProductSpecEntity[];

  /**
   * Create a ProductEntity from a Prisma Product model.
   * Converts Decimal fields to strings and strips out relation fields.
   *
   * `ratingAverage` / `ratingCount` are optional: list and detail queries
   * enrich the product with review aggregates, while admin/mutation paths
   * (create, update, findById) omit them and default to "no reviews".
   *
   * `reservedQty` follows the same optional-input/always-present-output contract
   * (TASK-254): admin list/detail/preview reads pass the derived aggregate,
   * while mutation-echo reads (create/update/activate/deactivate/delete) omit it
   * and default to 0 (physicalQty = stock) — accurate in the common case and
   * self-healing on the next list/detail read, exactly like ratingAverage.
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
    reservedQty?: number;
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
      sortOrder: number;
      isPrimary: boolean;
    } | null;
    compatibleDeviceModels?: Array<{
      id: string;
      name: string;
      slug: string;
      brandName: string;
    }>;
    /** Structured spec-value rows (joined with their definition), TASK-191. */
    specValues?: SpecValueRow[];
  }): ProductEntity {
    const entity = new ProductEntity();
    entity.id = product.id;
    entity.name = product.name;
    entity.slug = product.slug;
    entity.description = product.description;
    entity.price = product.price.toString();
    entity.compareAtPrice = product.compareAtPrice ? product.compareAtPrice.toString() : null;
    entity.sku = product.sku;
    entity.stock = product.stock;
    entity.reservedQty = product.reservedQty ?? 0;
    entity.physicalQty = entity.stock + entity.reservedQty;
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
    entity.compatibleDeviceModels = (product.compatibleDeviceModels ?? []).map((m) =>
      ProductCompatibleDeviceEntity.fromSummary(m),
    );
    const { specs, highlights } = buildProductSpecs(product.specValues);
    entity.specs = specs;
    entity.highlights = highlights;
    return entity;
  }
}
