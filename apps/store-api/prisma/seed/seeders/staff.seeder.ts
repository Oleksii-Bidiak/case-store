import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  GRANTABLE_PERMISSION_KEYS,
  READ_BACKFILL_PAIRS,
} from '../../../src/auth/permissions/permission.catalog';
import { managersData, permissionTemplatesData } from '../data/staff.data';
import { deterministicUuid } from '../lib/ids';

const DAY = 24 * 60 * 60 * 1000;

/** A seeded staff account, as the later seeders use it (author of history and money rows). */
export interface SeededManager {
  id: string;
  email: string;
}

/** One of the seeded managers by email — the author later seeders put on operator rows. */
export function managerByEmail(managers: readonly SeededManager[], email: string): SeededManager {
  const manager = managers.find((m) => m.email === email);
  if (!manager) throw new Error(`Seed: manager ${email} was not seeded (data/staff.data.ts)`);
  return manager;
}

/**
 * The template's keys as the owner's screen would save them: each `:write`
 * brings its `:read` partner (READ_BACKFILL_PAIRS), duplicates collapse, and a
 * key nobody may be granted is a seed bug, not something to skip quietly —
 * `PermissionTemplateService` refuses the same key with a 400.
 */
export function templatePermissions(name: string, keys: readonly string[]): string[] {
  const set = new Set(keys);
  for (const [write, read] of READ_BACKFILL_PAIRS) {
    if (set.has(write)) set.add(read);
  }
  const refused = [...set].filter((key) => !GRANTABLE_PERMISSION_KEYS.has(key));
  if (refused.length) {
    throw new Error(
      `seedStaff: template «${name}» holds key(s) that cannot be granted: ${refused.join(', ')}. ` +
        'Only GRANTABLE_PERMISSIONS (src/auth/permissions/permission.catalog.ts) may go into a template.',
    );
  }
  return [...set].sort();
}

/**
 * Permission templates and the two managers built from them (TASK-2569).
 *
 * - Templates are upserted on their unique `name`; their items are replaced
 *   wholesale, so dropping a key from the data drops the row.
 * - Each manager (role MANAGER, password `Customer123!`, hashed as
 *   `seedUsers` hashes it) gets exactly the template's set — the whole set is
 *   replaced, as `PermissionTemplateService.apply` → `setPermissions` does.
 * - The apply is recorded the way the controller records it: one
 *   `permissionTemplate.apply` audit row, authored by the owner, at a fixed id.
 *
 * Runs after `seedUsers` — the owner is the audit row's actor.
 */
export async function seedStaff(
  prisma: PrismaClient,
  owner: { id: string; email: string },
): Promise<SeededManager[]> {
  const now = Date.now();

  const templates = new Map<string, { id: string; name: string; permissions: string[] }>();
  for (const t of permissionTemplatesData) {
    const permissions = templatePermissions(t.name, t.permissions);
    const record = await prisma.permissionTemplate.upsert({
      where: { name: t.name },
      update: { description: t.description },
      create: { name: t.name, description: t.description },
    });
    await prisma.permissionTemplateItem.deleteMany({ where: { templateId: record.id } });
    await prisma.permissionTemplateItem.createMany({
      data: permissions.map((permission) => ({ templateId: record.id, permission })),
    });
    templates.set(t.name, { id: record.id, name: t.name, permissions });
  }

  const passwordHash = await argon2.hash('Customer123!');
  const managers: SeededManager[] = [];
  for (const m of managersData) {
    const template = templates.get(m.template);
    if (!template) {
      throw new Error(`seedStaff: ${m.email} names unknown template «${m.template}»`);
    }

    const profile = {
      firstName: m.firstName,
      lastName: m.lastName,
      phone: m.phone,
      role: 'MANAGER' as const,
      isActive: true,
    };
    const user = await prisma.user.upsert({
      where: { email: m.email },
      update: profile,
      create: { email: m.email, passwordHash, ...profile },
    });

    await prisma.userPermission.deleteMany({ where: { userId: user.id } });
    await prisma.userPermission.createMany({
      data: template.permissions.map((permission) => ({ userId: user.id, permission })),
    });

    // Same shape as PermissionTemplateController.apply's audit row. The person
    // started with no rights (StaffService.create grants none), so `from` is [].
    const auditId = deterministicUuid(`audit-template-apply-${m.email}`);
    const audit = {
      actorId: owner.id,
      actorEmail: owner.email,
      actorRole: 'ADMIN' as const,
      action: 'permissionTemplate.apply',
      entityType: 'permissionTemplate',
      entityId: template.id,
      summary:
        `Шаблон «${template.name}» застосовано до ${m.email}: ` +
        `${template.permissions.length} дозволів (було 0)`,
      diff: { targetUserId: user.id, permissions: { from: [], to: template.permissions } },
      createdAt: new Date(now - m.appliedDaysAgo * DAY),
    };
    await prisma.auditLog.upsert({
      where: { id: auditId },
      update: audit,
      create: { id: auditId, ...audit },
    });

    managers.push({ id: user.id, email: user.email });
  }

  console.log(
    `  ✓ Staff: ${templates.size} permission templates, ${managers.length} managers ` +
      `(${managers.map((m) => m.email).join(', ')})`,
  );
  return managers;
}
