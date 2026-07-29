import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { AuditRepository } from '../src/audit';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the action log's sort contract (TASK-356).
 *
 * The log is owner-only and append-only, so the two things worth proving at this
 * level are that an unknown `sortBy` is refused outright — not defaulted, which
 * would show an operator a column header that claims an order the rows are not
 * in — and that the sort parameters change nothing about who may read it.
 *
 * AuditRepository is mocked; that the ordering reaches Prisma is covered in
 * audit.repository.spec.ts.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Admin audit log — sorting (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const owner = { id: 'admin-e2e-audit', role: 'ADMIN' as const };
  const manager = { id: 'manager-e2e-audit', role: 'MANAGER' as const };

  const auditRepositoryMock = {
    create: jest.fn(),
    findActorSnapshot: jest.fn(),
    findMany: jest.fn(),
  };

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  function auth(userId: string, role: string): string {
    return `Bearer ${jwtService.sign({ sub: userId, role }, { secret: process.env.JWT_SECRET, expiresIn: '15m' })}`;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(
        // The manager holds every grantable permission here on purpose: the
        // owner-only refusal below must come from @OwnerOnly, not from an empty
        // matrix that would pass the test for the wrong reason.
        createPermissionRepositoryMock({ grants: { MANAGER: ['newsletter:read'] } }),
      )
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(AuditRepository)
      .useValue(auditRepositoryMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    auditRepositoryMock.findMany.mockResolvedValue({ entries: [], total: 0 });
  });

  it.each(['createdAt', 'actorEmail', 'action'])(
    'accepts sortBy=%s and forwards it to the repository',
    async (sortBy) => {
      await request(app.getHttpServer())
        .get(`/api/admin/audit-log?sortBy=${sortBy}&sortOrder=asc`)
        .set('Authorization', auth(owner.id, owner.role))
        .expect(200);

      expect(auditRepositoryMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy, sortOrder: 'asc' }),
      );
    },
  );

  it('defaults to createdAt desc — the log is read as a timeline', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/audit-log')
      .set('Authorization', auth(owner.id, owner.role))
      .expect(200);

    expect(auditRepositoryMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc' }),
    );
  });

  it('rejects an unknown sortBy with 400 — never a 500, never a silent default', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/audit-log?sortBy=diff')
      .set('Authorization', auth(owner.id, owner.role))
      .expect(400);

    expect(JSON.stringify(response.body)).toContain('sortBy must be one of');
    expect(auditRepositoryMock.findMany).not.toHaveBeenCalled();
  });

  it('rejects entityType as a sort field — the column it maps to is a type/id pair', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/audit-log?sortBy=entityType')
      .set('Authorization', auth(owner.id, owner.role))
      .expect(400);
  });

  it('rejects an unknown sortOrder with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/audit-log?sortBy=action&sortOrder=descending')
      .set('Authorization', auth(owner.id, owner.role))
      .expect(400);

    expect(auditRepositoryMock.findMany).not.toHaveBeenCalled();
  });

  it('rejects a misspelled sort parameter rather than ignoring it', async () => {
    // `forbidNonWhitelisted` turns the typo into a 400. Silently dropping it
    // would return the default order under a header claiming another.
    await request(app.getHttpServer())
      .get('/api/admin/audit-log?sortField=action')
      .set('Authorization', auth(owner.id, owner.role))
      .expect(400);

    expect(auditRepositoryMock.findMany).not.toHaveBeenCalled();
  });

  it('composes the sort with the actor filter — "everything this admin did", in order', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/audit-log?actorId=admin-7&sortBy=action&sortOrder=asc&limit=25&page=2')
      .set('Authorization', auth(owner.id, owner.role))
      .expect(200);

    expect(auditRepositoryMock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-7',
        page: 2,
        limit: 25,
        sortBy: 'action',
        sortOrder: 'asc',
      }),
    );
  });

  it('still refuses a MANAGER, sort parameters or not — @OwnerOnly runs before validation', async () => {
    // Guards run ahead of pipes, so even the invalid value answers 403 rather
    // than a 400 that would confirm the route and hand over its allow-list.
    await request(app.getHttpServer())
      .get('/api/admin/audit-log?sortBy=actorEmail')
      .set('Authorization', auth(manager.id, manager.role))
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/admin/audit-log?sortBy=nonsense')
      .set('Authorization', auth(manager.id, manager.role))
      .expect(403);

    expect(auditRepositoryMock.findMany).not.toHaveBeenCalled();
  });
});
