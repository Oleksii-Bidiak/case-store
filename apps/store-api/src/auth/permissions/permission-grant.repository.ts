import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

/**
 * The only writer of `user_permissions` (TASK-477, plan 181).
 *
 * ── WHY THIS LIVES NEXT TO `PermissionRepository` AND NOT IN `staff/` ─────────
 *
 * `PermissionRepository.findActor` READS this table on every admin request. One
 * table, one folder: a second repository in a feature module writing rows the
 * guard reads is how a filter drifts — the reader drops rows naming a key the
 * catalogue no longer declares, and a writer that did not know that would happily
 * store them. The routes that expose these writes live on `StaffController`
 * («Персонал» is where an owner looks), but the DATA belongs with the guard that
 * consults it.
 *
 * ── REPLACE, NEVER DIFF ───────────────────────────────────────────────────────
 *
 * {@link replaceForUser} deletes every row and inserts the new set inside ONE
 * transaction — the shape the retired `replaceRoleGrants` used, kept deliberately.
 * The property it buys is worth stating: **the rows that exist are exactly the
 * rows that were granted**, at every instant, including after a failure. A diff
 * ("add these two, remove that one") has an intermediate state in which the
 * person holds a set nobody chose, and if the second statement fails they keep it
 * — silently, with no error anybody sees, and with the screen still showing what
 * was submitted. There is nothing to reconcile here because there is no state
 * between the two writes that another request can observe.
 *
 * It also makes the operation idempotent: the owner's checkbox grid submits the
 * set it displays, and submitting it twice cannot mean something different from
 * submitting it once.
 *
 * ── NO CACHE, DELIBERATELY ────────────────────────────────────────────────────
 *
 * Nothing needs evicting after a write, because nothing caches the read: since
 * TASK-475 a caller's rights arrive on the same query as the caller. That is what
 * makes plan 181's invariant 8 true — a key revoked here is refused on the
 * target's very NEXT request, not up to a TTL later — and it is why adding a
 * cache in front of `findActor` would quietly re-open a hole this model exists to
 * close.
 */
@Injectable()
export class PermissionGrantRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The keys this person holds personally, sorted.
   *
   * Returns rows as stored, including any naming a key the catalogue no longer
   * declares: this is the EDITING view, and an owner should see the stale row
   * they are about to drop rather than have it vanish from the screen and then
   * reappear in the database. The GUARD applies the catalogue filter instead
   * (`PermissionRepository.findActor`), so a stale row grants nothing meanwhile.
   */
  async findByUserId(userId: string): Promise<string[]> {
    const rows = await this.prisma.userPermission.findMany({
      where: { userId },
      select: { permission: true },
      orderBy: { permission: 'asc' },
    });

    return rows.map((row) => row.permission);
  }

  /**
   * Make `permissions` the complete set this person holds.
   *
   * Callers MUST have validated the keys (`assertGrantablePermissions`) and the
   * level (`assertMayManage`) first — this method is deliberately dumb about
   * policy, exactly like `StaffRepository.updateRole`, so that the rules live in
   * one place each and are provable without a database.
   */
  async replaceForUser(userId: string, permissions: readonly string[]): Promise<string[]> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });

      if (permissions.length > 0) {
        await tx.userPermission.createMany({
          data: permissions.map((permission) => ({ userId, permission })),
          skipDuplicates: true,
        });
      }
    });

    return [...permissions];
  }
}
