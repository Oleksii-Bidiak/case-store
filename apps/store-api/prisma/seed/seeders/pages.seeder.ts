import { PrismaClient } from '@prisma/client';
import { sanitizeRichText } from '../../../src/common/sanitize';
import { pagesData } from '../data/content/pages.data';

/**
 * Seed the admin-managed static / service pages (TASK-187) in UA. Content is
 * Tiptap-style HTML sanitized through {@link sanitizeRichText} on write, exactly
 * like the admin editor. All pages are PUBLISHED with a real `publishedAt` and
 * the derived `isActive` mirror set true. Idempotent — upsert on the unique slug.
 *
 * TASK-311 — NO FABRICATED FACTS. The prose is deliberately realistic (the
 * staging site must look like a real shop), but EVERY factual claim about the
 * company — year founded, legal entity, ЄДРПОУ/ІПН, addresses, pickup points,
 * service centres, phone/email — is an explicit `[bracketed placeholder]`.
 * A plausible-sounding invention silently ships to production (that is exactly
 * how "власний сервісний центр у Києві" and "з 2018 року" reached the
 * storefront); a bracket is impossible to miss. When editing this seed, NEVER
 * swap a placeholder for a more plausible invention — fill it only with data the
 * shop owner actually confirmed.
 *
 * Contact channels (phone / email / working hours / messengers) are NOT
 * duplicated here — they live in the admin-editable `SiteContactSettings`
 * singleton (TASK-154) and are rendered in the footer and on /contact. The
 * seller's LEGAL requisites (ФОП/ТОВ, ЄДРПОУ/ІПН, юридична адреса) have no
 * dedicated model, so they live in the page copy below (`about`, `offer`).
 * See `docs/legal-checklist.md`.
 */
export async function seedPages(prisma: PrismaClient) {
  const publishedAt = new Date('2026-06-01T09:00:00.000Z');

  for (let i = 0; i < pagesData.length; i++) {
    const page = pagesData[i];
    const content = sanitizeRichText(page.content);
    const data = {
      title: page.title,
      content,
      excerpt: page.excerpt,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      status: 'PUBLISHED' as const,
      publishedAt,
      scheduledAt: null,
      isActive: true,
      sortOrder: i,
    };
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: data,
      create: { slug: page.slug, ...data },
    });
  }

  console.log(`  ✓ Pages: ${pagesData.length} published pages upserted`);
}
