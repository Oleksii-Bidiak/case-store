import sharp from 'sharp';
import {
  ImageProcessor,
  IMAGE_DECODE_CONCURRENCY,
  MAX_INPUT_PIXELS,
} from './image-processor.service';

/**
 * The decompression-bomb guard (TASK-583), on its own because it needs `sharp`
 * mocked and every other ImageProcessor test needs the real one.
 *
 * WHY A MOCK AND NOT A REAL BOMB: proving the ceiling by feeding in a 200 Mpx
 * input means the test suite itself allocates the frame we are trying to refuse.
 * What can actually regress here is not sharp's enforcement — that is sharp's
 * job and it is tested upstream — but OUR passing of the option. Drop
 * `limitInputPixels` from the call and nothing fails, nothing looks wrong in the
 * diff, and the limit silently becomes whatever sharp's default happens to be in
 * the installed version (or whatever a global `sharp` config left behind). This
 * test fails in exactly that case, which is the whole point of the task.
 */
jest.mock('sharp', () => {
  const encoded = Buffer.from('fake-webp-bytes');
  const chain: Record<string, jest.Mock> = {};
  chain.rotate = jest.fn(() => chain);
  chain.resize = jest.fn(() => chain);
  chain.webp = jest.fn(() => chain);
  // The full-size encode asks for `{ resolveWithObject: true }` so it gets the
  // stored render's own width/height/size back (TASK-441); the LQIP pass does
  // not. The mock has to honour both shapes or it stops resembling sharp.
  chain.toBuffer = jest.fn((options?: { resolveWithObject?: boolean }) =>
    options?.resolveWithObject
      ? Promise.resolve({
          data: encoded,
          info: { width: 2000, height: 1333, size: encoded.length },
        })
      : Promise.resolve(encoded),
  );
  return { __esModule: true, default: jest.fn(() => chain) };
});

const sharpMock = sharp as unknown as jest.Mock;

describe('ImageProcessor — input pixel ceiling (TASK-583)', () => {
  beforeEach(() => {
    sharpMock.mockClear();
  });

  it('decodes the untrusted upload with an explicit limitInputPixels', async () => {
    const input = Buffer.from('pretend this is a 20 MB JPEG');

    await new ImageProcessor().process(input);

    const [buffer, options] = sharpMock.mock.calls[0];
    expect(buffer).toBe(input);
    expect(options).toEqual({ limitInputPixels: MAX_INPUT_PIXELS });
  });

  it('sets a ceiling that is a real number, not a "no limit" sentinel', () => {
    // sharp accepts `false` and `0` as "remove the limit" and `true` as "use the
    // default", so a truthy-looking value is not enough: assert a positive count
    // at or below sharp's own documented default (0x3FFF² = 268402689).
    expect(typeof MAX_INPUT_PIXELS).toBe('number');
    expect(Number.isInteger(MAX_INPUT_PIXELS)).toBe(true);
    expect(MAX_INPUT_PIXELS).toBeGreaterThan(0);
    expect(MAX_INPUT_PIXELS).toBeLessThanOrEqual(268402689);
  });

  it('does not re-decode the original when building the LQIP', async () => {
    // The LQIP comes off the finished WebP, not off a second pass over the
    // full-resolution input — that difference is what keeps peak memory flat as
    // the upload grows, inside a 640 MB container.
    const input = Buffer.from('pretend this is a 20 MB JPEG');

    await new ImageProcessor().process(input);

    expect(sharpMock).toHaveBeenCalledTimes(2);
    expect(sharpMock.mock.calls[1][0]).not.toBe(input);
    expect(sharpMock.mock.calls[1][0]).toEqual(Buffer.from('fake-webp-bytes'));
  });
});

/**
 * The decode-concurrency bound (TASK-586), mocked for the same reason the pixel
 * ceiling above is: proving it with real images means allocating the very frames
 * we are trying not to hold at once. What can regress is OUR gate, and this
 * fails the moment `process` stops taking a slot.
 */
describe('ImageProcessor — decode concurrency (TASK-586)', () => {
  /** Drain microtasks AND the promise jobs they queue, which `await` alone will not. */
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('is bounded to a real count, not left to the libuv threadpool', () => {
    expect(Number.isInteger(IMAGE_DECODE_CONCURRENCY)).toBe(true);
    expect(IMAGE_DECODE_CONCURRENCY).toBeGreaterThanOrEqual(1);
    // Four is the libuv default, i.e. what we would get by doing nothing.
    expect(IMAGE_DECODE_CONCURRENCY).toBeLessThan(4);
  });

  it('holds the second upload until the first decode is done', async () => {
    const chain = sharpMock() as Record<string, jest.Mock>;
    const originalToBuffer = chain.toBuffer.getMockImplementation();
    sharpMock.mockClear();

    const encoded = Buffer.from('fake-webp-bytes');
    const finishDecode: Array<() => void> = [];
    let decoding = 0;
    let peakDecoding = 0;

    chain.toBuffer.mockImplementation((options?: { resolveWithObject?: boolean }) => {
      // Only the full-size pass is the expensive decode; the LQIP runs off the
      // finished WebP and needs no gate of its own.
      if (!options?.resolveWithObject) {
        return Promise.resolve(encoded);
      }
      decoding += 1;
      peakDecoding = Math.max(peakDecoding, decoding);
      return new Promise((resolve) => {
        finishDecode.push(() => {
          decoding -= 1;
          resolve({ data: encoded, info: { width: 2000, height: 1333, size: encoded.length } });
        });
      });
    });

    const processor = new ImageProcessor();
    const first = processor.process(Buffer.from('first upload'));
    const second = processor.process(Buffer.from('second upload'));
    await flush();

    // The second call is parked BEFORE `sharp` ever sees its buffer — the point
    // of the gate is that the second frame is never allocated, not that it is
    // freed quickly.
    expect(finishDecode).toHaveLength(1);

    finishDecode[0]();
    await first;
    await flush();

    expect(finishDecode).toHaveLength(2);
    finishDecode[1]();
    await second;

    expect(peakDecoding).toBe(1);

    chain.toBuffer.mockImplementation(originalToBuffer!);
  });
});
