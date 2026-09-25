import { Prisma } from '@prisma/client';

/**
 * The one rule for «may a shopper see this product» (TASK-781/782).
 *
 * A product is publicly visible when it is on sale (`isActive`), not
 * soft-deleted, AND its category is active — deactivating a category withdraws
 * every product in it (TASK-297). Every public read of a product row — listing,
 * PDP, cards, variant siblings, search, addon resolution, wishlist — goes
 * through this predicate, so a hidden product answers exactly like a
 * nonexistent one (404 / absent), never with its prices.
 *
 * Before this constant each reader spelled the rule out inline, and two of them
 * (the variant-group siblings) quietly dropped the category half: colour dots
 * led to a 404 and «від X ₴» was priced from a position nobody could buy.
 * A second spelling is a spelling that drifts — import this instead.
 *
 * Admin reads (preview, CRUD, SEO health) deliberately do NOT use it.
 */
export const PUBLIC_PRODUCT_WHERE = {
  isActive: true,
  deletedAt: null,
  category: { isActive: true },
} as const satisfies Prisma.ProductWhereInput;

/** Table aliases a raw query gave `products` and its `categories` join. */
export interface PublicProductSqlAliases {
  product: string;
  category: string;
}

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * One SQL condition per key of {@link PUBLIC_PRODUCT_WHERE}. The mapped type is
 * the guard: a key added to the Prisma predicate without its SQL half here, or
 * a half here with no key there, fails `tsc` — the twin cannot silently lag.
 * Equality on real rows is proven in `test/compat-landing-pages.int-spec.ts`.
 */
const PUBLIC_PRODUCT_SQL_TWIN = {
  isActive: ({ product }) => `${product}.is_active = true`,
  deletedAt: ({ product }) => `${product}.deleted_at IS NULL`,
  category: ({ category }) => `${category}.is_active = true`,
} satisfies {
  [K in keyof typeof PUBLIC_PRODUCT_WHERE]: (aliases: PublicProductSqlAliases) => string;
};

/**
 * {@link PUBLIC_PRODUCT_WHERE} for a raw aggregate Prisma cannot express (a
 * `GROUP BY` across two tables — TASK-711). The caller must join `categories`
 * on `products.category_id` under the `category` alias. Aliases are spliced
 * raw, so anything but a plain lowercase identifier is refused.
 */
export function publicProductSql(aliases: PublicProductSqlAliases): Prisma.Sql {
  for (const alias of [aliases.product, aliases.category]) {
    if (!SQL_IDENTIFIER.test(alias)) {
      throw new Error(`publicProductSql: "${alias}" is not a plain SQL identifier`);
    }
  }
  return Prisma.raw(
    Object.values(PUBLIC_PRODUCT_SQL_TWIN)
      .map((condition) => condition(aliases))
      .join(' AND '),
  );
}

/**
 * The same rule for a row already in memory. The row must carry `isActive`,
 * `deletedAt` and its category's `isActive`; a missing category counts as
 * hidden, because a product with no loaded category cannot prove it is on sale.
 */
export function isPubliclyVisible(product: {
  isActive: boolean;
  deletedAt: Date | null;
  category?: { isActive: boolean } | null;
}): boolean {
  return product.isActive && product.deletedAt === null && product.category?.isActive === true;
}
