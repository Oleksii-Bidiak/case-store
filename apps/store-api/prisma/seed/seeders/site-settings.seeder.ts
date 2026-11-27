import { PrismaClient } from '@prisma/client';
import { LOGO_LIBRARY_MIME } from '../../../src/seo-settings/store-logo.constants';
import { renderLogoImage } from '../lib/images/seed-image.generator';
import { createSeedMediaRegistry } from '../lib/media-assets';
import { STORE_NAME } from '../lib/store';

/**
 * Seed the singleton site-contact settings row (TASK-154).
 * Uses the same well-known fixed ID as `SiteContactRepository.SINGLETON_ID`.
 * Idempotent: the upsert never duplicates the row.
 *
 * TASK-311: the values below are DUMMY defaults, not real contacts — the owner
 * replaces them in the admin (Налаштування → Контакти) before launch. This
 * singleton is the single home for phone / email / working hours / messengers;
 * the legal pages never restate them (they carry the seller's LEGAL requisites —
 * ФОП/ТОВ, ЄДРПОУ/ІПН, адреса — which have no model of their own). See
 * `docs/legal-checklist.md`.
 */
export async function seedSiteContactSettings(prisma: PrismaClient) {
  const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

  await prisma.siteContactSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: {
      id: SINGLETON_ID,
      email: 'support@casestore.ua',
      phone: '+380 44 000 0000',
      workingHours: 'Пн–Нд: 9:00 – 20:00',
      ...DEMO_MESSENGERS,
    },
  });

  // TASK-2569: the messenger links landed only on a fresh row (`update: {}`), and
  // before that they were null, so the storefront's messenger buttons never had
  // anything to show. Fill each one only while it is still empty — a link the
  // owner typed, or cleared and retyped, is theirs.
  let filled = 0;
  for (const [field, value] of Object.entries(DEMO_MESSENGERS)) {
    const result = await prisma.siteContactSettings.updateMany({
      where: { id: SINGLETON_ID, [field]: null },
      data: { [field]: value },
    });
    filled += result.count;
  }

  console.log(
    `  ✓ SiteContactSettings: singleton row upserted${filled > 0 ? ` (${filled} messenger link(s) filled)` : ''}`,
  );
}

/**
 * DUMMY messenger links (TASK-2569), like the phone and email above: valid
 * `https` URLs (the admin DTO's rule) on a demo handle, replaced by the owner.
 */
const DEMO_MESSENGERS = {
  viberLink: 'https://viber.click/380440000000',
  telegramLink: 'https://t.me/casestore_demo',
  instagramLink: 'https://www.instagram.com/casestore.demo/',
} as const;

/**
 * Give the store a logo from the media library (TASK-2569): the generator's
 * monogram, registered as a WebP library asset — a type the logo slot takes
 * (`LOGO_LIBRARY_MIME`) — and set exactly the way «Обрати з медіатеки» sets it:
 * `logoUrl` = the asset's URL. Only while `logoUrl` is still null, so a logo the
 * owner uploaded, or picked, survives every re-seed.
 */
export async function seedStoreLogo(prisma: PrismaClient) {
  const SINGLETON_ID = '00000000-0000-0000-0000-000000000002';
  const logo = await renderLogoImage({
    key: 'store-logo',
    paletteId: 'indigo',
    alt: `Логотип ${STORE_NAME}`,
  });
  const assetId = await createSeedMediaRegistry(prisma)({ ...logo, tags: ['логотип', 'демо'] });
  // `StoreLogoService.setLogoFromLibrary`'s own gate, on the row it would read.
  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (!LOGO_LIBRARY_MIME.has(asset.mime)) {
    throw new Error(`seedStoreLogo: the logo slot does not take ${asset.mime} library assets`);
  }

  const set = await prisma.seoSettings.updateMany({
    where: { id: SINGLETON_ID, logoUrl: null },
    data: { logoUrl: asset.url },
  });
  console.log(
    `  ✓ Store logo: ${set.count > 0 ? 'set from the media library' : 'kept (already set)'}`,
  );
}

/**
 * Seed the singleton SEO-settings row (TASK-239) with sensible zero-config
 * defaults so an untouched install already has decent SEO. Uses the same
 * well-known fixed ID as `SeoSettingsRepository.SINGLETON_ID`.
 *
 * Defaults per plan 116 §TASK-239:
 *   - siteName: STORE_NAME — the one field that is seeded with a real value
 *     (TASK-433). The column is nullable so a fresh install still renders a name
 *     via the storefront's SITE_NAME constant, but leaving it empty here would
 *     show the owner a blank «Назва магазину» box in the admin while the live
 *     site plainly displays a name — the exact "where do I change this?"
 *     confusion the field exists to end.
 *   - defaultMetaTitle: null — let the content-derived fallback build titles
 *   - defaultMetaDescription: a generic store one-liner
 *   - titleTemplate: null — use the code default (`%s | ${SITE_NAME}`)
 *   - googleSiteVerification / bingSiteVerification: null — search-console
 *     verification not configured out of the box (plan 146)
 *   - noindexSite: false — assume production once this ships
 *   - additionalSameAsLinks: [] — none configured out of the box
 *
 * Idempotent: `update: {}` preserves any admin edits on re-seed. The one
 * exception is a still-null `siteName`, which is filled (TASK-567).
 */
export async function seedSeoSettings(prisma: PrismaClient) {
  const SINGLETON_ID = '00000000-0000-0000-0000-000000000002';

  await prisma.seoSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: {
      id: SINGLETON_ID,
      siteName: STORE_NAME,
      defaultMetaTitle: null,
      defaultMetaDescription:
        'Мультибрендовий інтернет-магазин аксесуарів для смартфонів та Apple-техніки в Україні. Доставка Новою Поштою, оплата у гривні.',
      titleTemplate: null,
      defaultOgImage: null,
      googleSiteVerification: null,
      bingSiteVerification: null,
      noindexSite: false,
      llmsTxtSummary: null,
      additionalSameAsLinks: [],
    },
  });

  // TASK-567: `update: {}` above means `siteName` only ever landed on a FRESH
  // row, so a database seeded before TASK-433 kept a blank «Назва магазину».
  // Fill it here — guarded by `siteName: null` in the WHERE, so a name the
  // owner typed in the admin panel is never overwritten.
  const filled = await prisma.seoSettings.updateMany({
    where: { id: SINGLETON_ID, siteName: null },
    data: { siteName: STORE_NAME },
  });

  console.log(
    `  ✓ SeoSettings: singleton row upserted${filled.count > 0 ? ' (empty siteName filled)' : ''}`,
  );
}
