import { Injectable } from '@nestjs/common';
import { Prisma, SlugRedirect, SlugRedirectEntity } from '@prisma/client';
import { PrismaService } from '../prisma';
import { SlugAddress, toSlugAddress } from './slug-redirect-chain.util';

/**
 * Repository encapsulating all Prisma access for the SlugRedirect ledger
 * (TASK-285, plan 147). Two responsibilities:
 *
 * - `findRedirect` — the O(1) public-lookup read on the `(entity, scope,
 *   oldSlug)` unique key (no chain-walking: the write path guarantees every row
 *   points directly at the live address).
 * - `recordRename` — the 3-statement chain-collapse write, always executed
 *   against a CALLER-supplied transaction client so it commits/rolls back
 *   atomically with the entity's own slug update (same composition pattern as
 *   `discountParam.redeem(created.id, tx)` in `order.repository.ts`).
 *
 * Addresses, not slugs (TASK-566): a row maps `(scope, oldSlug)` to
 * `(newScope, newSlug)`. Pages use the page kind as the scope, because the
 * same slug may be live under `/legal` and `/info` at once; every other entity
 * passes bare slugs, which live in the empty scope.
 */
@Injectable()
export class SlugRedirectRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up the redirect target for a dead address. Returns the row or null
   * when the address never redirected (or is currently live).
   */
  findRedirect(
    entity: SlugRedirectEntity,
    oldSlug: string,
    scope = '',
  ): Promise<SlugRedirect | null> {
    return this.prisma.slugRedirect.findUnique({
      where: { entity_scope_oldSlug: { entity, scope, oldSlug } },
    });
  }

  /**
   * Record a rename `from → to` for `entity`, collapsing any existing redirect
   * chain so every historical alias points directly at `to`. `from` / `to` are
   * bare slugs (empty scope) or namespaced {@link SlugAddress}es.
   *
   * Exactly the 3 unconditional statements of plan 147 §Design Decision 2, in
   * order, against the caller's `tx` (this method NEVER opens its own
   * transaction — it runs inside the calling entity-repository's):
   *
   * 1. Upsert `(entity, from) → to`.
   * 2. Repoint every other row of this entity whose target is `from` to `to`
   *    (the upserted row itself no longer matches — its target is `to`).
   * 3. Delete the self-loop `to → to` if step 2 created one (the rename-back /
   *    undo case).
   *
   * A call whose address does not change writes nothing.
   *
   * The pure reducer `applySlugRename` in `slug-redirect-chain.util.ts` models
   * this identical transformation in memory and carries the exhaustive case
   * proof; this method is its mechanical Prisma translation.
   */
  async recordRename(
    tx: Prisma.TransactionClient,
    entity: SlugRedirectEntity,
    fromInput: string | SlugAddress,
    toInput: string | SlugAddress,
  ): Promise<void> {
    const from = toSlugAddress(fromInput);
    const to = toSlugAddress(toInput);
    if (from.scope === to.scope && from.slug === to.slug) return;

    // Step 1: upsert the just-abandoned address's direct redirect.
    await tx.slugRedirect.upsert({
      where: { entity_scope_oldSlug: { entity, scope: from.scope, oldSlug: from.slug } },
      create: {
        entity,
        scope: from.scope,
        oldSlug: from.slug,
        newScope: to.scope,
        newSlug: to.slug,
      },
      update: { newScope: to.scope, newSlug: to.slug },
    });

    // Step 2: collapse the chain — repoint every alias of the now-dead `from`.
    await tx.slugRedirect.updateMany({
      where: {
        entity,
        newScope: from.scope,
        newSlug: from.slug,
        NOT: { scope: from.scope, oldSlug: from.slug },
      },
      data: { newScope: to.scope, newSlug: to.slug },
    });

    // Step 3: remove the self-loop the collapse may have produced.
    await tx.slugRedirect.deleteMany({
      where: {
        entity,
        scope: to.scope,
        oldSlug: to.slug,
        newScope: to.scope,
        newSlug: to.slug,
      },
    });
  }

  /**
   * Re-home the addresses of an entity RESTORED from a tombstone onto a NEW slug
   * (TASK-1828) — {@link recordRename} adapted to an address the entity gave up when it
   * was deleted, and which someone else may have taken since. Bare slugs (empty scope)
   * only: the one caller is the product restore.
   *
   * While the entity was deleted its native address `from` was free: another entity may
   * have been created on it, renamed into it (adding its own aliases `x → from`) or
   * renamed away from it (repointing every `x → from`, ours included, and writing
   * `from → y`). The rule throughout: a row last written at or before `deletedAt` is
   * OUR history (until then `from` was ours) or older still, and is ours to rewrite; a
   * row written later belongs to whoever held `from` afterwards and is left alone. So,
   * against the caller's `tx`:
   *
   * 1. Repoint OUR aliases — rows targeting `from` last written at or before `deletedAt`.
   * 2. Make the new address `to` a live one: delete EVERY row whose `oldSlug` is `to`,
   *    whoever wrote it. The entity lives there now, so `to` must never redirect — a
   *    leftover `to → from` (an alias of another, deleted entity; one of our own old
   *    aliases became the self-loop `to → to` in step 1 and goes too) would otherwise
   *    close a 301 loop with step 3's `from → to`, live while the restored entity is
   *    still hidden. With no row left on `to`, no redirect cycle can pass through
   *    `from → to` at all — a loop would need a way out of `to`.
   * 3. Point the native address `from` at `to` when `redirectFrom` (the caller found no
   *    live entity on `from`). An existing `from → X` last written at or before
   *    `deletedAt` — left by an entity that renamed away from `from` before we held it —
   *    is overwritten; one written later (a later holder renaming away) is theirs and is
   *    kept; with no row, one is inserted. Two single statements rather than
   *    read-then-write, so a concurrent insert of the same key cannot fail the restore:
   *    the guarded update rewrites only a stale row, the `skipDuplicates` insert only
   *    fills a gap.
   *
   * Writes nothing when the address does not change.
   */
  async recordRestoreRename(
    tx: Prisma.TransactionClient,
    entity: SlugRedirectEntity,
    from: string,
    to: string,
    { deletedAt, redirectFrom }: { deletedAt: Date; redirectFrom: boolean },
  ): Promise<void> {
    if (from === to) return;

    // Step 1: our own aliases follow us to the new address.
    await tx.slugRedirect.updateMany({
      where: { entity, newScope: '', newSlug: from, updatedAt: { lte: deletedAt } },
      data: { newScope: '', newSlug: to },
    });

    // Step 2: the address we now live on never redirects (this also drops the self-loop
    // step 1 produces when restoring onto one of our own old aliases).
    await tx.slugRedirect.deleteMany({
      where: { entity, scope: '', oldSlug: to },
    });

    // Step 3: the native address itself, unless it now belongs to someone else.
    if (redirectFrom) {
      await tx.slugRedirect.updateMany({
        where: { entity, scope: '', oldSlug: from, updatedAt: { lte: deletedAt } },
        data: { newScope: '', newSlug: to },
      });
      await tx.slugRedirect.createMany({
        data: [{ entity, scope: '', oldSlug: from, newScope: '', newSlug: to }],
        skipDuplicates: true,
      });
    }
  }
}
