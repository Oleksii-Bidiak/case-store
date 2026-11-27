import { Prisma } from '@prisma/client';

/**
 * What keeps a product off the storefront's shelf until it is filled in (TASK-2573),
 * in the fixed order the admin checklist shows them.
 *
 * The admin's publish checklist (`features/product-publish-panel/model/readiness.ts`)
 * disables its button on the same four blocking checks, but that only guards one
 * button. Every write that can show a product — activate, the bulk status toggle,
 * create / update with `isActive: true` — judges it here, so a product with no
 * photo or a zero price cannot reach the storefront through any door.
 */
export const PUBLISH_BLOCKERS = ['name', 'category', 'price', 'photo'] as const;

export type PublishBlocker = (typeof PUBLISH_BLOCKERS)[number];

/** Everything the rule needs, in the state the product would be shown in. */
export interface PublishFacts {
  name: string;
  categoryId: string;
  /** A Prisma Decimal off the row, or the number / string a write carries. */
  price: Prisma.Decimal.Value;
  imageCount: number;
}

/** The unmet blocking requirements; empty means the product may be shown. */
export function publishBlockers(facts: PublishFacts): PublishBlocker[] {
  const met: Record<PublishBlocker, boolean> = {
    name: facts.name.trim().length > 0,
    category: facts.categoryId.length > 0,
    price: new Prisma.Decimal(facts.price).gt(0),
    photo: facts.imageCount > 0,
  };
  return PUBLISH_BLOCKERS.filter((blocker) => !met[blocker]);
}
