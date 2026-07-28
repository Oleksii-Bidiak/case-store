import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { UserRole } from '@prisma/client';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';

const repositoryMock = {
  create: jest.fn(),
  findActorSnapshot: jest.fn(),
  findMany: jest.fn(),
};

const loggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('AuditService (TASK-318)', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AuditRepository, useValue: repositoryMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  it('NEVER throws — a failed log write must not turn a committed change into a 500', async () => {
    // By the time this runs, the mutation it describes has already committed.
    // Rethrowing would show the operator a 500 for an action that succeeded,
    // and they would retry it.
    repositoryMock.create.mockRejectedValue(new Error('audit table is gone'));

    await expect(service.record({ action: 'product.update' })).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('denormalises the actor so the entry survives the account being deleted', async () => {
    repositoryMock.findActorSnapshot.mockResolvedValue({
      email: 'manager@store.com',
      role: UserRole.MANAGER,
    });

    await service.record({ actorId: 'u1', action: 'product.update' });

    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u1',
        actorEmail: 'manager@store.com',
        actorRole: UserRole.MANAGER,
      }),
    );
  });

  it('skips the lookup when the caller already resolved the actor', async () => {
    // The guard has already read the user row on this request; a second query
    // for the same fact is waste on every admin mutation.
    await service.record({
      actorId: 'u1',
      actorEmail: 'a@store.com',
      actorRole: UserRole.ADMIN,
      action: 'product.update',
    });

    expect(repositoryMock.findActorSnapshot).not.toHaveBeenCalled();
  });

  it('writes a system action with no actor at all', async () => {
    // `AuditLog.actorId` deliberately has no FK: a cron job or payment callback
    // has no user, and the log must still record what it did.
    await service.record({ action: 'order.autoCancel', entityType: 'order', entityId: 'o1' });

    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, actorEmail: null, actorRole: null }),
    );
    expect(repositoryMock.findActorSnapshot).not.toHaveBeenCalled();
  });

  it('re-sanitises the diff even when the caller says it already did', async () => {
    // Last line before the row is written. "The caller definitely sanitised it"
    // is how secrets end up in logs.
    await service.record({
      action: 'user.setPassword',
      diff: { newPassword: { to: 'hunter2' } },
    });

    const written = repositoryMock.create.mock.calls[0][0] as { diff: unknown };
    expect(JSON.stringify(written.diff)).not.toContain('hunter2');
  });
});
