import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppService', () => {
  const buildService = (queryRaw: jest.Mock) =>
    new AppService({ $queryRaw: queryRaw } as unknown as PrismaService);

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
});
