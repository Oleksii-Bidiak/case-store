import { PrismaClient } from '@prisma/client';
import { faqs } from '../data/content/faq.data';

/**
 * Seed the global FAQ list (TASK-242, plan 116 Decision 3) with the 6 Q&A pairs
 * migrated verbatim from the storefront's former static `INFO_FAQS`
 * (`store-client/src/widgets/info-support/model/info-content.ts`) so the admin
 * sees real content on first load instead of an empty list. Fixed UUIDs make the
 * upsert idempotent; `update: {}` preserves any admin edits on re-seed.
 *
 * TASK-311: answers must not assert facts nobody confirmed (a pickup point, a
 * courier tariff, a bonus programme that does not exist) — those are
 * `[bracketed placeholders]`, kept in sync with the storefront's INFO_FAQS.
 */
export async function seedFaqItems(prisma: PrismaClient) {
  for (const [index, faq] of faqs.entries()) {
    await prisma.faqItem.upsert({
      where: { id: faq.id },
      update: {},
      create: {
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        sortOrder: index,
        isActive: true,
      },
    });
  }

  console.log(`  ✓ Seeded ${faqs.length} FAQ items`);
}
