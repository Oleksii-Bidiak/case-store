import { PrismaClient } from '@prisma/client';
import { buildDiscountsData } from '../data/discounts.data';

/**
 * Seed promo codes / coupons (TASK-079). Codes are stored UPPERCASE and matched
 * case-insensitively by the discount service. Covers percent + fixed types, an
 * active set, one expired, and one deactivated code so the admin list and the
 * checkout apply-code flow both have realistic data. Idempotent — upsert on the
 * unique `code`; `redeemedCount` is NOT overwritten on update (seedOrders owns it).
 */
export async function seedDiscounts(prisma: PrismaClient) {
  const discountsData = buildDiscountsData();

  for (const d of discountsData) {
    await prisma.discount.upsert({
      where: { code: d.code },
      update: {
        type: d.type,
        value: d.value,
        minSpend: d.minSpend ?? null,
        maxRedemptions: d.maxRedemptions ?? null,
        perUserLimit: d.perUserLimit ?? null,
        startsAt: d.startsAt ?? null,
        expiresAt: d.expiresAt ?? null,
        isActive: d.isActive,
      },
      create: {
        code: d.code,
        type: d.type,
        value: d.value,
        minSpend: d.minSpend ?? null,
        maxRedemptions: d.maxRedemptions ?? null,
        perUserLimit: d.perUserLimit ?? null,
        startsAt: d.startsAt ?? null,
        expiresAt: d.expiresAt ?? null,
        isActive: d.isActive,
      },
    });
  }

  console.log(`  ✓ Discounts: ${discountsData.length} upserted`);
}
