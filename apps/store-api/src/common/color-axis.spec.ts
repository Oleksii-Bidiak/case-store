import {
  COLOR_AXIS_KEYS,
  COLOR_SPEC_KEY,
  COLOR_SPEC_LABEL,
  isColorAxis,
  readColorAxis,
  withColorAxis,
} from './color-axis';

describe('color-axis (TASK-487)', () => {
  describe('isColorAxis', () => {
    it.each(['color', 'colour', 'колір', 'Колір', '  COLOR  ', 'Colour'])('accepts %p', (name) => {
      expect(isColorAxis(name)).toBe(true);
    });

    it.each(['size', "Пам'ять", 'Довжина', 'colors', ''])('rejects %p', (name) => {
      expect(isColorAxis(name)).toBe(false);
    });
  });

  describe('readColorAxis', () => {
    it('returns the value AND the axis it was stored under', () => {
      expect(readColorAxis({ Колір: 'Темно-синій' })).toEqual({
        axis: 'Колір',
        value: 'Темно-синій',
      });
    });

    it('reads the import spelling too', () => {
      expect(readColorAxis({ color: 'Black' })).toEqual({ axis: 'color', value: 'Black' });
    });

    it('ignores other axes', () => {
      expect(readColorAxis({ "Пам'ять": '256 ГБ', Довжина: '1 м' })).toBeNull();
    });

    it('treats a blank colour as no colour', () => {
      // An empty value reaching the facet would publish an unclickable swatch
      // with no name — worse than no swatch.
      expect(readColorAxis({ color: '   ' })).toBeNull();
      expect(readColorAxis({ color: '' })).toBeNull();
    });

    it('survives every non-object shape the JSON column can hold', () => {
      expect(readColorAxis(null)).toBeNull();
      expect(readColorAxis(undefined)).toBeNull();
      expect(readColorAxis('Чорний')).toBeNull();
      expect(readColorAxis(42)).toBeNull();
      expect(readColorAxis(['Чорний'])).toBeNull();
    });

    it('ignores a non-string value under a colour key', () => {
      expect(readColorAxis({ color: { hex: '#000' } })).toBeNull();
    });
  });

  describe('withColorAxis', () => {
    it('writes under the axis the position ALREADY uses', () => {
      // Renaming «Колір» to `color` on save would desync the position from its
      // group's declared axis, and the PDP navigator prints the axis name raw.
      expect(withColorAxis({ Колір: 'Чорний' }, 'Білий')).toEqual({ Колір: 'Білий' });
    });

    it("prefers the GROUP's axis name when the position has no colour yet", () => {
      expect(withColorAxis({ Розмір: 'M' }, 'Білий', 'color')).toEqual({
        Розмір: 'M',
        color: 'Білий',
      });
    });

    it('falls back to the seed spelling when nothing else says otherwise', () => {
      expect(withColorAxis({}, 'Білий')).toEqual({ [COLOR_SPEC_LABEL]: 'Білий' });
    });

    it('ignores a preferred axis that is not a colour axis', () => {
      expect(withColorAxis({}, 'Білий', 'Розмір')).toEqual({ [COLOR_SPEC_LABEL]: 'Білий' });
    });

    it('preserves every other axis untouched', () => {
      expect(withColorAxis({ "Пам'ять": '256 ГБ', color: 'Black' }, 'Білий')).toEqual({
        "Пам'ять": '256 ГБ',
        color: 'Білий',
      });
    });

    it('clears EVERY colour-ish key, not just the first', () => {
      // A half-cleared row still advertises a colour the operator believed they
      // had removed.
      expect(withColorAxis({ color: 'Black', Колір: 'Чорний', Розмір: 'M' }, null)).toEqual({
        Розмір: 'M',
      });
    });

    it('treats a blank string as a clear', () => {
      expect(withColorAxis({ color: 'Black' }, '   ')).toEqual({});
    });

    it('trims the written value', () => {
      expect(withColorAxis({}, '  Білий  ')).toEqual({ [COLOR_SPEC_LABEL]: 'Білий' });
    });

    it('does not mutate the input', () => {
      const input = { color: 'Black' };
      withColorAxis(input, 'Білий');
      expect(input).toEqual({ color: 'Black' });
    });
  });

  it('files the spec under a latin key — it is half of a catalogue URL', () => {
    expect(COLOR_SPEC_KEY).toBe('color');
    expect(COLOR_AXIS_KEYS.has(COLOR_SPEC_KEY)).toBe(true);
  });
});
