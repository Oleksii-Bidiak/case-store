import { PrismaClient, PublishStatus } from '@prisma/client';
import type { ValidationArguments } from 'class-validator';
import { MAX_ACTIVE_PROMO_TILES } from '../../../src/banners/banners.errors';
import { PublicationWindowConstraint } from '../../../src/banners/dto/publication-window.constraint';
import { resolvePublishState } from '../../../src/publishing/resolve-publish-state';
import { banners, type SeedBanner } from '../data/content/banners.data';
import { deterministicUuid } from '../lib/ids';
import { renderBannerImage } from '../lib/images/seed-image.generator';
import { createSeedMediaRegistry } from '../lib/media-assets';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The publish fields a banner gets, resolved by the domain's own
 * `resolvePublishState` (a SCHEDULED date that is not in the future would
 * collapse to PUBLISHED there, so the seed cannot plant an impossible state),
 * plus the banner-only window end checked by the DTO's cross-field rule.
 */
function publishFieldsFor(b: SeedBanner, now: Date) {
  if (b.state === 'DRAFT') {
    return { ...resolvePublishState({ status: PublishStatus.DRAFT }, now), scheduledUntil: null };
  }
  if (!b.state) {
    return {
      ...resolvePublishState({ status: PublishStatus.PUBLISHED }, now),
      scheduledUntil: null,
    };
  }
  const scheduledAt = new Date(now.getTime() + b.state.scheduledInDays * DAY_MS);
  const scheduledUntil = new Date(now.getTime() + b.state.untilInDays * DAY_MS);
  const window = new PublicationWindowConstraint().validate(scheduledUntil.toISOString(), {
    object: { scheduledAt: scheduledAt.toISOString() },
  } as ValidationArguments);
  const resolved = resolvePublishState({ status: PublishStatus.SCHEDULED, scheduledAt }, now);
  if (!window || resolved.status !== PublishStatus.SCHEDULED) {
    throw new Error(
      `seedBanners: "${b.slot}" is not a valid schedule (start in the future, end after it)`,
    );
  }
  return { ...resolved, scheduledUntil };
}

/**
 * Seed the homepage banners (TASK-186): published ones per placement, plus a
 * SCHEDULED promo tile and a DRAFT hero slide (TASK-2569). Idempotent via a
 * deterministic id keyed on placement + slot; publish dates are relative to the
 * run and rewritten on every run. The storefront renders its hardcoded fallback
 * when a placement has none, so this seed is a convenience, not a requirement.
 *
 * Each picture is a generated wide render (TASK-2569), written with its blur
 * placeholder and registered in the media library with alt text and tags, so
 * the library shows where the banner art came from.
 */
export async function seedBanners(prisma: PrismaClient) {
  const now = new Date();
  await assertPromoTileLimit(prisma);
  const registerAsset = createSeedMediaRegistry(prisma);
  let pictures = 0;
  const byStatus: Record<PublishStatus, number> = { PUBLISHED: 0, SCHEDULED: 0, DRAFT: 0 };

  for (const [index, b] of banners.entries()) {
    const id = deterministicUuid(`banner:${b.placement}:${b.slot}`);
    const image = b.image
      ? await renderBannerImage({ key: b.slot, variant: index, ...b.image })
      : null;
    if (image) {
      await registerAsset({ ...image, tags: ['банер', 'демо'] });
      pictures++;
    }

    const publish = publishFieldsFor(b, now);
    byStatus[publish.status]++;
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
      ...publish,
    };

    await prisma.banner.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  console.log(
    `  ✓ Banners: ${banners.length} upserted (${byStatus.PUBLISHED} published, ` +
      `${byStatus.SCHEDULED} scheduled, ${byStatus.DRAFT} draft; ${pictures} with generated art)`,
  );
}

/**
 * `BannersService.assertPromoTileSlot`: at most five PROMO_TILE banners PUBLISHED
 * or SCHEDULED at once. Counted with whatever an admin added beside the seed's
 * own rows, because together they are what the storefront would hold.
 */
async function assertPromoTileLimit(prisma: PrismaClient) {
  const seededIds = banners.map((b) => deterministicUuid(`banner:${b.placement}:${b.slot}`));
  const planned = banners.filter((b) => b.placement === 'PROMO_TILE' && b.state !== 'DRAFT').length;
  const others = await prisma.banner.count({
    where: {
      placement: 'PROMO_TILE',
      status: { in: [PublishStatus.PUBLISHED, PublishStatus.SCHEDULED] },
      id: { notIn: seededIds },
    },
  });
  if (planned + others > MAX_ACTIVE_PROMO_TILES) {
    throw new Error(
      `seedBanners: ${planned} seeded + ${others} other active promo tiles exceed the limit of ` +
        `${MAX_ACTIVE_PROMO_TILES} — unpublish one in the admin or trim banners.data.ts`,
    );
  }
}
