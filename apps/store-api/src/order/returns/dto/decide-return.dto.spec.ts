import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DecideReturnDto } from './decide-return.dto';

/** The DTO as the global ValidationPipe sees it: transformed, then validated. */
const parse = (body: Record<string, unknown>) => {
  const dto = plainToInstance(DecideReturnDto, body);
  return { dto, errors: validateSync(dto) };
};

describe('DecideReturnDto (TASK-1961, TASK-2044)', () => {
  it.each(['REFUND', 'REPLACEMENT', 'REPAIR', 'REJECT'])('accepts the decision %s', (decision) => {
    expect(parse({ decision }).errors).toEqual([]);
  });

  it('rejects a decision outside the enum', () => {
    expect(parse({ decision: 'APPROVE' }).errors).not.toEqual([]);
  });

  it('requires a decision', () => {
    expect(parse({ reason: 'x' }).errors).not.toEqual([]);
  });

  it('trims the reason the customer will read', () => {
    expect(parse({ decision: 'REJECT', reason: '  Немає чека  ' }).dto.reason).toBe('Немає чека');
  });

  it('turns a blank reason into null, so "   " never counts as a reason', () => {
    expect(parse({ decision: 'REJECT', reason: '   ' }).dto.reason).toBeNull();
  });

  it.each([
    ['a zero-width space', '​'],
    ['a zero-width joiner among spaces', ' ‍  '],
    ['a byte-order mark', '﻿'],
    ['a soft hyphen and a word joiner', '­⁠'],
  ])('turns a reason of only invisible characters (%s) into null', (_label, reason) => {
    expect(parse({ decision: 'REJECT', reason }).dto.reason).toBeNull();
  });

  it('keeps a visible reason intact, invisible joiners inside it included', () => {
    expect(parse({ decision: 'REJECT', reason: ' Скол 👩‍🔧 ' }).dto.reason).toBe('Скол 👩‍🔧');
  });

  it('caps the reason at 1000 characters', () => {
    expect(parse({ decision: 'REJECT', reason: 'а'.repeat(1000) }).errors).toEqual([]);
    expect(parse({ decision: 'REJECT', reason: 'а'.repeat(1001) }).errors).not.toEqual([]);
  });

  it('rejects a reason that is not a string', () => {
    expect(parse({ decision: 'REJECT', reason: 42 }).errors).not.toEqual([]);
  });
});
