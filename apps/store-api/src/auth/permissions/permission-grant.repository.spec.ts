import { Test, TestingModule } from '@nestjs/testing';
import { PermissionGrantRepository } from './permission-grant.repository';
import { PermissionRepository } from './permission.repository';
import { PrismaService } from '../../prisma';

/**
 * The one writer of `user_permissions`, and the read that consults it
 * (TASK-477, plan 181 invariants 5 and 8).
 *
 * Two things are worth pinning at this level rather than only over HTTP:
 *
 *   - **the write is replace-in-one-transaction**, not a diff. The assertion is
 *     about ORDER and CONTAINMENT — delete, then insert, both inside the same
 *     `$transaction` callback — because the property that buys ("the rows that
 *     exist are exactly the rows that were granted, at every instant") is invisible
 *     in the result and only observable in the shape of the calls;
 *
 *   - **nothing between the write and the guard remembers anything.** The last
 *     test wires the real reader to the real writer over one store and checks the
 *     revocation is visible on the next read, and that the read went back to the
 *     database to find that out. A cache added in front of `findActor` later would
 *     fail here rather than in production, three minutes after somebody was fired.
 */
describe('PermissionGrantRepository (TASK-477)', () => {
  let repository: PermissionGrantRepository;
  let reader: PermissionRepository;

  /** userId → keys. One store, shared by the reader and the writer. */
  const rows = new Map<string, Set<string>>();
  const calls: string[] = [];

  const prismaMock = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => {
      calls.push('transaction:begin');
      return Promise.resolve(fn(prismaMock));
    }),
    userPermission: {
      findMany: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          [...(rows.get(where.userId) ?? [])].sort().map((permission) => ({ permission })),
        ),
      ),
      deleteMany: jest.fn(({ where }: { where: { userId: string } }) => {
        calls.push('deleteMany');
        const count = rows.get(where.userId)?.size ?? 0;
        rows.set(where.userId, new Set());
        return Promise.resolve({ count });
      }),
      createMany: jest.fn(({ data }: { data: { userId: string; permission: string }[] }) => {
        calls.push('createMany');
        for (const row of data) {
          const held = rows.get(row.userId) ?? new Set<string>();
          held.add(row.permission);
          rows.set(row.userId, held);
        }
        return Promise.resolve({ count: data.length });
      }),
    },
    user: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) => {
        calls.push('user.findFirst');
        return Promise.resolve({
          id: where.id,
          email: 'olena@example.com',
          role: 'MANAGER',
          isOwner: false,
          permissions: [...(rows.get(where.id) ?? [])].map((permission) => ({ permission })),
        });
      }),
    },
  };

  beforeEach(async () => {
    rows.clear();
    calls.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionGrantRepository,
        PermissionRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get(PermissionGrantRepository);
    reader = module.get(PermissionRepository);
  });

  describe('replaceForUser', () => {
    it('deletes then inserts, both inside ONE transaction', async () => {
      rows.set('manager-1', new Set(['blog:write']));

      await repository.replaceForUser('manager-1', ['orders:read', 'orders:write']);

      expect(calls).toEqual(['transaction:begin', 'deleteMany', 'createMany']);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('clears everything without an insert when the new set is empty', async () => {
      rows.set('manager-1', new Set(['blog:write']));

      await repository.replaceForUser('manager-1', []);

      expect(calls).toEqual(['transaction:begin', 'deleteMany']);
      expect(await repository.findByUserId('manager-1')).toEqual([]);
    });

    it('replaces rather than merges — the old set does not survive', async () => {
      rows.set('manager-1', new Set(['blog:write', 'pages:write']));

      await repository.replaceForUser('manager-1', ['orders:read']);

      expect(await repository.findByUserId('manager-1')).toEqual(['orders:read']);
    });

    it('touches nobody else', async () => {
      rows.set('manager-1', new Set(['blog:write']));
      rows.set('manager-2', new Set(['orders:read']));

      await repository.replaceForUser('manager-1', ['pages:write']);

      expect(await repository.findByUserId('manager-2')).toEqual(['orders:read']);
    });
  });

  describe('findByUserId', () => {
    it('returns the keys sorted', async () => {
      rows.set('manager-1', new Set(['pages:write', 'blog:write']));

      expect(await repository.findByUserId('manager-1')).toEqual(['blog:write', 'pages:write']);
    });

    it('returns an empty array for somebody with no rows', async () => {
      expect(await repository.findByUserId('nobody')).toEqual([]);
    });
  });

  describe('invariant 8 — a revocation is effective on the very next read', () => {
    it('is gone immediately, and the answer came from a fresh query', async () => {
      await repository.replaceForUser('manager-1', ['orders:read', 'orders:write']);

      const before = await reader.findActor('manager-1');
      expect([...(before?.permissions ?? [])].sort()).toEqual(['orders:read', 'orders:write']);

      await repository.replaceForUser('manager-1', ['orders:read']);

      const readsBefore = calls.filter((call) => call === 'user.findFirst').length;
      const after = await reader.findActor('manager-1');

      expect([...(after?.permissions ?? [])]).toEqual(['orders:read']);
      expect(calls.filter((call) => call === 'user.findFirst').length).toBe(readsBefore + 1);
    });
  });
});
