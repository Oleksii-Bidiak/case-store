import { PrismaClient } from '@prisma/client';
import { messages } from '../data/content/contact-messages.data';
import { deterministicUuid } from '../lib/ids';

/**
 * Seed customer contact / support messages (TASK-177) across every status —
 * NEW / IN_PROGRESS / READ / ARCHIVED / SPAM (the last two kinds since
 * TASK-2569) — so the admin inbox, its filters and the unread badge have data.
 * Idempotent — upsert on a deterministic id.
 */
export async function seedContactMessages(prisma: PrismaClient) {
  for (const m of messages) {
    const id = deterministicUuid(`contact-${m.key}`);
    await prisma.contactMessage.upsert({
      where: { id },
      update: {
        name: m.name,
        phone: m.phone,
        email: m.email,
        topic: m.topic,
        orderRef: m.orderRef ?? null,
        message: m.message,
        status: m.status,
        adminNote: m.adminNote ?? null,
      },
      create: {
        id,
        name: m.name,
        phone: m.phone,
        email: m.email,
        topic: m.topic,
        orderRef: m.orderRef ?? null,
        message: m.message,
        status: m.status,
        adminNote: m.adminNote ?? null,
      },
    });
  }

  const statuses = [...new Set(messages.map((m) => m.status))].join('/');
  console.log(`  ✓ Contact messages: ${messages.length} upserted (${statuses})`);
}
