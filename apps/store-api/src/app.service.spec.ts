import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import type { ThrottlerRedisHealth, ThrottlerStoreStatus } from './throttler';

describe('AppService', () => {
  const throttlerHealth = (status: ThrottlerStoreStatus): ThrottlerRedisHealth =>
    ({ status, isDegraded: status === 'down' }) as unknown as ThrottlerRedisHealth;

  const buildService = (queryRaw: jest.Mock, rateLimitStore: ThrottlerStoreStatus = 'disabled') =>
    new AppService(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      throttlerHealth(rateLimitStore),
    );

  describe('health', () => {
    it('reports ok when the database answers', async () => {
      const service = buildService(jest.fn().mockResolvedValue([{ '?column?': 1 }]));

      const result = await service.health();

      expect(result.status).toBe('ok');
      expect(result.checks.database).toBe('up');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.uptime).toBe('number');
    });

    it('reports error when the database is unreachable', async () => {
      const service = buildService(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const result = await service.health();

      expect(result.status).toBe('error');
      expect(result.checks.database).toBe('down');
    });

    it('reports error — instead of hanging — when the database never answers', async () => {
      jest.useFakeTimers();
      const service = buildService(jest.fn().mockReturnValue(new Promise(() => {})));

      const pending = service.health();
      await jest.advanceTimersByTimeAsync(3_000);
      const result = await pending;

      expect(result.status).toBe('error');
      expect(result.checks.database).toBe('down');
      jest.useRealTimers();
    });
  });

  /**
   * TASK-401. The probe used to answer `ok` while the rate limiter was entirely
   * off — that is how a misconfigured `REDIS_PASSWORD` survived a whole demo run
   * unnoticed. The state is reported now, but it deliberately does NOT make the
   * probe red: `status: 'error'` means 503, which Docker reads as unhealthy and
   * Caddy as "pull this container", so a Redis blip would take down pages the
   * API can still serve, and no restart could fix it.
   */
  describe('rate-limit store', () => {
    const up = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

    it('is reported as `disabled` — not degraded — when Redis is not configured', async () => {
      const result = await buildService(up, 'disabled').health();

      expect(result.checks.rateLimitStore).toBe('disabled');
      expect(result.degraded).toBe(false);
      expect(result.status).toBe('ok');
    });

    it('is reported as `up` when Redis answered', async () => {
      const result = await buildService(up, 'up').health();

      expect(result.checks.rateLimitStore).toBe('up');
      expect(result.degraded).toBe(false);
    });

    it('marks the service degraded — but still ok — when Redis is unreachable', async () => {
      const result = await buildService(up, 'down').health();

      expect(result.checks.rateLimitStore).toBe('down');
      expect(result.degraded).toBe(true);
      expect(result.status).toBe('ok');
    });
  });
});
