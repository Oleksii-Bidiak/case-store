/**
 * `Promise.all(items.map(fn))` with at most `limit` calls in flight (TASK-1894).
 *
 * Results come back in INPUT order regardless of which call finishes first. The first
 * rejection rejects the whole call (like `Promise.all`); calls already started are left
 * to settle on their own, and no new ones are started after it.
 *
 * Why not unbounded `Promise.all`: each call here is a catalog query against the shared
 * Prisma pool — a homepage with twenty carousels would otherwise take twenty pool
 * connections at once on a cold cache and starve every other request.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`mapWithConcurrency: limit must be a positive integer, got ${limit}`);
  }

  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
