import { Test, TestingModule } from '@nestjs/testing';
import { StaffRepository } from './staff.repository';
import { PrismaService } from '../prisma';

/**
 * The ownership transfer, at the level where its ONLY interesting property lives
 * (TASK-478, plan 181, invariant 1).
 *
 * ── WHY THE WRITE ORDER IS A TEST AND NOT A COMMENT ──────────────────────────
 *
 * `users_single_owner_key` is a PARTIAL UNIQUE index — `ON users(is_owner) WHERE
 * is_owner = true` — and Postgres checks a unique index IMMEDIATELY, statement by
 * statement, not at COMMIT. So "one transaction" is not on its own enough to make
 * a transfer work: inside that transaction there is still an instant after the
 * first statement and before the second, and the index is enforced across it.
 *
 * Set the new owner first and that instant contains TWO rows with `is_owner =
 * true`; the statement is rejected on the spot and the whole transfer fails. Clear
 * the outgoing owner first and the instant contains ZERO, which the index has
 * nothing to say about. Only one of the two orders can ever succeed, and which one
 * is invisible from the result — a passing transfer looks identical either way
 * until the day it is the WRONG way, at which point it never succeeds at all.
 *
 * The fake below therefore models the index rather than merely recording calls:
 * it rejects a second `is_owner = true` with a real `P2002`, and it restores the
 * pre-transaction snapshot when the callback throws. The second test runs the
 * naive order against that same fake and shows it failing — without that, a fake
 * that had quietly stopped enforcing anything would let the first test pass
 * forever.
 *
 * `access-model-backfill.int-spec.ts` runs the same transfer against the REAL
 * index on a real Postgres. This suite exists because that one needs a database
 * and this one catches the regression in the unit gate.
 */
describe('StaffRepository.transferOwnership (TASK-478)', () => {
  let repository: StaffRepository;

  interface Row {
    id: string;
    email: string;
    role: string;
    isOwner: boolean;
  }

  /** The table. */
  const rows = new Map<string, Row>();
  /** Every `is_owner` write the transaction attempted, in order. */
  const writes: string[] = [];

  const OWNER = 'owner-1';
  const DEPUTY = 'deputy-1';

  function seed(): void {
    rows.clear();
    writes.length = 0;
    rows.set(OWNER, { id: OWNER, email: 'owner@example.com', role: 'ADMIN', isOwner: true });
    rows.set(DEPUTY, { id: DEPUTY, email: 'deputy@example.com', role: 'ADMIN', isOwner: false });
  }

  /** The unique-violation Prisma raises on `users_single_owner_key`. */
  function uniqueViolation(): Error & { code: string } {
    return Object.assign(new Error('Unique constraint failed on the fields: (`isOwner`)'), {
      code: 'P2002',
      meta: { target: 'users_single_owner_key' },
    });
  }

  /**
   * The transaction client. Enforces the partial unique index the way Postgres
   * does — immediately, per statement — so an order that cannot work here cannot
   * work in production either.
   */
  const tx = {
    user: {
      update: jest.fn(({ where, data }: { where: { id: string }; data: { isOwner?: boolean } }) => {
        const row = rows.get(where.id);
        if (!row) {
          return Promise.reject(
            Object.assign(new Error('Record to update not found'), { code: 'P2025' }),
          );
        }

        const next: Row = { ...row, ...data };
        writes.push(`${where.id}:isOwner=${String(next.isOwner)}`);

        const anotherOwnerExists = [...rows.values()].some(
          (other) => other.id !== next.id && other.isOwner,
        );
        if (next.isOwner && anotherOwnerExists) {
          return Promise.reject(uniqueViolation());
        }

        rows.set(next.id, next);
        return Promise.resolve(next);
      }),
    },
  };

  const prismaMock = {
    // A write reaching the top-level client is a write OUTSIDE the transaction.
    // Made loud rather than silently allowed: "both updates are in one
    // transaction" is otherwise invisible in every assertion below.
    user: {
      update: jest.fn(() => {
        throw new Error('StaffRepository wrote outside the transaction');
      }),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => {
      const snapshot = new Map([...rows].map(([id, row]) => [id, { ...row }]));
      try {
        return await fn(tx);
      } catch (err) {
        rows.clear();
        for (const [id, row] of snapshot) rows.set(id, row);
        throw err;
      }
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    seed();

    const module: TestingModule = await Test.createTestingModule({
      providers: [StaffRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get(StaffRepository);
  });

  it('clears the outgoing owner BEFORE setting the incoming one, in one transaction', async () => {
    const result = await repository.transferOwnership(OWNER, DEPUTY);

    // The order is the assertion. Reversed, the second statement would be
    // rejected by the index — see the next test.
    expect(writes).toEqual([`${OWNER}:isOwner=false`, `${DEPUTY}:isOwner=true`]);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).not.toHaveBeenCalled();

    expect(result.outgoing.isOwner).toBe(false);
    expect(result.incoming.isOwner).toBe(true);
    expect(rows.get(OWNER)?.isOwner).toBe(false);
    expect(rows.get(DEPUTY)?.isOwner).toBe(true);
  });

  it('would fail on the naive order — which is what makes the order above load-bearing', async () => {
    // Exactly what a reasonable author writes first: promote, then demote. Run
    // against the same fake index, through the same transaction wrapper.
    const naive = prismaMock.$transaction(async (client) => {
      await client.user.update({ where: { id: DEPUTY }, data: { isOwner: true } });
      await client.user.update({ where: { id: OWNER }, data: { isOwner: false } });
    });

    await expect(naive).rejects.toMatchObject({ code: 'P2002' });

    // And the shop still has the owner it started with: the rejected statement
    // took the whole transaction with it.
    expect(rows.get(OWNER)?.isOwner).toBe(true);
    expect(rows.get(DEPUTY)?.isOwner).toBe(false);
  });

  it('rolls the first write back when the second fails — never zero owners', async () => {
    // The incoming account disappears between the caller's read and the write
    // (deleted in another tab, say). The clear has already run.
    rows.delete(DEPUTY);

    await expect(repository.transferOwnership(OWNER, DEPUTY)).rejects.toMatchObject({
      code: 'P2025',
    });

    // "Exactly one owner" is the invariant; "the original owner" is the only
    // acceptable way to satisfy it after a failure.
    expect([...rows.values()].filter((row) => row.isOwner).map((row) => row.id)).toEqual([OWNER]);
  });

  it('changes nothing but the flag — a role is a different door', async () => {
    const result = await repository.transferOwnership(OWNER, DEPUTY);

    expect(result.outgoing.role).toBe('ADMIN');
    expect(result.incoming.role).toBe('ADMIN');
    for (const call of tx.user.update.mock.calls) {
      expect(Object.keys(call[0].data)).toEqual(['isOwner']);
    }
  });
});
