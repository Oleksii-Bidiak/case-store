import { PrismaClient } from '@prisma/client';
import { sanitizeRichText } from '../../../src/common/sanitize';
import { pagesData } from '../data/content/pages.data';

/**
 * Seed the admin-managed static / service pages (TASK-187) in UA, across all
 * three kinds (TASK-435): LEGAL documents under `/legal`, INFO help pages under
 * `/info` (including `about`, which the `/info` hub renders inline), and the six
 * HUB rows that give the storefront's listing routes their meta tags. Content is
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

  // The six HUB rows claim generic slugs — `promo`, `contact`, `info`, `blog`,
  // `legal`, `categories` — that an operator could plausibly have used for a
  // document of their own. The upsert's update branch would silently flip such a
  // row's kind to HUB and overwrite its title and body, and `Page` has no
  // tombstone, so the text would be gone for good; the page would also vanish
  // from `/legal/<slug>` in the same move. Re-running the seed is advertised as
  // safe (see docs/seed-guide.md), so it has to be.
  //
  // Only the promotion to HUB is guarded. A LEGAL↔INFO move is the seed's own
  // content finding its new surface (`about` migrates that way), it destroys
  // nothing, and the stale URL now 308s to the new one.
  const existing = await prisma.page.findMany({
    where: { slug: { in: pagesData.map((page) => page.slug) } },
    select: { slug: true, kind: true },
  });
  const existingKind = new Map(existing.map((row) => [row.slug, row.kind]));
  let upserted = 0;

  for (let i = 0; i < pagesData.length; i++) {
    const page = pagesData[i];
    const priorKind = existingKind.get(page.slug);
    if (page.kind === 'HUB' && priorKind !== undefined && priorKind !== 'HUB') {
      console.warn(
        `  ! Pages: "${page.slug}" already exists as ${priorKind} — skipped, ` +
          `so the seed does not overwrite an admin-authored page with a hub row. ` +
          `Rename that page (or delete it) to let the hub's meta card be seeded.`,
      );
      continue;
    }
    const content = sanitizeRichText(page.content);
    const data = {
      kind: page.kind,
      title: page.title,
      content,
      excerpt: page.excerpt,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      keywords: page.keywords ?? [],
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
    upserted++;
  }

  console.log(`  ✓ Pages: ${upserted} published pages upserted`);
}
