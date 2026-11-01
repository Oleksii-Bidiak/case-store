import {
  DeliveryMethod,
  MoneyEntryKind,
  OrderStatus,
  ReturnDecision,
  ReturnStatus,
} from '@prisma/client';
import request from 'supertest';
import {
  ORDER_ID,
  RETURN_ID,
  UPDATED_AT,
  createMoneyHarness,
  settle,
} from './order-money.e2e-fixture';

/**
 * R2 A3 — the order's money from one place (TASK-2047, TASK-2046, TASK-951,
 * TASK-1967): `GET /api/admin/orders/:orderId/money`, `POST …/money/in`,
 * `POST …/money/out`.
 *
 * The permission matrix on the door (AD-RET-16/23: a payout for a return
 * crosses two domains and needs both keys), the validation of integer kopecks,
 * the optimistic lock, the stable refusal codes, and the action log filed
 * under the order. `OrderMoneyRepository` is the double; the rules are real.
 */
describe('Admin order money — receipts and payouts (e2e, R2 A3)', () => {
  const harness = createMoneyHarness();
  const { repository, prisma } = harness;
  let server: Parameters<typeof request>[0];

  const moneyUrl = `/api/admin/orders/${ORDER_ID}/money`;
  const fresh = UPDATED_AT.toISOString();

  beforeAll(async () => {
    server = (await harness.boot()).getHttpServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(() => {
    harness.reset();
  });

  describe('GET …/money', () => {
    it('200 for orders:read — totals, allowed receipt kinds and the lock token', async () => {
      const res = await request(server)
        .get(moneyUrl)
        .set('Authorization', harness.token('reader-money'))
        .expect(200);

      expect(res.body.data).toMatchObject({
        orderId: ORDER_ID,
        orderStatus: OrderStatus.DELIVERED,
        updatedAt: fresh,
        totals: { totalKop: 129_900, paidKop: 0, refundedKop: 0, balanceKop: 129_900 },
        allowedInKinds: [MoneyEntryKind.COD_NOVA_POSHTA, MoneyEntryKind.BANK_TRANSFER],
        outWithoutReturnMaxKop: 0,
        entries: [],
        returns: [],
      });
      // No payments:read → the refundable LiqPay attempts are withheld.
      expect(res.body.data.refundablePayments).toBeNull();
    });

    it('shows the refundable attempts to a payments:read holder', async () => {
      const res = await request(server)
        .get(moneyUrl)
        .set('Authorization', harness.token('payreader-money'))
        .expect(200);
      expect(res.body.data.refundablePayments).toEqual([]);
    });

    it('403 without orders:read', async () => {
      await request(server)
        .get(moneyUrl)
        .set('Authorization', harness.token('returns-reader-money'))
        .expect(403);
    });

    it('401 without a token', async () => {
      await request(server).get(moneyUrl).expect(401);
    });
  });

  describe('POST …/money/in', () => {
    const receipt = (extra: Record<string, unknown> = {}) => ({
      kind: MoneyEntryKind.COD_NOVA_POSHTA,
      amountKop: 129_900,
      expectedUpdatedAt: fresh,
      ...extra,
    });

    it('201 for orders:write — the receipt is written, recomputed and logged under the order', async () => {
      await request(server)
        .post(`${moneyUrl}/in`)
        .set('Authorization', harness.token('writer-money'))
        .send(receipt())
        .expect(201);

      expect(repository.insertEntry).toHaveBeenCalledWith(
        harness.tx,
        expect.objectContaining({
          kind: MoneyEntryKind.COD_NOVA_POSHTA,
          amountKop: 129_900,
          actorId: 'writer-money',
        }),
      );
      expect(repository.recompute).toHaveBeenCalledWith(harness.tx, ORDER_ID, 'writer-money');

      await settle();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'order.recordReceipt',
            entityType: 'order',
            entityId: ORDER_ID,
          }),
        }),
      );
    });

    it('201 for a part payment with its own date', async () => {
      await request(server)
        .post(`${moneyUrl}/in`)
        .set('Authorization', harness.token('writer-money'))
        .send(
          receipt({
            kind: MoneyEntryKind.BANK_TRANSFER,
            amountKop: 50_000,
            occurredAt: '2026-10-30T09:00:00.000Z',
            note: 'передоплата',
          }),
        )
        .expect(201);

      expect(repository.insertEntry).toHaveBeenCalledWith(
        harness.tx,
        expect.objectContaining({
          amountKop: 50_000,
          reason: 'передоплата',
          occurredAt: new Date('2026-10-30T09:00:00.000Z'),
        }),
      );
    });

    it.each(['reader-money', 'refunder-money', 'corrector-money'] as const)(
      '403 for %s — receipts need orders:write',
      async (account) => {
        await request(server)
          .post(`${moneyUrl}/in`)
          .set('Authorization', harness.token(account))
          .send(receipt())
          .expect(403);
        expect(repository.insertEntry).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['a decimal amount', { amountKop: 1299.5 }],
      ['zero', { amountKop: 0 }],
      ['LIQPAY_PAYMENT by hand', { kind: MoneyEntryKind.LIQPAY_PAYMENT }],
      ['no expectedUpdatedAt', { expectedUpdatedAt: undefined }],
      ['an unknown field', { paymentStatus: 'PAID' }],
    ])('400 for %s', async (_name, extra) => {
      await request(server)
        .post(`${moneyUrl}/in`)
        .set('Authorization', harness.token('admin-money'))
        .send(receipt(extra))
        .expect(400);
      expect(repository.insertEntry).not.toHaveBeenCalled();
    });

    it('400 ORDER_MONEY_IN_KIND_NOT_ALLOWED for «Гроші від НП» on a pickup (TASK-1807)', async () => {
      harness.state.locked.deliveryMethod = DeliveryMethod.PICKUP;
      const res = await request(server)
        .post(`${moneyUrl}/in`)
        .set('Authorization', harness.token('admin-money'))
        .send(receipt())
        .expect(400);
      expect(res.body.error).toBe('ORDER_MONEY_IN_KIND_NOT_ALLOWED');
    });

    it('400 ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED, 201 with a note', async () => {
      harness.state.basis.paidKop = 129_900;
      const res = await request(server)
        .post(`${moneyUrl}/in`)
        .set('Authorization', harness.token('admin-money'))
        .send(receipt({ amountKop: 100 }))
        .expect(400);
      expect(res.body.error).toBe('ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED');

      await request(server)
        .post(`${moneyUrl}/in`)
        .set('Authorization', harness.token('admin-money'))
        .send(receipt({ amountKop: 100, note: 'Покупець переплатив' }))
        .expect(201);
    });

    it('409 ORDER_STALE for a screen older than the order', async () => {
      const res = await request(server)
        .post(`${moneyUrl}/in`)
        .set('Authorization', harness.token('admin-money'))
        .send(receipt({ expectedUpdatedAt: '2026-10-01T00:00:00.000Z' }))
        .expect(409);
      expect(res.body.error).toBe('ORDER_STALE');
      expect(repository.insertEntry).not.toHaveBeenCalled();
    });
  });

  describe('POST …/money/out', () => {
    const payout = (extra: Record<string, unknown> = {}) => ({
      kind: MoneyEntryKind.CASH_REFUND,
      amountKop: 40_000,
      expectedUpdatedAt: fresh,
      reason: 'Замовлення скасовано',
      ...extra,
    });

    beforeEach(() => {
      harness.state.basis.paidKop = 129_900;
      harness.state.basis.returns = [
        {
          id: RETURN_ID,
          status: ReturnStatus.RECEIVED,
          decision: ReturnDecision.REFUND,
          creditKop: 40_000,
          paidOutKop: 0,
        },
      ];
    });

    it('201 for payments:refund on a cancelled order, no return needed', async () => {
      harness.state.locked.status = OrderStatus.CANCELLED;
      await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('refunder-money'))
        .send(payout())
        .expect(201);
      expect(repository.insertEntry).toHaveBeenCalledWith(
        harness.tx,
        expect.objectContaining({ kind: MoneyEntryKind.CASH_REFUND, returnId: null }),
      );
    });

    // R2 pre-merge review: without a return, the reason is the only «why».
    it('400 ORDER_MONEY_PAYOUT_REASON_REQUIRED without a return and without a reason', async () => {
      harness.state.locked.status = OrderStatus.CANCELLED;
      const res = await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('refunder-money'))
        .send(payout({ reason: '  ' }))
        .expect(400);
      expect(res.body).toMatchObject({ error: 'ORDER_MONEY_PAYOUT_REASON_REQUIRED' });
      expect(repository.insertEntry).not.toHaveBeenCalled();
    });

    it('403 for payments:refund alone when the payout settles a return (AD-RET-16/23)', async () => {
      await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('refunder-money'))
        .send(payout({ returnId: RETURN_ID }))
        .expect(403);
      expect(repository.insertEntry).not.toHaveBeenCalled();
    });

    it('403 for returns:write alone', async () => {
      await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('returns-writer-money'))
        .send(payout({ returnId: RETURN_ID }))
        .expect(403);
    });

    it('201 for payments:refund + returns:write — the return is re-derived', async () => {
      await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('refunder-returns-money'))
        .send(payout({ returnId: RETURN_ID, kind: MoneyEntryKind.TRANSFER_REFUND }))
        .expect(201);
      expect(repository.insertEntry).toHaveBeenCalledWith(
        harness.tx,
        expect.objectContaining({ returnId: RETURN_ID, kind: MoneyEntryKind.TRANSFER_REFUND }),
      );
      expect(repository.syncReturnStatus).toHaveBeenCalledWith(harness.tx, RETURN_ID);

      await settle();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'order.recordPayout', entityType: 'order' }),
        }),
      );
    });

    it('403 for orders:write — receipts are not payouts', async () => {
      await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('writer-money'))
        .send(payout())
        .expect(403);
    });

    it.each([
      [OrderStatus.DELIVERED, 'ORDER_MONEY_RETURN_REQUIRED'],
      [OrderStatus.CONFIRMED, 'ORDER_MONEY_ORDER_LIVE'],
    ])('409 without a return on a %s order: %s', async (status, code) => {
      harness.state.basis.returns = [];
      harness.state.locked.status = status;
      const res = await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('admin-money'))
        .send(payout())
        .expect(409);
      expect(res.body.error).toBe(code);
      expect(repository.insertEntry).not.toHaveBeenCalled();
    });

    it('409 ORDER_MONEY_REFUND_EXCEEDS_PAID over what the return still owes', async () => {
      const res = await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('admin-money'))
        .send(payout({ returnId: RETURN_ID, amountKop: 40_001 }))
        .expect(409);
      expect(res.body.error).toBe('ORDER_MONEY_REFUND_EXCEEDS_PAID');
    });

    it('409 ORDER_MONEY_NOTHING_PAID on an unpaid order — the goods may come back, money cannot go', async () => {
      harness.state.basis.paidKop = 0;
      const res = await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('admin-money'))
        .send(payout({ returnId: RETURN_ID }))
        .expect(409);
      expect(res.body.error).toBe('ORDER_MONEY_NOTHING_PAID');
    });

    it('409 ORDER_STALE for a screen older than the order', async () => {
      const res = await request(server)
        .post(`${moneyUrl}/out`)
        .set('Authorization', harness.token('admin-money'))
        .send(payout({ returnId: RETURN_ID, expectedUpdatedAt: '2026-10-01T00:00:00.000Z' }))
        .expect(409);
      expect(res.body.error).toBe('ORDER_STALE');
    });

    it('400 for an IN kind or a decimal amount', async () => {
      for (const extra of [{ kind: MoneyEntryKind.COD_NOVA_POSHTA }, { amountKop: 399.99 }]) {
        await request(server)
          .post(`${moneyUrl}/out`)
          .set('Authorization', harness.token('admin-money'))
          .send(payout(extra))
          .expect(400);
      }
      expect(repository.insertEntry).not.toHaveBeenCalled();
    });
  });
});
