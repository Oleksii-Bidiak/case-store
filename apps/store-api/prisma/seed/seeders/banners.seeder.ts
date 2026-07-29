import { PrismaClient } from '@prisma/client';
import { banners } from '../data/content/banners.data';
import { deterministicUuid } from '../lib/ids';

/**
 * Seed a couple of published homepage banners per placement (TASK-186).
 * Idempotent via a deterministic id keyed on placement + slot. The storefront
 * renders its hardcoded fallback when a placement has none, so this seed is a
 * convenience for local development, not a requirement.
 */
export async function seedBanners(prisma: PrismaClient) {
  const now = new Date();

  for (const b of banners) {
    const id = deterministicUuid(`banner:${b.placement}:${b.slot}`);
    const data = {
      placement: b.placement,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      ctaLabel: b.ctaLabel,
      ctaHref: b.ctaHref,
      theme: b.theme,
      sortOrder: b.sortOrder,
      status: 'PUBLISHED' as const,
      publishedAt: now,
      scheduledAt: null,
    };

    await prisma.banner.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  console.log(`  ✓ Banners: ${banners.length} published banners upserted`);
}
