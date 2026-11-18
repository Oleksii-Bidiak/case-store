import { MAX_ORIGINAL_FILENAME_LENGTH, normaliseOriginalFilename } from './media-filename';

/**
 * The client's file name, as the library records it (TASK-1731).
 *
 * It is a LABEL — shown on the card and matched by search — and never a path:
 * nothing is ever read from or written to it. What this guards is what an
 * operator would otherwise see: a Windows path some browser sent whole, a
 * control character that breaks the card's line, a 4 KB name.
 */
describe('normaliseOriginalFilename (TASK-1731)', () => {
  it('keeps an ordinary name, Cyrillic and spaces included', () => {
    expect(normaliseOriginalFilename('Банер осінь.jpg')).toBe('Банер осінь.jpg');
  });

  it.each([
    ['C:\\Users\\olena\\Desktop\\banner.jpg', 'banner.jpg'],
    ['/home/olena/photos/banner.png', 'banner.png'],
    ['../../etc/passwd', 'passwd'],
  ])('drops the directory part of %p', (raw, expected) => {
    expect(normaliseOriginalFilename(raw)).toBe(expected);
  });

  it('strips control characters and trims', () => {
    expect(normaliseOriginalFilename('  ban\u0000n\u0007er\n\r\u007f\u009b.png \t')).toBe(
      'banner.png',
    );
  });

  it(`caps the name at ${MAX_ORIGINAL_FILENAME_LENGTH} characters without splitting one`, () => {
    const name = normaliseOriginalFilename(`${'я'.repeat(250)}${'😀'.repeat(20)}.jpg`);

    expect(Array.from(name ?? '')).toHaveLength(MAX_ORIGINAL_FILENAME_LENGTH);
    // A cut through a surrogate pair would leave a lone half at the end.
    expect(name?.endsWith('😀')).toBe(true);
  });

  it.each([undefined, '', '   ', '/', 'C:\\folder\\', '\u0000\u0001'])(
    'answers null for %p — unknown, not an empty name',
    (raw) => {
      expect(normaliseOriginalFilename(raw)).toBeNull();
    },
  );
});
