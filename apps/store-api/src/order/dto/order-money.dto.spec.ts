import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MoneyCorrectionDto, RecordMoneyInDto, RecordMoneyOutDto } from './order-money.dto';

const AT = '2026-11-01T10:00:00.000Z';

function parse<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
}

/** R2 A3 — the operator's money bodies: integer kopecks, a fresh-screen token. */
describe('order money DTOs', () => {
  describe('RecordMoneyInDto', () => {
    const ok = { kind: 'COD_NOVA_POSHTA', amountKop: 129_900, expectedUpdatedAt: AT };

    it('accepts a receipt with an optional date and note', () => {
      expect(parse(RecordMoneyInDto, ok).errors).toEqual([]);
      expect(
        parse(RecordMoneyInDto, { ...ok, occurredAt: AT, note: 'передоплата' }).errors,
      ).toEqual([]);
    });

    it.each([0, -1, 1.5, '100', 2_147_483_648])('refuses amountKop %p', (amountKop) => {
      expect(parse(RecordMoneyInDto, { ...ok, amountKop }).errors).not.toEqual([]);
    });

    it.each(['LIQPAY_PAYMENT', 'CASH_REFUND', 'NOPE'])('refuses kind %s', (kind) => {
      expect(parse(RecordMoneyInDto, { ...ok, kind }).errors).not.toEqual([]);
    });

    it('requires expectedUpdatedAt', () => {
      expect(parse(RecordMoneyInDto, { kind: 'BANK_TRANSFER', amountKop: 1 }).errors).not.toEqual(
        [],
      );
    });

    it('turns a blank note into null', () => {
      expect(parse(RecordMoneyInDto, { ...ok, note: '   ' }).dto.note).toBeNull();
    });
  });

  describe('RecordMoneyOutDto', () => {
    const ok = { kind: 'CASH_REFUND', amountKop: 50_000, expectedUpdatedAt: AT };

    it('accepts cash, transfer and LiqPay payouts', () => {
      expect(parse(RecordMoneyOutDto, ok).errors).toEqual([]);
      expect(
        parse(RecordMoneyOutDto, {
          ...ok,
          kind: 'LIQPAY_REFUND',
          paymentId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
          returnId: '1b4e28ba-2fa1-41d2-883f-0016d3cca428',
          reason: 'повернення',
        }).errors,
      ).toEqual([]);
    });

    it.each(['COD_NOVA_POSHTA', 'LIQPAY_PAYMENT'])('refuses the IN kind %s', (kind) => {
      expect(parse(RecordMoneyOutDto, { ...ok, kind }).errors).not.toEqual([]);
    });

    it('refuses a decimal amount', () => {
      expect(parse(RecordMoneyOutDto, { ...ok, amountKop: 499.5 }).errors).not.toEqual([]);
    });
  });

  describe('MoneyCorrectionDto', () => {
    it('requires a non-blank reason', () => {
      expect(
        parse(MoneyCorrectionDto, { reason: 'помилка', expectedUpdatedAt: AT }).errors,
      ).toEqual([]);
      expect(
        parse(MoneyCorrectionDto, { reason: '   ', expectedUpdatedAt: AT }).errors,
      ).not.toEqual([]);
      expect(parse(MoneyCorrectionDto, { expectedUpdatedAt: AT }).errors).not.toEqual([]);
    });
  });
});
