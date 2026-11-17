import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MoneyDirection, MoneyEntryKind, MoneyProviderState, UserRole } from '@prisma/client';
import {
  PermissionRepository,
  PermissionService,
  type PermissionActor,
} from '../../auth/permissions';
import { MoneyFlowReportService } from './money-flow-report.service';
import {
  MoneyFlowRepository,
  type MoneyBalances,
  type MoneyFlowEntryRow,
  type MoneyFlowKindTotals,
} from './money-flow.repository';

/**
 * «Рух коштів» (TASK-2395): what the service builds from the repository's raw
 * per-kind sums — the fixed 8-row breakdown, the IN/OUT/net totals with their
 * comparison, the as-of-now balances — and who may read it. The SQL behind the
 * sums is pinned on a real database in
 * `test/analytics-money-flow.repository.int-spec.ts`.
 */
describe('MoneyFlowReportService (TASK-2395)', () => {
  const NOW = new Date('2026-09-26T12:00:00.000Z');
  const AUGUST = { preset: 'custom' as const, from: '2026-08-01', to: '2026-08-31' };
  const BAD_PERIOD = { preset: 'custom' as const, from: '2026-09-10', to: '2026-09-01' };
  const ACCOUNTANT: PermissionActor = {
    id: 'manager-1',
    email: 'manager@example.com',
    role: UserRole.MANAGER,
    isOwner: false,
    permissions: new Set(['analytics:read', 'analytics:revenue', 'payments:read']),
  };

  const BALANCES: MoneyBalances = {
    debt: { orders: 2, kop: 150_000 },
    owedToCustomer: { orders: 1, kop: 2_500 },
  };

  const repository = {
    getByKind: jest.fn<Promise<MoneyFlowKindTotals[]>, [unknown]>(),
    getBalances: jest.fn<Promise<MoneyBalances>, []>(),
    findEntries: jest.fn<
      Promise<{ rows: MoneyFlowEntryRow[]; total: number }>,
      [unknown, unknown]
    >(),
  };

  let service: MoneyFlowReportService;

  function kindRow(
    kind: MoneyEntryKind,
    direction: MoneyDirection,
    over: Partial<MoneyFlowKindTotals> = {},
  ): MoneyFlowKindTotals {
    const grossKop = over.grossKop ?? 0;
    const reversedKop = over.reversedKop ?? 0;
    return {
      kind,
      direction,
      grossKop,
      reversedKop,
      netKop: grossKop - reversedKop,
      count: over.count ?? 1,
      requestedKop: over.requestedKop ?? 0,
    };
  }

  /** Hand `current` to the requested range and `previous` to the comparison. */
  function byKind(current: MoneyFlowKindTotals[], previous: MoneyFlowKindTotals[]) {
    repository.getByKind.mockImplementation(async (range) =>
      (range as { fromDay: string }).fromDay === AUGUST.from ? current : previous,
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    repository.getByKind.mockResolvedValue([]);
    repository.getBalances.mockResolvedValue(BALANCES);
    repository.findEntries.mockResolvedValue({ rows: [], total: 0 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        MoneyFlowReportService,
        // The real level rules (owner/ADMIN by level, MANAGER by key).
        PermissionService,
        { provide: PermissionRepository, useValue: {} },
        { provide: MoneyFlowRepository, useValue: repository },
      ],
    }).compile();
    service = moduleRef.get(MoneyFlowReportService);
  });

  describe('permissions — both rights, checked before the period', () => {
    it.each([
      ['analytics:revenue', ['analytics:read', 'payments:read']],
      ['payments:read', ['analytics:read', 'analytics:revenue']],
    ])('refuses a reader without %s, even for an unanswerable period', async (_, held) => {
      const actor = { ...ACCOUNTANT, permissions: new Set(held) };

      await expect(service.getMoneyFlowReport(BAD_PERIOD, actor, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.getMoneyFlowEntries({ ...BAD_PERIOD, page: 1, limit: 50 }, actor, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.getByKind).not.toHaveBeenCalled();
      expect(repository.getBalances).not.toHaveBeenCalled();
      expect(repository.findEntries).not.toHaveBeenCalled();
    });

    it('answers the owner without any explicit grant', async () => {
      const owner = { ...ACCOUNTANT, isOwner: true, permissions: new Set<string>() };

      await expect(service.getMoneyFlowReport(AUGUST, owner, NOW)).resolves.toBeDefined();
    });

    it('lets the resolver’s 400 through for a permitted reader, without a query', async () => {
      await expect(service.getMoneyFlowReport(BAD_PERIOD, ACCOUNTANT, NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.getByKind).not.toHaveBeenCalled();
    });
  });

  describe('the breakdown', () => {
    it('is always the 8 ledger kinds, IN kinds then OUT kinds, zeros included', async () => {
      byKind(
        [
          kindRow(MoneyEntryKind.CASH_REFUND, MoneyDirection.OUT, { grossKop: 5_000 }),
          kindRow(MoneyEntryKind.COD_NOVA_POSHTA, MoneyDirection.IN, {
            grossKop: 100_000,
            reversedKop: 10_000,
            count: 3,
          }),
        ],
        [],
      );

      const report = await service.getMoneyFlowReport(AUGUST, ACCOUNTANT, NOW);

      expect(report.rows.map((row) => [row.kind, row.direction])).toEqual([
        [MoneyEntryKind.LIQPAY_PAYMENT, MoneyDirection.IN],
        [MoneyEntryKind.COD_NOVA_POSHTA, MoneyDirection.IN],
        [MoneyEntryKind.PAID_AT_POINT, MoneyDirection.IN],
        [MoneyEntryKind.PAID_TO_COURIER, MoneyDirection.IN],
        [MoneyEntryKind.BANK_TRANSFER, MoneyDirection.IN],
        [MoneyEntryKind.LIQPAY_REFUND, MoneyDirection.OUT],
        [MoneyEntryKind.CASH_REFUND, MoneyDirection.OUT],
        [MoneyEntryKind.TRANSFER_REFUND, MoneyDirection.OUT],
      ]);
      expect(report.rows[0]).toEqual({
        kind: MoneyEntryKind.LIQPAY_PAYMENT,
        direction: MoneyDirection.IN,
        grossKop: 0,
        reversedKop: 0,
        netKop: 0,
        count: 0,
        requestedKop: 0,
      });
      expect(report.rows[1]).toEqual({
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        direction: MoneyDirection.IN,
        grossKop: 100_000,
        reversedKop: 10_000,
        netKop: 90_000,
        count: 3,
        requestedKop: 0,
      });
    });

    it('asks for the chosen range and its comparison', async () => {
      const report = await service.getMoneyFlowReport(AUGUST, ACCOUNTANT, NOW);

      const asked = repository.getByKind.mock.calls.map(([range]) => range);
      expect(asked).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fromDay: '2026-08-01', toDay: '2026-08-31' }),
          expect.objectContaining({ fromDay: '2026-07-01', toDay: '2026-07-31' }),
        ]),
      );
      expect(report.period).toEqual({
        preset: 'custom',
        from: '2026-08-01',
        to: '2026-08-31',
        days: 31,
        previousFrom: '2026-07-01',
        previousTo: '2026-07-31',
        previousDays: 31,
      });
    });
  });

  describe('the totals', () => {
    it('sums IN and OUT net of reversals, with net = in − out, compared with the previous range', async () => {
      byKind(
        [
          kindRow(MoneyEntryKind.LIQPAY_PAYMENT, MoneyDirection.IN, { grossKop: 200_000 }),
          kindRow(MoneyEntryKind.BANK_TRANSFER, MoneyDirection.IN, {
            grossKop: 50_000,
            reversedKop: 50_000,
          }),
          kindRow(MoneyEntryKind.LIQPAY_REFUND, MoneyDirection.OUT, {
            grossKop: 30_000,
            requestedKop: 10_000,
          }),
          kindRow(MoneyEntryKind.CASH_REFUND, MoneyDirection.OUT, {
            grossKop: 0,
            reversedKop: 5_000,
          }),
        ],
        [kindRow(MoneyEntryKind.COD_NOVA_POSHTA, MoneyDirection.IN, { grossKop: 100_000 })],
      );

      const report = await service.getMoneyFlowReport(AUGUST, ACCOUNTANT, NOW);

      expect(report.totals).toEqual({
        inKop: { current: 200_000, previous: 100_000, changePct: 100 },
        // 30 000 out, minus a 5 000 cash reversal dated in August.
        outKop: { current: 25_000, previous: 0, changePct: null },
        netKop: { current: 175_000, previous: 100_000, changePct: 75 },
        requestedOutKop: { current: 10_000, previous: 0, changePct: null },
      });
    });

    it('carries the as-of-now balances, whatever the period', async () => {
      const report = await service.getMoneyFlowReport(AUGUST, ACCOUNTANT, NOW);

      expect(repository.getBalances).toHaveBeenCalledTimes(1);
      expect(report.balances).toEqual(BALANCES);
    });

    it('returns plain JSON', async () => {
      byKind([kindRow(MoneyEntryKind.LIQPAY_PAYMENT, MoneyDirection.IN, { grossKop: 1 })], []);

      const report = await service.getMoneyFlowReport(AUGUST, ACCOUNTANT, NOW);

      expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    });
  });

  describe('the register', () => {
    const ROW: MoneyFlowEntryRow = {
      id: 'entry-1',
      occurredAt: new Date('2026-08-05T10:00:00Z'),
      createdAt: new Date('2026-08-05T10:01:00Z'),
      orderId: 'abcdef12-0000-0000-0000-000000000000',
      orderNumber: 'ABCDEF12',
      direction: MoneyDirection.OUT,
      kind: MoneyEntryKind.LIQPAY_REFUND,
      amountKop: 10_000,
      signedKop: 10_000,
      isReversal: false,
      reversalOfId: null,
      providerState: MoneyProviderState.REQUESTED,
      legacy: false,
      actorName: null,
      reason: null,
    };

    it('passes the chosen range, kind and page through and returns the page with its counters', async () => {
      repository.findEntries.mockResolvedValue({ rows: [ROW], total: 120 });

      const page = await service.getMoneyFlowEntries(
        { ...AUGUST, kind: MoneyEntryKind.LIQPAY_REFUND, page: 3, limit: 50 },
        ACCOUNTANT,
        NOW,
      );

      expect(repository.findEntries).toHaveBeenCalledWith(
        expect.objectContaining({ fromDay: '2026-08-01', toDay: '2026-08-31' }),
        { kind: MoneyEntryKind.LIQPAY_REFUND, page: 3, limit: 50 },
      );
      expect(page.meta).toEqual({ total: 120, page: 3, limit: 50, totalPages: 3 });
      expect(page.items).toEqual([{ ...ROW, requested: true }]);
    });

    it('defaults to the first page of 50', async () => {
      const page = await service.getMoneyFlowEntries(AUGUST, ACCOUNTANT, NOW);

      expect(repository.findEntries).toHaveBeenCalledWith(expect.anything(), {
        kind: undefined,
        page: 1,
        limit: 50,
      });
      expect(page.meta).toEqual({ total: 0, page: 1, limit: 50, totalPages: 0 });
    });
  });
});
