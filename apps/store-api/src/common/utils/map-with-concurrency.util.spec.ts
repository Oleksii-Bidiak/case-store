import { mapWithConcurrency } from './map-with-concurrency.util';

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('mapWithConcurrency (TASK-1894)', () => {
  it('keeps at most `limit` calls in flight and returns results in input order', async () => {
    const pending = [0, 1, 2, 3, 4].map(() => deferred<string>());
    let inFlight = 0;
    let peak = 0;
    const started: number[] = [];

    const run = mapWithConcurrency([0, 1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        return await pending[item].promise;
      } finally {
        inFlight -= 1;
      }
    });

    await flush();
    expect(started).toEqual([0, 1]);

    // Finish out of order: the later item first.
    pending[1].resolve('b');
    await flush();
    expect(started).toEqual([0, 1, 2]);
    pending[0].resolve('a');
    pending[2].resolve('c');
    pending[3].resolve('d');
    pending[4].resolve('e');

    await expect(run).resolves.toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(peak).toBe(2);
  });

  it('resolves an empty input without calling fn', async () => {
    const fn = jest.fn();
    await expect(mapWithConcurrency([], 4, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects with the first failure and starts nothing after it', async () => {
    const fn = jest.fn(async (item: number) => {
      if (item === 0) throw new Error('boom');
      return item;
    });

    await expect(mapWithConcurrency([0, 1, 2, 3], 1, fn)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-positive limit', async () => {
    await expect(mapWithConcurrency([1], 0, async (x) => x)).rejects.toThrow(RangeError);
  });
});
