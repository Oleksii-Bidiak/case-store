import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AppController } from './app.controller';
import { AppService, type HealthCheckResult } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let health: jest.Mock<Promise<HealthCheckResult>, []>;
  let response: Response;

  beforeEach(async () => {
    health = jest.fn();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: { health } }],
    }).compile();

    appController = app.get<AppController>(AppController);
    response = { status: jest.fn() } as unknown as Response;
  });

  describe('health', () => {
    it('leaves the status at 200 when the database is up', async () => {
      health.mockResolvedValue({
        status: 'ok',
        degraded: false,
        timestamp: new Date().toISOString(),
        uptime: 1,
        checks: { database: 'up', rateLimitStore: 'up' },
      });

      const result = (await appController.health(response)) as HealthCheckResult;

      expect(result.status).toBe('ok');
      expect(response.status).not.toHaveBeenCalled();
    });

    it('responds 503 when the database is down', async () => {
      health.mockResolvedValue({
        status: 'error',
        degraded: false,
        timestamp: new Date().toISOString(),
        uptime: 1,
        checks: { database: 'down', rateLimitStore: 'up' },
      });

      const result = (await appController.health(response)) as HealthCheckResult;

      expect(result.checks.database).toBe('down');
      expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    // TASK-401: an unreachable rate-limit store is reported, not fatal. The
    // controller must keep the probe at 200 — a 503 here takes the container out
    // of rotation over a dependency a restart cannot fix.
    it('stays 200 when only the rate-limit store is down', async () => {
      health.mockResolvedValue({
        status: 'ok',
        degraded: true,
        timestamp: new Date().toISOString(),
        uptime: 1,
        checks: { database: 'up', rateLimitStore: 'down' },
      });

      const result = (await appController.health(response)) as HealthCheckResult;

      expect(result.degraded).toBe(true);
      expect(result.checks.rateLimitStore).toBe('down');
      expect(response.status).not.toHaveBeenCalled();
    });
  });
});
