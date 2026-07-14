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
        timestamp: new Date().toISOString(),
        uptime: 1,
        checks: { database: 'up' },
      });

      const result = (await appController.health(response)) as HealthCheckResult;

      expect(result.status).toBe('ok');
      expect(response.status).not.toHaveBeenCalled();
    });

    it('responds 503 when the database is down', async () => {
      health.mockResolvedValue({
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: 1,
        checks: { database: 'down' },
      });

      const result = (await appController.health(response)) as HealthCheckResult;

      expect(result.checks.database).toBe('down');
      expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });
  });
});
