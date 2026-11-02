import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ResolveReturnDto } from './resolve-return.dto';

/** The DTO as the global ValidationPipe sees it: transformed, then validated. */
const parse = (body: Record<string, unknown>) => {
  const dto = plainToInstance(ResolveReturnDto, body);
  return { dto, errors: validateSync(dto) };
};

describe('ResolveReturnDto', () => {
  it('accepts a status move', () => {
    expect(parse({ status: 'RECEIVED', restock: true }).errors).toEqual([]);
  });

  // The notes-only PATCH: approving and refusing moved to POST /decision, and
  // notes on a REQUESTED or REJECTED return have no status to travel with.
  it('accepts notes without a status', () => {
    expect(parse({ operatorNotes: 'Дзвонив клієнт' }).errors).toEqual([]);
  });

  it('turns blank notes into null, so "   " clears them', () => {
    expect(parse({ operatorNotes: '   ' }).dto.operatorNotes).toBeNull();
  });

  it('still rejects a status outside the enum', () => {
    expect(parse({ status: 'CLOSED' }).errors).not.toEqual([]);
  });

  // R2 A3 (TASK-2046): money on a return is a ledger payout now
  // (POST /admin/orders/:orderId/money/out) — the old amount field is gone and
  // the global pipe's forbidNonWhitelisted refuses it.
  it('no longer accepts refundedAmount', () => {
    const dto = plainToInstance(ResolveReturnDto, { status: 'RECEIVED', refundedAmount: '499.00' });
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
  });
});
