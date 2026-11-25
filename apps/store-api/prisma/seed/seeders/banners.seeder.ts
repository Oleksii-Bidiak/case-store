import { PrismaClient } from '@prisma/client';
import { banners } from '../data/content/banners.data';
import { deterministicUuid } from '../lib/ids';
import { renderBannerImage } from '../lib/images/seed-image.generator';
import { createSeedMediaRegistry } from '../lib/media-assets';

/**
 * Seed a couple of published homepage banners per placement (TASK-186).
 * Idempotent via a deterministic id keyed on placement + slot. The storefront
 * renders its hardcoded fallback when a placement has none, so this seed is a
 * convenience for local development, not a requirement.
 *
 * Each picture is a generated wide render (TASK-2569), written with its blur
 * placeholder and registered in the media library with alt text and tags, so
 * the library shows where the banner art came from.
 */
export async function seedBanners(prisma: PrismaClient) {
  const now = new Date();
  const registerAsset = createSeedMediaRegistry(prisma);
  let pictures = 0;

  for (const [index, b] of banners.entries()) {
    const id = deterministicUuid(`banner:${b.placement}:${b.slot}`);
    const image = b.image
      ? await renderBannerImage({ key: b.slot, variant: index, ...b.image })
      : null;
    if (image) {
      await registerAsset({ ...image, tags: ['банер', 'демо'] });
      pictures++;
    }

    const data = {
      placement: b.placement,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: image?.url ?? null,
      imageBlurDataUrl: image?.blurDataUrl ?? null,
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

  console.log(
    `  ✓ Banners: ${banners.length} published banners upserted (${pictures} with generated art)`,
  );
}
