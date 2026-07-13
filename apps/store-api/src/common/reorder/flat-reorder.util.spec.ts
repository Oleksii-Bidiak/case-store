import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { assertFlatReorder, reorderBucket } from './flat-reorder.util';
import {
  ReorderDuplicateIdError,
  ReorderErrorCode,
  ReorderNotFoundError,
  ReorderStaleError,
  reorderErrorToHttp,
} from './reorder.errors';

/**
 * Unit tests for the shared FLAT reorder layer (TASK-295) — the primitives the banner,
 * blog-category and device-brand reorder endpoints are all built on. The three resources
 * therefore inherit these guarantees; their own specs only assert the wiring.
 */

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('assertFlatReorder', () => {
  it('accepts a complete permutation of the bucket', () => {
    expect(() => assertFlatReorder([A, B, C], [C, A, B])).not.toThrow();
  });

  it('accepts an empty payload for an empty bucket', () => {
    expect(() => assertFlatReorder([], [])).not.toThrow();
  });

  it('rejects a duplicate id with DUPLICATE_ID', () => {
    expect(() => assertFlatReorder([A, B], [A, A])).toThrow(ReorderDuplicateIdError);
  });

  it('rejects an id that is not in the bucket with NOT_FOUND', () => {
    expect(() => assertFlatReorder([A, B], [A, B, C])).toThrow(ReorderNotFoundError);
  });

  // The version-column-free optimistic-concurrency check: the snapshot holds a row the
  // payload never named, so another admin added/moved one into the bucket after the client
  // read it and the payload is only a PARTIAL ordering.
  it('rejects a snapshot SUPERSET (a row appeared underneath the client) with STALE', () => {
    expect(() => assertFlatReorder([A, B, C], [A, B])).toThrow(ReorderStaleError);
  });

  it('reports a payload that is BOTH duplicated and stale as DUPLICATE_ID (check order)', () => {
    expect(() => assertFlatReorder([A, B, C], [A, A])).toThrow(ReorderDuplicateIdError);
  });
});

describe('reorderErrorToHttp', () => {
  it('maps DUPLICATE_ID to a 400 carrying the stable code', () => {
    const http = reorderErrorToHttp(new ReorderDuplicateIdError());

    expect(http).toBeInstanceOf(BadRequestException);
    expect((http as BadRequestException).getResponse()).toMatchObject({
      error: ReorderErrorCode.DUPLICATE_ID,
      message: expect.any(String),
    });
  });

  it('maps NOT_FOUND to a 404 carrying the stable code', () => {
    const http = reorderErrorToHttp(new ReorderNotFoundError());

    expect(http).toBeInstanceOf(NotFoundException);
    expect((http as NotFoundException).getResponse()).toMatchObject({
      error: ReorderErrorCode.NOT_FOUND,
    });
  });

  it('maps STALE to a 409 carrying the stable code', () => {
    const http = reorderErrorToHttp(new ReorderStaleError());

    expect(http).toBeInstanceOf(ConflictException);
    expect((http as ConflictException).getResponse()).toMatchObject({
      error: ReorderErrorCode.STALE,
    });
  });

  it('returns a NON-domain error untouched so the global filter still reports a 500', () => {
    const boom = new Error('connection lost');

    expect(reorderErrorToHttp(boom)).toBe(boom);
  });
});

describe('reorderBucket', () => {
  const delegate = { updateMany: jest.fn() };
  const tx = {
    $executeRaw: jest.fn(),
    banner: delegate,
  };
  const prisma = {
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) =>
      fn(tx),
    );
    delegate.updateMany.mockResolvedValue({ count: 1 });
    tx.$executeRaw.mockResolvedValue(1);
  });

  const params = (orderedIds: string[], snapshotIds: string[]) => ({
    resource: 'banners',
    bucket: 'HERO_SLIDE',
    orderedIds,
    scope: { placement: 'HERO_SLIDE' },
    snapshot: jest.fn().mockResolvedValue(snapshotIds.map((id) => ({ id }))),
    delegate: () => delegate,
    result: jest.fn().mockResolvedValue(['refreshed']),
  });

  it('locks the bucket, writes index → sortOrder and returns the refreshed list', async () => {
    const p = params([C, A, B], [A, B, C]);

    const result = await reorderBucket(prisma as any, p);

    expect(result).toEqual(['refreshed']);
    // The advisory lock is taken BEFORE the snapshot is read.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(p.snapshot).toHaveBeenCalledTimes(1);

    expect(delegate.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: C, placement: 'HERO_SLIDE' },
      data: { sortOrder: 0 },
    });
    expect(delegate.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: A, placement: 'HERO_SLIDE' },
      data: { sortOrder: 1 },
    });
    expect(delegate.updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: B, placement: 'HERO_SLIDE' },
      data: { sortOrder: 2 },
    });

    // The lock wait is charged to `timeout`, not `maxWait` — the raised values are part of
    // the contract, not an accident.
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15_000,
      maxWait: 10_000,
    });
  });

  it('accepts an empty payload for an empty bucket and writes nothing', async () => {
    await reorderBucket(prisma as any, params([], []));

    expect(delegate.updateMany).not.toHaveBeenCalled();
  });

  it('throws the domain error and writes NOTHING when the payload is stale', async () => {
    await expect(reorderBucket(prisma as any, params([A, B], [A, B, C]))).rejects.toBeInstanceOf(
      ReorderStaleError,
    );

    expect(delegate.updateMany).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the payload names a foreign id', async () => {
    await expect(reorderBucket(prisma as any, params([A, C], [A, B]))).rejects.toBeInstanceOf(
      ReorderNotFoundError,
    );

    expect(delegate.updateMany).not.toHaveBeenCalled();
  });
});
