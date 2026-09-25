import { AppRepository } from './app.repository';
import type { PrismaService } from './prisma/prisma.service';

describe('AppRepository (TASK-822)', () => {
  it('pings the database with SELECT 1', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const repository = new AppRepository({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(repository.ping()).resolves.toBeUndefined();

    const [strings] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('')).toBe('SELECT 1');
  });

  it('rejects when the database does not answer', async () => {
    const repository = new AppRepository({
      $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as PrismaService);

    await expect(repository.ping()).rejects.toThrow('ECONNREFUSED');
  });
});
