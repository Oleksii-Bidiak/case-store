import {
  DURATION_PATTERN,
  humanizeDuration,
  parseDurationToMs,
  pluralizeUk,
} from './duration.util';

describe('duration.util (TASK-790, TASK-824)', () => {
  describe('parseDurationToMs', () => {
    it.each([
      ['30s', 30_000],
      ['15m', 15 * 60_000],
      ['1h', 3_600_000],
      ['24h', 86_400_000],
      ['7d', 604_800_000],
      ['30d', 2_592_000_000],
    ])('%s → %d ms', (value, ms) => {
      expect(parseDurationToMs(value)).toBe(ms);
    });

    // The defect this replaces: an unreadable value silently became 7 days in
    // AuthService and 24 hours in EmailVerificationService.
    it.each(['60', '', '1w', '15 m', '1.5h', '-1d', '7days', 'd'])(
      'throws on %p instead of falling back to a default',
      (value) => {
        expect(() => parseDurationToMs(value)).toThrow(/Invalid duration/);
      },
    );
  });

  describe('humanizeDuration', () => {
    it.each([
      ['1h', '1 годину'],
      ['2h', '2 години'],
      ['5h', '5 годин'],
      ['24h', '24 години'],
      ['1m', '1 хвилину'],
      ['30m', '30 хвилин'],
      ['1d', '1 день'],
      ['3d', '3 дні'],
      ['7d', '7 днів'],
      ['30s', '30 секунд'],
    ])('%s → %s', (value, text) => {
      expect(humanizeDuration(value)).toBe(text);
    });

    it('throws rather than echoing a raw unparseable value into an email', () => {
      expect(() => humanizeDuration('60')).toThrow(/Invalid duration/);
    });
  });

  describe('pluralizeUk', () => {
    const forms: [string, string, string] = ['день', 'дні', 'днів'];

    it.each([
      [1, 'день'],
      [2, 'дні'],
      [4, 'дні'],
      [5, 'днів'],
      [11, 'днів'],
      [12, 'днів'],
      [14, 'днів'],
      [21, 'день'],
      [22, 'дні'],
      [25, 'днів'],
      [101, 'день'],
      [111, 'днів'],
    ])('%d → %s', (count, word) => {
      expect(pluralizeUk(count, forms)).toBe(word);
    });
  });

  it('DURATION_PATTERN is stateless (no /g), so repeated tests do not alternate', () => {
    expect(DURATION_PATTERN.test('7d')).toBe(true);
    expect(DURATION_PATTERN.test('7d')).toBe(true);
    expect(DURATION_PATTERN.flags).not.toContain('g');
  });
});
