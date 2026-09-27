import {
  buildCsvDocument,
  CSV_BOM,
  csvNumberField,
  escapeCsvField,
  toSingleCsvLine,
} from './csv.util';

/**
 * TASK-691: the reports of plan 188 are the first exports with negative
 * numbers, so numbers get their own branch — and the text branch keeps
 * neutralising everything that could run as a formula.
 */
describe('csv.util', () => {
  describe('csvNumberField — the numeric branch', () => {
    it('keeps a negative amount a number', () => {
      expect(csvNumberField(-4200)).toBe('-4200');
      expect(csvNumberField('-4200.50')).toBe('-4200.50');
      expect(csvNumberField(-12.5)).toBe('-12.5');
      expect(csvNumberField(0)).toBe('0');
    });

    it.each([['=1+1'], ['-1+1'], ['1e3'], [''], ['12,5'], [' 12'], ['@SUM(A1)']])(
      'refuses %p — text never passes the numeric door',
      (value) => {
        expect(() => csvNumberField(value)).toThrow();
      },
    );

    it.each([[Infinity], [NaN], [1e21]])('refuses the non-plain number %p', (value) => {
      expect(() => csvNumberField(value)).toThrow();
    });
  });

  describe('escapeCsvField — the text branch is unchanged', () => {
    it('neutralises a formula typed into a customer field', () => {
      expect(escapeCsvField('=1+1')).toBe("'=1+1");
      expect(escapeCsvField('\t=1+1')).toBe("'\t=1+1");
    });

    it('still turns a negative-looking TEXT value into text', () => {
      // A shopper-supplied "-4200" is indistinguishable from "-1+1".
      expect(escapeCsvField('-4200')).toBe("'-4200");
    });

    it('quotes commas, quotes and newlines', () => {
      expect(escapeCsvField('Петренко, Олена')).toBe('"Петренко, Олена"');
      expect(escapeCsvField('a"b')).toBe('"a""b"');
      expect(toSingleCsvLine('a\r\nb')).toBe('a b');
    });
  });

  describe('buildCsvDocument', () => {
    it('starts with exactly one BOM and joins lines with CRLF', () => {
      const csv = buildCsvDocument(['name,total', 'Олена,-4200']);
      expect(csv).toBe(`${CSV_BOM}name,total\r\nОлена,-4200`);
      expect(csv.startsWith(CSV_BOM + CSV_BOM)).toBe(false);
    });
  });
});
