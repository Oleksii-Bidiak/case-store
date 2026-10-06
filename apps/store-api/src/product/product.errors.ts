import { ConflictException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes for product failures the admin panel has to
 * tell apart (TASK-656).
 *
 * These travel to the client in the HTTP error envelope's `error` field (see
 * {@link HttpExceptionFilter}, which surfaces ONLY `resp.error` and `resp.message` —
 * any extra property on the thrown body is silently discarded). So the code itself
 * has to say WHICH unique field is taken: the restore dialog keys off it to show the
 * «Нова адреса» field, the «Новий артикул» field, or both. Keep the values stable.
 */
export const ProductErrorCode = {
  /** Restoring would put the product back on a slug a live product now holds. */
  SLUG_CONFLICT: 'PRODUCT_SLUG_CONFLICT',
  /** Restoring would put the product back on a SKU a live product now holds. */
  SKU_CONFLICT: 'PRODUCT_SKU_CONFLICT',
  /** Both the slug and the SKU are held by live products. */
  SLUG_SKU_CONFLICT: 'PRODUCT_SLUG_SKU_CONFLICT',
} as const;

export type ProductErrorCode = (typeof ProductErrorCode)[keyof typeof ProductErrorCode];

/** Which of a product's unique columns a write collided on. */
export interface ProductUniqueClash {
  slug: boolean;
  sku: boolean;
}

/**
 * A restore write lost the race for a unique slot (TASK-656): the service checked the
 * slug/SKU were free, and another product took one of them before the update landed,
 * so Postgres answered with a unique violation (Prisma `P2002`).
 *
 * Thrown by `ProductRepository.restore`, which is the only layer that sees Prisma's
 * error; the service maps it onto the 409 below. `clash` is `null` when the violated
 * constraint could not be identified from the error metadata — the service then
 * re-reads which slot is taken instead of guessing.
 */
export class ProductRestoreConflictError extends Error {
  constructor(readonly clash: ProductUniqueClash | null) {
    super('A product with this slug or SKU already exists');
    this.name = 'ProductRestoreConflictError';
  }
}

/**
 * Identify the unique column(s) a Prisma `P2002` names. Prisma has spelled this two
 * ways: `meta.target` (column names, or the constraint name such as
 * `products_slug_key`) and, through a driver adapter, `meta.driverAdapterError.cause
 * .constraint` (`fields` or `index`). Both are read; `null` when neither names a
 * column this module knows.
 */
export function uniqueClashFromPrismaMeta(meta: unknown): ProductUniqueClash | null {
  const names: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') {
      names.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(collect);
    }
  };

  if (meta && typeof meta === 'object') {
    const record = meta as Record<string, unknown>;
    collect(record.target);
    const adapterError = record.driverAdapterError as
      { cause?: { constraint?: { fields?: unknown; index?: unknown } } } | undefined;
    const constraint = adapterError?.cause?.constraint;
    collect(constraint?.fields);
    collect(constraint?.index);
  }

  const lowered = names.map((name) => name.toLowerCase());
  const clash: ProductUniqueClash = {
    slug: lowered.some((name) => name.includes('slug')),
    sku: lowered.some((name) => name.includes('sku')),
  };
  return clash.slug || clash.sku ? clash : null;
}

/** The code that names exactly the fields in `clash`, or `null` when nothing clashed. */
export function restoreConflictCode(clash: ProductUniqueClash): ProductErrorCode | null {
  if (clash.slug && clash.sku) return ProductErrorCode.SLUG_SKU_CONFLICT;
  if (clash.slug) return ProductErrorCode.SLUG_CONFLICT;
  if (clash.sku) return ProductErrorCode.SKU_CONFLICT;
  return null;
}

const CONFLICT_MESSAGES: Record<ProductErrorCode, string> = {
  [ProductErrorCode.SLUG_CONFLICT]: 'Another product already uses this slug — choose a new one',
  [ProductErrorCode.SKU_CONFLICT]: 'Another product already uses this SKU — choose a new one',
  [ProductErrorCode.SLUG_SKU_CONFLICT]:
    'Other products already use this slug and this SKU — choose new ones',
};

/** Build a 409 Conflict carrying a stable product error code. */
export function conflictProduct(code: ProductErrorCode): ConflictException {
  return new ConflictException({ error: code, message: CONFLICT_MESSAGES[code] });
}
