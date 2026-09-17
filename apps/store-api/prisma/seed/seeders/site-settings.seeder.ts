import { PrismaClient } from '@prisma/client';
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
      viberLink: null,
      telegramLink: null,
      instagramLink: null,
    },
  });

  console.log('  ✓ SiteContactSettings: singleton row upserted');
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
 * Idempotent: `update: {}` preserves any admin edits on re-seed.
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

  console.log('  ✓ SeoSettings: singleton row upserted');
}
