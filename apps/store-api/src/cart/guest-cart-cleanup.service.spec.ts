import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { GuestCartCleanupService } from './guest-cart-cleanup.service';
import { CartRepository } from './cart.repository';
import { GUEST_CART_CLEANUP_CRON, GUEST_CART_EMPTY_RETENTION_MS } from './cart.constants';

describe('GuestCartCleanupService (TASK-776)', () => {
  const cartRepositoryMock = {
    deleteStaleEmptyGuestCarts: jest.fn(),
  };

  const schedulerRegistryMock = {
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
  };

  const pinoLoggerMock = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  };

  async function buildService(schedulerEnabled?: string): Promise<GuestCartCleanupService> {
    const configMock = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key === 'SCHEDULER_ENABLED' ? schedulerEnabled : defaultValue,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestCartCleanupService,
        { provide: CartRepository, useValue: cartRepositoryMock },
        { provide: ConfigService, useValue: configMock },
        { provide: SchedulerRegistry, useValue: schedulerRegistryMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    return module.get(GuestCartCleanupService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('onModuleInit', () => {
    it('registers and starts the cron job on the fixed schedule', async () => {
      const service = await buildService();

      service.onModuleInit();

      expect(schedulerRegistryMock.addCronJob).toHaveBeenCalledWith(
        'guest-cart-cleanup',
        expect.anything(),
      );
      const job = schedulerRegistryMock.addCronJob.mock.calls[0][1];
      expect(job.cronTime.source).toBe(GUEST_CART_CLEANUP_CRON);
      // The job schedules a real timer — stop it so it does not leak.
      job.stop();
    });

    it('registers nothing when scheduling is disabled (SCHEDULER_ENABLED=false)', async () => {
      const service = await buildService('false');

      service.onModuleInit();

      expect(schedulerRegistryMock.addCronJob).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('stops and unregisters the job', async () => {
      const service = await buildService();

      service.onModuleDestroy();

      expect(schedulerRegistryMock.deleteCronJob).toHaveBeenCalledWith('guest-cart-cleanup');
    });
  });

  describe('purgeStaleEmptyGuestCarts', () => {
    it('deletes empty guest carts last touched before now minus the retention window', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-24T03:30:00.000Z'));
      cartRepositoryMock.deleteStaleEmptyGuestCarts.mockResolvedValue(12);
      const service = await buildService();

      const deleted = await service.purgeStaleEmptyGuestCarts();

      expect(deleted).toBe(12);
      expect(cartRepositoryMock.deleteStaleEmptyGuestCarts).toHaveBeenCalledWith(
        new Date(new Date('2026-09-24T03:30:00.000Z').getTime() - GUEST_CART_EMPTY_RETENTION_MS),
      );
      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'cart.guestCleanup', deletedCount: 12 }),
        expect.any(String),
      );
    });
  });
});
