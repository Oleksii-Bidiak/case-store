import { BadRequestException } from '@nestjs/common';
import { ReportCache } from './report-cache';
import { RegistrationsReportService } from './registrations-report.service';
import { RegistrationsRepository } from './registrations.repository';

/** TASK-690: registrations, compared, with the guest→account share. */
describe('RegistrationsReportService', () => {
  const NOW = new Date('2026-09-26T11:00:00.000Z');

  function setup() {
    const repository = {
      getTotals: jest
        .fn()
        .mockResolvedValueOnce({ registrations: 12, fromGuest: 3 })
        .mockResolvedValueOnce({ registrations: 8, fromGuest: 0 }),
      getDaily: jest.fn().mockResolvedValue([{ date: '2026-09-20', registrations: 2 }]),
    };
    const cache = {
      getOrCompute: jest.fn((_parts: unknown, compute: () => Promise<unknown>) => compute()),
    };
    const service = new RegistrationsReportService(
      repository as unknown as RegistrationsRepository,
      cache as unknown as ReportCache,
    );
    return { service, repository, cache };
  }

  it('compares the chosen period with the previous one', async () => {
    const { service, repository } = setup();

    const report = await service.getRegistrationsReport({ preset: '7d' }, NOW);

    expect(repository.getTotals).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fromDay: '2026-09-20', toDay: '2026-09-26' }),
    );
    expect(repository.getTotals).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fromDay: '2026-09-13', toDay: '2026-09-19' }),
    );
    expect(report.registrations).toEqual({ current: 12, previous: 8, changePct: 50 });
    expect(report.fromGuest).toEqual({ current: 3, previous: 0, changePct: null });
    expect(report.daily).toEqual([{ date: '2026-09-20', registrations: 2 }]);
    expect(report.period).toMatchObject({ from: '2026-09-20', to: '2026-09-26', days: 7 });
  });

  it('caches it as a money-free answer', async () => {
    const { service, cache } = setup();

    await service.getRegistrationsReport({ preset: '7d' }, NOW);

    expect(cache.getOrCompute).toHaveBeenCalledWith(
      expect.objectContaining({ report: 'registrations', hasRevenue: false }),
      expect.any(Function),
    );
  });

  it('refuses an unanswerable period before touching the database', async () => {
    const { service, repository } = setup();

    await expect(
      service.getRegistrationsReport(
        { preset: 'custom', from: '2026-09-10', to: '2026-09-01' },
        NOW,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repository.getTotals).not.toHaveBeenCalled();
  });
});
