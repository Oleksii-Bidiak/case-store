import { ProductImageEntity } from './product-image.entity';
import { ProductBrandEntity } from './product-brand.entity';
import { ProductCompatibleDeviceEntity } from './product-compatible-device.entity';
import { ProductSpecEntity, buildProductSpecs, type SpecValueRow } from './product-spec.entity';

/**
 * The repository row both product entities are built from (TASK-814).
 *
 * {@link ProductEntity} (admin) and {@link PublicProductEntity} (storefront)
 * used to restate this shape — and the copy of the fields onto the entity — each
 * on its own, and the two had already drifted: the admin input silently did not
 * declare `primaryImage.blurDataUrl`. The shape and the mapping now live here
 * once; each entity only adds what is genuinely its own (the admin's reserved /
 * physical figures, the storefront's derived availability and variant summary).
 */
export interface ProductSource {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: { toString(): string };
  compareAtPrice: { toString(): string } | null;
  sku: string | null;
  /** Raw free-to-sell stock. The admin exposes it; the storefront only derives booleans from it. */
  stock: number;
  categoryId: string;
  groupId?: string | null;
  brand?: Parameters<typeof ProductBrandEntity.fromPrisma>[0] | null;
  attributes?: unknown;
  positionOrder?: number;
  isActive: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string[];
  ogImage?: string | null;
  createdAt: Date;
  updatedAt: Date;
  ratingAverage?: number | null;
  ratingCount?: number;
  primaryImage?: Parameters<typeof ProductImageEntity.fromPrisma>[0] | null;
  compatibleDeviceModels?: Array<Parameters<typeof ProductCompatibleDeviceEntity.fromSummary>[0]>;
  /**
   * Structured spec-value rows (joined with their definition), TASK-191. Absent
   * on list responses — specs/highlights are then empty arrays.
   */
  specValues?: SpecValueRow[];
}

/** The fields both product entities expose with the same meaning and the same value. */
export interface SharedProductFields {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  categoryId: string;
  groupId: string | null;
  brand: ProductBrandEntity | null;
  attributes: Record<string, string>;
  positionOrder: number;
  isActive: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  ogImage: string | null;
  createdAt: Date;
  updatedAt: Date;
  ratingAverage: number | null;
  ratingCount: number;
  primaryImage: ProductImageEntity | null;
  compatibleDeviceModels: ProductCompatibleDeviceEntity[];
  specs: ProductSpecEntity[];
  highlights: ProductSpecEntity[];
}

/**
 * Map the shared fields of a product row. Decimal fields become strings (no
 * float precision loss in JSON), the rating is rounded to one decimal, and the
 * optional relations fall back to their empty values.
 */
export function mapSharedProductFields(product: ProductSource): SharedProductFields {
  const { specs, highlights } = buildProductSpecs(product.specValues);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price.toString(),
    compareAtPrice: product.compareAtPrice ? product.compareAtPrice.toString() : null,
    sku: product.sku,
    categoryId: product.categoryId,
    groupId: product.groupId ?? null,
    brand: product.brand ? ProductBrandEntity.fromPrisma(product.brand) : null,
    attributes: (product.attributes as Record<string, string> | null) ?? {},
    positionOrder: product.positionOrder ?? 0,
    isActive: product.isActive,
    metaTitle: product.metaTitle ?? null,
    metaDescription: product.metaDescription ?? null,
    keywords: product.keywords ?? [],
    ogImage: product.ogImage ?? null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    ratingAverage:
      product.ratingAverage != null ? Math.round(product.ratingAverage * 10) / 10 : null,
    ratingCount: product.ratingCount ?? 0,
    primaryImage: product.primaryImage ? ProductImageEntity.fromPrisma(product.primaryImage) : null,
    compatibleDeviceModels: (product.compatibleDeviceModels ?? []).map((m) =>
      ProductCompatibleDeviceEntity.fromSummary(m),
    ),
    specs,
    highlights,
  };
}
