import { Prisma } from '@prisma/client';
import { ReorderDuplicateIdError, ReorderNotFoundError, ReorderStaleError } from './reorder.errors';
import {
  SortableDelegate,
  acquireAdvisoryLocks,
  lockKey,
  writeSiblingOrder,
} from './sibling-order.util';

/**
 * The FLAT (single-bucket, reparent-free) reorder recipe (TASK-295).
 *
 * The degenerate case of `CategoryRepository.applyTreeMoves`: lock → snapshot → validate →
 * write → return the refreshed list. It lives here, once, so banners / blog categories /
 * device brands do not each re-derive it (and get the locking or the staleness rule subtly
 * different). The tree keeps its own path — cycle, depth and self-parent have no flat
 * analogue, and its rules module is a regression gate in its own right.
 */

/**
 * The interactive-transaction client the callbacks receive. `Prisma.TransactionClient` is
 * the whole client minus the transaction-control methods, so a caller can reach ITS model
 * delegate (`tx.banner`, `tx.blogCategory`, …) — this module never names one itself, which
 * is what keeps it resource-agnostic.
 */
export type ReorderTx = Prisma.TransactionClient;

/** The subset of a Prisma client {@link reorderBucket} needs: interactive transactions. */
export interface ReorderTransactionClient {
  $transaction<T>(
    fn: (tx: ReorderTx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

/**
 * Validate a flat reorder payload against the bucket's authoritative, in-transaction
 * snapshot. Three checks, IN THIS ORDER (the order is the contract — a payload that is both
 * duplicated and stale is reported as duplicated, i.e. as the operator-fixable 400):
 *
 *   1. DUPLICATE — an id listed twice would silently drop a row's slot.
 *   2. NOT_FOUND — an id that is not in this bucket (a forged id, or a row someone else
 *      just deleted or moved to another bucket).
 *   3. STALE — the snapshot's id SET and `orderedIds`' set must be EQUAL.
 *
 * On (3): checks 1–2 already prove `orderedIds ⊆ snapshot` with no repeats, so the only way
 * the sets can still differ is that the SNAPSHOT holds an id the payload never named. That
 * means another admin created a row in this bucket (or moved one into it) after the client
 * read the list — so the payload is only a PARTIAL ordering, and writing it would leave the
 * unnamed row at a stale, now-colliding `sortOrder`. Rejecting it is the entire
 * optimistic-concurrency story for these lists: there is no version column, and the bucket's
 * membership IS the version. The client reloads and retries (409).
 *
 * `orderedIds` MAY be empty — but only if the bucket is empty too (same rule, no exception).
 */
export function assertFlatReorder(
  snapshotIds: readonly string[],
  orderedIds: readonly string[],
): void {
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) {
      throw new ReorderDuplicateIdError(`Id "${id}" appears more than once in the payload`);
    }
    seen.add(id);
  }

  const known = new Set(snapshotIds);
  for (const id of orderedIds) {
    if (!known.has(id)) {
      throw new ReorderNotFoundError(`Id "${id}" does not belong to this list`);
    }
  }

  // `orderedIds ⊆ snapshot` and duplicate-free ⇒ the sets are equal iff they are the same
  // size. A LARGER snapshot means a row appeared underneath the client (see above).
  if (known.size !== seen.size) {
    throw new ReorderStaleError(
      'The list changed since it was loaded (an item was added or moved into it) — reload and retry',
    );
  }
}

/** Everything {@link reorderBucket} needs to reorder ONE bucket of ONE resource. */
export interface ReorderBucketParams<T> {
  /** Advisory-lock namespace, e.g. `'banners'`. MANDATORY — locks are database-global. */
  resource: string;
  /** The bucket within the resource — `null` for a resource that has a single global list. */
  bucket: string | null;
  /** The COMPLETE, FINAL ordering of the bucket. The array index becomes `sortOrder`. */
  orderedIds: readonly string[];
  /** Extra WHERE guard on every write, so a foreign id can never be stolen into this bucket. */
  scope?: Record<string, unknown>;
  /** The bucket's current membership, read INSIDE the transaction, under the lock. */
  snapshot: (tx: ReorderTx) => Promise<Array<{ id: string }>>;
  /** The Prisma model delegate to write through, bound to this transaction. */
  delegate: (tx: ReorderTx) => SortableDelegate;
  /** The refreshed list to return, re-read INSIDE the same transaction as the write. */
  result: (tx: ReorderTx) => Promise<T>;
}

/**
 * Rewrite one flat bucket's `sortOrder` in ONE advisory-locked transaction and return the
 * refreshed list, read inside that same transaction (so the admin panel resyncs to server
 * truth in a single round-trip, exactly as the category reorder does).
 *
 * Throws the domain errors of `reorder.errors.ts` — never HTTP exceptions. The service maps
 * them with `reorderErrorToHttp`.
 */
export function reorderBucket<T>(
  prisma: ReorderTransactionClient,
  params: ReorderBucketParams<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // The lock FIRST: while it is held nothing else can add to, remove from or resequence
      // this bucket, so the snapshot below is authoritative for the whole transaction.
      await acquireAdvisoryLocks(tx, [lockKey(params.resource, params.bucket)]);

      const snapshot = await params.snapshot(tx);
      assertFlatReorder(
        snapshot.map((row) => row.id),
        params.orderedIds,
      );

      await writeSiblingOrder(params.delegate(tx), params.orderedIds, params.scope);

      return params.result(tx);
    },
    // The lock WAIT happens inside the transaction, so it is charged against `timeout`, NOT
    // `maxWait` (which only bounds the wait for a connection from the pool). The defaults
    // (5s / 2s) are raised for the same reason `category.repository.ts` raises them: a short
    // queue of admins must never surface as a spurious transaction abort.
    { timeout: 15_000, maxWait: 10_000 },
  );
}
