import { PrismaClient } from '@prisma/client';
import { subscribers } from '../data/content/newsletter.data';

/**
 * Seed newsletter subscribers (TASK-188) — a mix of SUBSCRIBED and UNSUBSCRIBED
 * so the admin list and the resubscribe flow have data. Idempotent — upsert on
 * the unique (normalized) email.
 */
export async function seedNewsletter(prisma: PrismaClient) {
  const day = 24 * 60 * 60 * 1000;

  for (const s of subscribers) {
    const email = s.email.trim().toLowerCase();
    const unsubscribedAt =
      s.status === 'UNSUBSCRIBED' && s.unsubscribedDaysAgo
        ? new Date(Date.now() - s.unsubscribedDaysAgo * day)
        : null;
    await prisma.newsletterSubscription.upsert({
      where: { email },
      update: { status: s.status, source: s.source, unsubscribedAt },
      create: { email, status: s.status, source: s.source, unsubscribedAt },
    });
  }

  console.log(`  ✓ Newsletter: ${subscribers.length} subscribers upserted`);
}
