import { Injectable } from '@nestjs/common';
import { Prisma, SlugRedirect, SlugRedirectEntity } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Repository encapsulating all Prisma access for the SlugRedirect ledger
 * (TASK-285, plan 147). Two responsibilities:
 *
 * - `findRedirect` — the O(1) public-lookup read on the `(entity, oldSlug)`
 *   unique key (no chain-walking: the write path guarantees every row points
 *   directly at the live slug).
 * - `recordRename` — the 3-statement chain-collapse write, always executed
 *   against a CALLER-supplied transaction client so it commits/rolls back
 *   atomically with the entity's own slug update (same composition pattern as
 *   `discountParam.redeem(created.id, tx)` in `order.repository.ts`).
 */
@Injectable()
export class SlugRedirectRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up the redirect target for a dead slug. Returns the row or null when
   * the slug never redirected (or is currently live).
   */
  findRedirect(entity: SlugRedirectEntity, oldSlug: string): Promise<SlugRedirect | null> {
    return this.prisma.slugRedirect.findUnique({
      where: { entity_oldSlug: { entity, oldSlug } },
    });
  }

  /**
   * Record a slug rename `from → to` for `entity`, collapsing any existing
   * redirect chain so every historical alias points directly at `to`.
   *
   * Exactly the 3 unconditional statements of plan 147 §Design Decision 2, in
   * order, against the caller's `tx` (this method NEVER opens its own
   * transaction — it runs inside the calling entity-repository's):
   *
   * 1. Upsert `(entity, oldSlug: from) → newSlug: to`.
   * 2. Repoint every other row of this entity whose `newSlug === from` to `to`
   *    (the upserted row itself no longer matches — its `newSlug` is `to`).
   * 3. Delete the self-loop `(oldSlug: to, newSlug: to)` if step 2 created one
   *    (the rename-back / undo case).
   *
   * The pure reducer `applySlugRename` in `slug-redirect-chain.util.ts` models
   * this identical transformation in memory and carries the exhaustive 9-case
   * proof; this method is its mechanical Prisma translation.
   */
  async recordRename(
    tx: Prisma.TransactionClient,
    entity: SlugRedirectEntity,
    from: string,
    to: string,
  ): Promise<void> {
    // Step 1: upsert the just-abandoned slug's direct redirect.
    await tx.slugRedirect.upsert({
      where: { entity_oldSlug: { entity, oldSlug: from } },
      create: { entity, oldSlug: from, newSlug: to },
      update: { newSlug: to },
    });

    // Step 2: collapse the chain — repoint every alias of the now-dead `from`.
    await tx.slugRedirect.updateMany({
      where: { entity, newSlug: from, oldSlug: { not: from } },
      data: { newSlug: to },
    });

    // Step 3: remove the self-loop the collapse may have produced.
    await tx.slugRedirect.deleteMany({
      where: { entity, oldSlug: to, newSlug: to },
    });
  }
}
