import { normalizeEmail, normalizeEmailAddress } from './normalize-email.transform';

/**
 * One address, one spelling (TASK-772).
 *
 * `users.email` is a plain `text` column with a case-SENSITIVE unique index, so
 * `A@Gmail.com` and `a@gmail.com` are two different rows to Postgres — and two
 * accounts to the shop. Everything that reaches a lookup or a write therefore
 * has to arrive in the same shape.
 */
describe('normalizeEmailAddress', () => {
  it.each([
    ['A@Gmail.com', 'a@gmail.com'],
    ['  user@Example.COM  ', 'user@example.com'],
    ['\tMixed.Case+Tag@Domain.UA\n', 'mixed.case+tag@domain.ua'],
    ['already@lower.com', 'already@lower.com'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeEmailAddress(input)).toBe(expected);
  });
});

describe('normalizeEmail (class-transformer transform)', () => {
  it('trims and lowercases a string value', () => {
    expect(normalizeEmail({ value: '  A@Gmail.com ' })).toBe('a@gmail.com');
  });

  it('leaves an empty string empty — @IsEmail refuses it, the transform does not decide', () => {
    expect(normalizeEmail({ value: '   ' })).toBe('');
  });

  // Non-strings pass through untouched so @IsEmail / @IsString still report the
  // type error rather than a normalised lie.
  it.each([[undefined], [null], [42], [{ email: 'A@B.C' }], [['A@B.C']]])(
    'passes %j through unchanged',
    (value) => {
      expect(normalizeEmail({ value })).toBe(value);
    },
  );
});
