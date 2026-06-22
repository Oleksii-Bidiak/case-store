import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { AuthRepository } from './auth.repository';

describe('RefreshTokenCleanupService', () => {
  let service: RefreshTokenCleanupService;

  const authRepositoryMock = {
    deleteExpiredAndRevoked: jest.fn(),
  };

  const schedulerRegistryMock = {
    addCronJob: jest.fn(),
  };

  const pinoLoggerMock = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  };

  async function buildService(
    retentionDays: number,
    cron = '0 3 * * *',
  ): Promise<RefreshTokenCleanupService> {
    const configMock = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'REFRESH_TOKEN_REVOKED_RETENTION_DAYS') return retentionDays;
        if (key === 'REFRESH_TOKEN_CLEANUP_CRON') return cron;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenCleanupService,
        { provide: AuthRepository, useValue: authRepositoryMock },
        { provide: ConfigService, useValue: configMock },
        { provide: SchedulerRegistry, useValue: schedulerRegistryMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    return module.get<RefreshTokenCleanupService>(RefreshTokenCleanupService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('onModuleInit', () => {
    it('should register and start a cron job with the configured expression', async () => {
      service = await buildService(0, '0 4 * * *');

      service.onModuleInit();

      expect(schedulerRegistryMock.addCronJob).toHaveBeenCalledWith(
        'refresh-token-cleanup',
        expect.anything(),
      );
      const job = schedulerRegistryMock.addCronJob.mock.calls[0][1];
      expect(job.cronTime.source).toBe('0 4 * * *');
      // The created job schedules a real timer — stop it so it does not leak.
      job.stop();
    });
  });

  describe('purgeStaleTokens', () => {
    it('should call the repository with the current time and configured retention (0)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-22T03:00:00.000Z'));
      authRepositoryMock.deleteExpiredAndRevoked.mockResolvedValue(5);
      service = await buildService(0);

      await service.purgeStaleTokens();

      expect(authRepositoryMock.deleteExpiredAndRevoked).toHaveBeenCalledWith(
        new Date('2026-06-22T03:00:00.000Z'),
        0,
      );
    });

    it('should pass the configured retention window when set', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-22T03:00:00.000Z'));
      authRepositoryMock.deleteExpiredAndRevoked.mockResolvedValue(1);
      service = await buildService(7);

      await service.purgeStaleTokens();

      expect(authRepositoryMock.deleteExpiredAndRevoked).toHaveBeenCalledWith(
        new Date('2026-06-22T03:00:00.000Z'),
        7,
      );
    });

    it('should log the deleted count as a structured business event', async () => {
      authRepositoryMock.deleteExpiredAndRevoked.mockResolvedValue(3);
      service = await buildService(0);

      await service.purgeStaleTokens();

      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'refreshToken.cleanup', deletedCount: 3 }),
        expect.any(String),
      );
    });

    it('should return the deleted count from the repository', async () => {
      authRepositoryMock.deleteExpiredAndRevoked.mockResolvedValue(9);
      service = await buildService(0);

      const result = await service.purgeStaleTokens();

      expect(result).toBe(9);
    });
  });
});
