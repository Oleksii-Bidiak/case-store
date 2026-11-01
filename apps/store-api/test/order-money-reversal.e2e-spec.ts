import { NotFoundException } from '@nestjs/common';
import { MoneyDirection, MoneyEntryKind, MoneyProviderState, OrderStatus } from '@prisma/client';
import request from 'supertest';
import { moneyReversalRefusedError } from '../src/order/order.errors';
import {
  ENTRY_ID,
  ORDER_ID,
  UPDATED_AT,
  createMoneyHarness,
  settle,
} from './order-money.e2e-fixture';

/**
 * R2 A3 — correcting money, the reversal contract (replaces TASK-620's
 * «Виправити помилкову мітку» door, `POST …/payment-correction`).
 *
 * A mistake is no longer a label to lift: it is an entry to reverse (сторно) —
 * a new row of the same kind and amount, with a reason, under its own key
 * (`payments:correct`) — or, for a LiqPay refund stuck in REQUESTED, an entry
 * to void (TASK-2337). Both answer with the fresh money view and leave an
 * action-log row filed under the ORDER. The old label doors answer 404.
 */
describe('Money corrections — reversal and void (e2e, R2 A3)', () => {
  const harness = createMoneyHarness();
  const { repository, prisma } = harness;
  let server: Parameters<typeof request>[0];

  const reversalUrl = `/api/admin/orders/${ORDER_ID}/money/entries/${ENTRY_ID}/reversal`;
  const voidUrl = `/api/admin/orders/${ORDER_ID}/money/entries/${ENTRY_ID}/void`;
  const body = (extra: Record<string, unknown> = {}) => ({
    reason: 'Касир вніс суму двічі',
    expectedUpdatedAt: UPDATED_AT.toISOString(),
    ...extra,
  });

  beforeAll(async () => {
    server = (await harness.boot()).getHttpServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(() => {
    harness.reset();
    harness.state.locked.status = OrderStatus.CANCELLED;
    repository.reverseEntry.mockResolvedValue({ id: 'reversal-1', returnId: null });
    repository.findEntry.mockResolvedValue({
      id: ENTRY_ID,
      orderId: ORDER_ID,
      direction: MoneyDirection.OUT,
      kind: MoneyEntryKind.LIQPAY_REFUND,
      providerState: MoneyProviderState.REQUESTED,
      voidedAt: null,
      returnId: null,
    });
    repository.voidEntry.mockResolvedValue(true);
  });

  describe('the old label doors are gone', () => {
    it.each([
      ['PATCH', `/api/admin/orders/${ORDER_ID}/payment-status`, { paymentStatus: 'PAID' }],
      [
        'POST',
        `/api/admin/orders/${ORDER_ID}/payment-correction`,
        { paymentStatus: 'PAID', reason: 'x' },
      ],
      ['GET', `/api/admin/orders/${ORDER_ID}/allowed-payment-transitions`, undefined],
    ])('%s %s → 404', async (method, url, payload) => {
      const call =
        method === 'PATCH'
          ? request(server).patch(url)
          : method === 'POST'
            ? request(server).post(url)
            : request(server).get(url);
      await call.set('Authorization', harness.token('admin-money')).send(payload).expect(404);
    });
  });

  describe('POST …/money/entries/:entryId/reversal', () => {
    it('201 for payments:correct — reverses with the reason, under the lock, and logs it', async () => {
      const res = await request(server)
        .post(reversalUrl)
        .set('Authorization', harness.token('corrector-money'))
        .send(body())
        .expect(201);

      expect(repository.reverseEntry).toHaveBeenCalledWith(harness.tx, {
        orderId: ORDER_ID,
        entryId: ENTRY_ID,
        actorId: 'corrector-money',
        reason: 'Касир вніс суму двічі',
      });
      expect(repository.recompute).toHaveBeenCalledWith(harness.tx, ORDER_ID, 'corrector-money');
      expect(res.body.data).toMatchObject({
        orderId: ORDER_ID,
        updatedAt: UPDATED_AT.toISOString(),
      });

      await settle();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'order.reverseEntry',
            entityType: 'order',
            entityId: ORDER_ID,
          }),
        }),
      );
    });

    it.each(['refunder-money', 'writer-money', 'reader-money'] as const)(
      '403 for %s — reversing needs payments:correct',
      async (account) => {
        await request(server)
          .post(reversalUrl)
          .set('Authorization', harness.token(account))
          .send(body())
          .expect(403);
        expect(repository.reverseEntry).not.toHaveBeenCalled();
      },
    );

    it('400 for a blank or missing reason', async () => {
      for (const reason of ['   ', undefined]) {
        await request(server)
          .post(reversalUrl)
          .set('Authorization', harness.token('admin-money'))
          .send(body({ reason }))
          .expect(400);
      }
      expect(repository.reverseEntry).not.toHaveBeenCalled();
    });

    it('409 ORDER_STALE for a screen older than the order', async () => {
      const res = await request(server)
        .post(reversalUrl)
        .set('Authorization', harness.token('admin-money'))
        .send(body({ expectedUpdatedAt: '2026-10-01T00:00:00.000Z' }))
        .expect(409);
      expect(res.body.error).toBe('ORDER_STALE');
      expect(repository.reverseEntry).not.toHaveBeenCalled();
    });

    it('409 ORDER_MONEY_REVERSAL_REFUSED for a LiqPay row', async () => {
      repository.reverseEntry.mockRejectedValue(moneyReversalRefusedError('PROVIDER_ENTRY'));
      const res = await request(server)
        .post(reversalUrl)
        .set('Authorization', harness.token('admin-money'))
        .send(body())
        .expect(409);
      expect(res.body.error).toBe('ORDER_MONEY_REVERSAL_REFUSED');
    });

    it('404 for an entry of another order', async () => {
      repository.reverseEntry.mockRejectedValue(new NotFoundException('Money entry not found'));
      await request(server)
        .post(reversalUrl)
        .set('Authorization', harness.token('admin-money'))
        .send(body())
        .expect(404);
    });

    it('re-derives the return of a reversed payout', async () => {
      repository.reverseEntry.mockResolvedValue({ id: 'reversal-1', returnId: 'ret-9' });
      await request(server)
        .post(reversalUrl)
        .set('Authorization', harness.token('admin-money'))
        .send(body())
        .expect(201);
      expect(repository.syncReturnStatus).toHaveBeenCalledWith(harness.tx, 'ret-9');
    });
  });

  describe('POST …/money/entries/:entryId/void (TASK-2337)', () => {
    it('200 for payments:correct — voids the stuck REQUESTED LiqPay refund', async () => {
      await request(server)
        .post(voidUrl)
        .set('Authorization', harness.token('corrector-money'))
        .send(body({ reason: 'LiqPay відхилив, автоанулювання не спрацювало' }))
        .expect(200);

      expect(repository.voidEntry).toHaveBeenCalledWith(
        harness.tx,
        ENTRY_ID,
        'LiqPay відхилив, автоанулювання не спрацювало',
      );
      expect(repository.recompute).toHaveBeenCalled();
    });

    it('403 for payments:refund alone', async () => {
      await request(server)
        .post(voidUrl)
        .set('Authorization', harness.token('refunder-money'))
        .send(body())
        .expect(403);
      expect(repository.voidEntry).not.toHaveBeenCalled();
    });

    it('409 ORDER_MONEY_VOID_REFUSED for a confirmed refund or a cash payout', async () => {
      for (const entry of [
        { providerState: MoneyProviderState.CONFIRMED },
        { kind: MoneyEntryKind.CASH_REFUND, providerState: null },
      ]) {
        repository.findEntry.mockResolvedValue({
          id: ENTRY_ID,
          kind: MoneyEntryKind.LIQPAY_REFUND,
          voidedAt: null,
          returnId: null,
          ...entry,
        });
        const res = await request(server)
          .post(voidUrl)
          .set('Authorization', harness.token('admin-money'))
          .send(body())
          .expect(409);
        expect(res.body.error).toBe('ORDER_MONEY_VOID_REFUSED');
      }
      expect(repository.voidEntry).not.toHaveBeenCalled();
    });

    it('409 ORDER_STALE for a screen older than the order', async () => {
      const res = await request(server)
        .post(voidUrl)
        .set('Authorization', harness.token('admin-money'))
        .send(body({ expectedUpdatedAt: '2026-10-01T00:00:00.000Z' }))
        .expect(409);
      expect(res.body.error).toBe('ORDER_STALE');
    });
  });
});
