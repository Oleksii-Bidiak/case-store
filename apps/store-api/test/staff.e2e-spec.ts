import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { AuthService } from '../src/auth/auth.service';
import { UserRepository } from '../src/user/user.repository';
import { StaffRepository } from '../src/staff/staff.repository';
import { PrismaService } from '../src/prisma';
import { PermissionGrantRepository, PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * «Персонал» over HTTP — invariants 2 and 3 of plan 181, door by door (TASK-476).
 *
 * `staff.service.spec.ts` proves the rules against the service; this suite proves
 * the ROUTES are wired to them: the right guard, the right permission key, the
 * actor taken from the guard's database read rather than from the token, and the
 * status code an operator actually sees.
 *
 * The callers are ids, and the shared double reads the level out of the id — which
 * is why both admins are spelled `admin-…`: `roleFromTestUserId` matches `/admin/i`
 * and an id that does not announce itself resolves to CUSTOMER, so a "deputy" named
 * `deputy-staff-1` would silently be a shopper and every assertion below would pass
 * for the wrong reason. `isOwnerFor` then picks exactly one of the two as the
 * account that owns the shop. `manager-staff-1` stands for EVERY manager, since
 * `staff:read` / `staff:write` are non-grantable and held by nobody below admin.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Staff (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const owner = { id: 'admin-owner-staff-1', role: 'ADMIN' as const };
  const deputy = { id: 'admin-deputy-staff-1', role: 'ADMIN' as const };
  const manager = { id: 'manager-staff-1', role: 'MANAGER' as const };
  const customer = { id: 'customer-staff-1', role: 'CUSTOMER' as const };

  const permissionRepositoryMock = createPermissionRepositoryMock({
    // A manager with a real permission, to prove the refusals below are about the
    // STAFF keys rather than about holding nothing at all.
    grants: { MANAGER: ['products:read', 'products:write', 'customers:read', 'customers:write'] },
    isOwnerFor: (userId) => userId === owner.id,
  });

  // ── Rows the staff repository hands back ───────────────────────────────────

  const row = (over: Record<string, unknown>) => ({
    id: 'x',
    email: 'x@example.com',
    passwordHash: '$argon2id$hash',
    firstName: null,
    lastName: null,
    phone: null,
    role: 'MANAGER',
    isOwner: false,
    isActive: true,
    originalEmail: null,
    deletedAt: null,
    emailVerifiedAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  });

  const managerRow = row({ id: 'target-manager', email: 'manager@example.com' });
  const adminRow = row({ id: 'target-admin', email: 'admin2@example.com', role: 'ADMIN' });
  const ownerRow = row({
    id: owner.id,
    email: 'owner@example.com',
    role: 'ADMIN',
    isOwner: true,
  });

  const account = (user: ReturnType<typeof row>) => ({
    user,
    permissionCount: 2,
    lastSeenAt: new Date('2026-02-01T00:00:00.000Z'),
  });

  const staffRepositoryMock = {
    findAll: jest.fn(),
    findStaffById: jest.fn(),
    create: jest.fn(),
    updateRole: jest.fn(),
    transferOwnership: jest.fn(),
  };

  const userRepositoryMock = {
    findById: jest.fn(),
    findCustomerById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
    softDelete: jest.fn(),
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

  // Overridden wholesale: the password reset must be observable as "the shared
  // self-service path was called", not re-implemented here.
  const authServiceMock = {
    setPassword: jest.fn().mockResolvedValue(undefined),
    verifyOwnPassword: jest.fn().mockResolvedValue(undefined),
  };
  const reviewRepositoryStub = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) };

  /**
   * The one writer of `user_permissions`. Overridden here rather than driven
   * through the Prisma mock because this suite is about the DOORS: what matters
   * is that demoting somebody off the staff calls the clear, not how the rows are
   * deleted. `staff-permissions.e2e-spec.ts` owns the store-backed version.
   */
  const permissionGrantRepositoryMock = {
    findByUserId: jest.fn().mockResolvedValue([]),
    replaceForUser: jest.fn().mockResolvedValue([]),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    review: reviewRepositoryStub,
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  function token(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }

  const auth = (who: { id: string; role: string }) => `Bearer ${token(who.id, who.role)}`;

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
      .useValue(permissionRepositoryMock)
      .overrideProvider(PermissionGrantRepository)
      .useValue(permissionGrantRepositoryMock)
      .overrideProvider(StaffRepository)
      .useValue(staffRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuthService)
      .useValue(authServiceMock)
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Who may reach this surface at all ──────────────────────────────────────

  describe('the surface itself', () => {
    it('is 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/admin/staff').expect(401);
    });

    it('is 403 for a MANAGER on every route — staff:* is granted to nobody', async () => {
      // Plan 181, invariant 3, second half. This manager holds four real
      // permissions, so the refusals below are about the STAFF keys specifically —
      // and those keys are `grantable: false`, so no screen can ever tick them.
      const calls: [string, string][] = [
        ['get', '/api/admin/staff'],
        ['get', '/api/admin/staff/target-manager'],
        ['post', '/api/admin/staff'],
        ['patch', '/api/admin/staff/target-manager/role'],
        ['post', '/api/admin/staff/target-manager/password'],
        ['patch', '/api/admin/staff/target-manager/status'],
        ['delete', '/api/admin/staff/target-manager'],
      ];

      for (const [method, url] of calls) {
        await request(app.getHttpServer())
          [method as 'get'](url)
          .set('Authorization', auth(manager))
          .send({ role: 'MANAGER', newPassword: 'StrongP@ss123', isActive: false })
          .expect(403);
      }

      expect(staffRepositoryMock.findAll).not.toHaveBeenCalled();
      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });

    it('is 403 for a CUSTOMER', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/staff')
        .set('Authorization', auth(customer))
        .expect(403);
    });

    it('lists staff for a deputy admin, with levels and permission counts', async () => {
      staffRepositoryMock.findAll.mockResolvedValue({
        staff: [account(managerRow), account(adminRow)],
        total: 2,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/staff')
        .set('Authorization', auth(deputy))
        .expect(200);

      expect(response.body.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
      expect(response.body.data.map((r: { level: number }) => r.level)).toEqual([1, 2]);
      expect(response.body.data[0]).toHaveProperty('permissionCount', 2);
      expect(response.body.data[0]).not.toHaveProperty('passwordHash');
    });

    it('is 404 on a customer id — this list is service accounts only', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/admin/staff/customer-staff-1')
        .set('Authorization', auth(deputy))
        .expect(404);
    });
  });

  // ─── Door 1: role ───────────────────────────────────────────────────────────

  describe('PATCH /api/admin/staff/:id/role', () => {
    it('lets a deputy demote a manager', async () => {
      userRepositoryMock.findById.mockResolvedValue(managerRow);
      staffRepositoryMock.updateRole.mockResolvedValue({ ...managerRow, role: 'CUSTOMER' });
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .patch('/api/admin/staff/target-manager/role')
        .set('Authorization', auth(deputy))
        .send({ role: 'CUSTOMER' })
        .expect(200);

      expect(response.body.data.role).toBe('CUSTOMER');
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('target-manager');
      // Leaving the staff drops the grants. They used to survive, inert but
      // invisible (the staff-scoped lookup filters CUSTOMER out), and came back
      // whole the day the account was re-promoted — a grant nobody performed,
      // absent from the audit log, and never checked against the grantable list.
      expect(permissionGrantRepositoryMock.replaceForUser).toHaveBeenCalledWith(
        'target-manager',
        [],
      );
    });

    it('promotes an existing CUSTOMER — the flow the review called out', async () => {
      userRepositoryMock.findById.mockResolvedValue(row({ id: 'shopper', role: 'CUSTOMER' }));
      staffRepositoryMock.updateRole.mockResolvedValue(row({ id: 'shopper', role: 'MANAGER' }));
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/admin/staff/shopper/role')
        .set('Authorization', auth(deputy))
        .send({ role: 'MANAGER' })
        .expect(200);
    });

    it('is 403 when a deputy targets another ADMIN', async () => {
      userRepositoryMock.findById.mockResolvedValue(adminRow);

      await request(app.getHttpServer())
        .patch('/api/admin/staff/target-admin/role')
        .set('Authorization', auth(deputy))
        .send({ role: 'MANAGER' })
        .expect(403);

      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });

    it('is 403 when a deputy tries to APPOINT an admin', async () => {
      userRepositoryMock.findById.mockResolvedValue(managerRow);

      await request(app.getHttpServer())
        .patch('/api/admin/staff/target-manager/role')
        .set('Authorization', auth(deputy))
        .send({ role: 'ADMIN' })
        .expect(403);

      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });

    it('lets the OWNER appoint an admin', async () => {
      userRepositoryMock.findById.mockResolvedValue(managerRow);
      staffRepositoryMock.updateRole.mockResolvedValue({ ...managerRow, role: 'ADMIN' });
      staffRepositoryMock.findStaffById.mockResolvedValue(
        account({ ...managerRow, role: 'ADMIN' }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/admin/staff/target-manager/role')
        .set('Authorization', auth(owner))
        .send({ role: 'ADMIN' })
        .expect(200);

      expect(response.body.data.role).toBe('ADMIN');
      expect(response.body.data.level).toBe(2);
    });

    it('is 403 on the OWNER for everybody — including the owner themselves', async () => {
      // Plan 181, invariant 2. The owner acting on their own account is the case
      // an "…unless it is you" branch would quietly reopen.
      userRepositoryMock.findById.mockResolvedValue(ownerRow);

      for (const who of [deputy, owner]) {
        await request(app.getHttpServer())
          .patch(`/api/admin/staff/${ownerRow.id}/role`)
          .set('Authorization', auth(who))
          .send({ role: 'MANAGER' })
          .expect(403);
      }

      expect(staffRepositoryMock.updateRole).not.toHaveBeenCalled();
    });
  });

  // ─── Door 2: password ───────────────────────────────────────────────────────

  describe('POST /api/admin/staff/:id/password', () => {
    it('lets a deputy reset a manager’s password through the shared path', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(account(managerRow));

      await request(app.getHttpServer())
        .post('/api/admin/staff/target-manager/password')
        .set('Authorization', auth(deputy))
        .send({ newPassword: 'StrongP@ss123' })
        .expect(200);

      expect(authServiceMock.setPassword).toHaveBeenCalledWith('target-manager', 'StrongP@ss123');
    });

    it('is 403 on another ADMIN and on the OWNER', async () => {
      // Setting somebody's password IS signing in as them, which is why this door
      // is closed at exactly the same level as the other three.
      for (const target of [adminRow, ownerRow]) {
        staffRepositoryMock.findStaffById.mockResolvedValue(account(target));

        await request(app.getHttpServer())
          .post(`/api/admin/staff/${target.id}/password`)
          .set('Authorization', auth(deputy))
          .send({ newPassword: 'StrongP@ss123' })
          .expect(403);
      }

      staffRepositoryMock.findStaffById.mockResolvedValue(account(ownerRow));
      await request(app.getHttpServer())
        .post(`/api/admin/staff/${ownerRow.id}/password`)
        .set('Authorization', auth(owner))
        .send({ newPassword: 'StrongP@ss123' })
        .expect(403);

      expect(authServiceMock.setPassword).not.toHaveBeenCalled();
    });

    it('still enforces the stricter staff password policy', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(account(managerRow));

      await request(app.getHttpServer())
        .post('/api/admin/staff/target-manager/password')
        .set('Authorization', auth(owner))
        .send({ newPassword: 'short' })
        .expect(400);
    });
  });

  // ─── Door 3: status ─────────────────────────────────────────────────────────

  describe('PATCH /api/admin/staff/:id/status', () => {
    it('lets a deputy deactivate a manager and revokes their sessions', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(account(managerRow));
      userRepositoryMock.deactivate.mockResolvedValue({ ...managerRow, isActive: false });

      const response = await request(app.getHttpServer())
        .patch('/api/admin/staff/target-manager/status')
        .set('Authorization', auth(deputy))
        .send({ isActive: false })
        .expect(200);

      expect(response.body.data.isActive).toBe(false);
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('target-manager');
    });

    it('is 403 on another ADMIN and on the OWNER', async () => {
      for (const target of [adminRow, ownerRow]) {
        staffRepositoryMock.findStaffById.mockResolvedValue(account(target));

        await request(app.getHttpServer())
          .patch(`/api/admin/staff/${target.id}/status`)
          .set('Authorization', auth(deputy))
          .send({ isActive: false })
          .expect(403);
      }

      staffRepositoryMock.findStaffById.mockResolvedValue(account(ownerRow));
      await request(app.getHttpServer())
        .patch(`/api/admin/staff/${ownerRow.id}/status`)
        .set('Authorization', auth(owner))
        .send({ isActive: false })
        .expect(403);

      expect(userRepositoryMock.deactivate).not.toHaveBeenCalled();
    });

    it('refuses the caller their own account', async () => {
      await request(app.getHttpServer())
        .patch(`/api/admin/staff/${deputy.id}/status`)
        .set('Authorization', auth(deputy))
        .send({ isActive: false })
        .expect(403);
    });
  });

  // ─── Door 4: delete ─────────────────────────────────────────────────────────

  describe('DELETE /api/admin/staff/:id', () => {
    it('lets a deputy soft-delete a manager, mangling the email', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(account(managerRow));
      userRepositoryMock.softDelete.mockResolvedValue({ ...managerRow, deletedAt: new Date() });

      await request(app.getHttpServer())
        .delete('/api/admin/staff/target-manager')
        .set('Authorization', auth(deputy))
        .expect(204);

      expect(userRepositoryMock.softDelete).toHaveBeenCalledWith(
        'target-manager',
        `deleted:target-manager:${managerRow.email}`,
        managerRow.email,
      );
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('target-manager');
    });

    it('is 403 on another ADMIN and on the OWNER', async () => {
      for (const target of [adminRow, ownerRow]) {
        staffRepositoryMock.findStaffById.mockResolvedValue(account(target));

        await request(app.getHttpServer())
          .delete(`/api/admin/staff/${target.id}`)
          .set('Authorization', auth(deputy))
          .expect(403);
      }

      staffRepositoryMock.findStaffById.mockResolvedValue(account(ownerRow));
      await request(app.getHttpServer())
        .delete(`/api/admin/staff/${ownerRow.id}`)
        .set('Authorization', auth(owner))
        .expect(403);

      expect(userRepositoryMock.softDelete).not.toHaveBeenCalled();
    });
  });

  // ─── Provisioning ───────────────────────────────────────────────────────────

  describe('POST /api/admin/staff', () => {
    const body = {
      email: 'new-hire@example.com',
      password: 'StrongP@ss123',
      role: 'MANAGER',
      firstName: 'Olena',
    };

    it('lets a deputy create a MANAGER', async () => {
      userRepositoryMock.findByEmail.mockResolvedValue(null);
      staffRepositoryMock.create.mockResolvedValue(
        row({ id: 'new-hire', email: body.email, firstName: 'Olena' }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/admin/staff')
        .set('Authorization', auth(deputy))
        .send(body)
        .expect(201);

      expect(response.body.data.email).toBe(body.email);
      expect(response.body.data).not.toHaveProperty('passwordHash');
      // Hashed before the repository ever sees it.
      const input = staffRepositoryMock.create.mock.calls[0][0] as { passwordHash: string };
      expect(input.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('is 403 when a deputy asks for ADMIN, and 201 when the owner does', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/staff')
        .set('Authorization', auth(deputy))
        .send({ ...body, role: 'ADMIN' })
        .expect(403);

      // Refused before the address is looked up — a forbidden call must not double
      // as an email-enumeration oracle.
      expect(userRepositoryMock.findByEmail).not.toHaveBeenCalled();

      userRepositoryMock.findByEmail.mockResolvedValue(null);
      staffRepositoryMock.create.mockResolvedValue(
        row({ id: 'new-admin', email: body.email, role: 'ADMIN' }),
      );

      await request(app.getHttpServer())
        .post('/api/admin/staff')
        .set('Authorization', auth(owner))
        .send({ ...body, role: 'ADMIN' })
        .expect(201);
    });

    it('rejects CUSTOMER outright — shoppers register themselves', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/staff')
        .set('Authorization', auth(owner))
        .send({ ...body, role: 'CUSTOMER' })
        .expect(400);
    });

    it('is 409 on a taken email', async () => {
      userRepositoryMock.findByEmail.mockResolvedValue(managerRow);

      await request(app.getHttpServer())
        .post('/api/admin/staff')
        .set('Authorization', auth(owner))
        .send(body)
        .expect(409);

      expect(staffRepositoryMock.create).not.toHaveBeenCalled();
    });
  });

  // ─── The transfer ───────────────────────────────────────────────────────────

  /**
   * `POST /api/admin/staff/:id/transfer-ownership` (TASK-478, plan 181,
   * invariant 1).
   *
   * The route the other four doors exist to make unnecessary — and the only one
   * that can ever change who owns the shop. What this suite proves that the
   * service spec cannot: that the handler wears `@OwnerOnly()` rather than
   * `staff:write` (so a deputy admin — who passes every permission that exists —
   * is still refused), that the password travels in the BODY and is required by
   * the DTO, and that exactly one audit row is written naming both parties.
   */
  describe('POST /api/admin/staff/:id/transfer-ownership', () => {
    const PASSWORD = 'OwnerP@ssw0rd!';
    const url = `/api/admin/staff/${adminRow.id}/transfer-ownership`;

    beforeEach(() => {
      staffRepositoryMock.findStaffById.mockResolvedValue(account(adminRow));
      staffRepositoryMock.transferOwnership.mockResolvedValue({
        outgoing: { ...ownerRow, isOwner: false },
        incoming: { ...adminRow, isOwner: true },
      });
      authServiceMock.verifyOwnPassword.mockResolvedValue(undefined);
    });

    it('hands the shop over for the owner, with both sessions revoked', async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', auth(owner))
        .send({ password: PASSWORD })
        .expect(200);

      expect(response.body.data.owner).toMatchObject({ id: adminRow.id, isOwner: true, level: 3 });
      expect(response.body.data.previousOwner).toMatchObject({
        id: owner.id,
        isOwner: false,
        role: 'ADMIN',
        level: 2,
      });

      expect(staffRepositoryMock.transferOwnership).toHaveBeenCalledWith(owner.id, adminRow.id);
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith(owner.id);
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith(adminRow.id);
    });

    it('is 403 for a DEPUTY ADMIN — this is the reserve, not a permission', async () => {
      // A deputy passes every `@RequirePermission` there is, including
      // `staff:write`. `@OwnerOnly` is consulted BEFORE that bypass in
      // PermissionGuard, and this assertion is what would fail if the two were
      // ever reordered.
      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', auth(deputy))
        .send({ password: PASSWORD })
        .expect(403);

      expect(authServiceMock.verifyOwnPassword).not.toHaveBeenCalled();
      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('is 403 for a manager and a customer, 401 with no token at all', async () => {
      for (const who of [manager, customer]) {
        await request(app.getHttpServer())
          .post(url)
          .set('Authorization', auth(who))
          .send({ password: PASSWORD })
          .expect(403);
      }

      await request(app.getHttpServer()).post(url).send({ password: PASSWORD }).expect(401);

      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('is 401 on a wrong password, and nothing at all happens', async () => {
      authServiceMock.verifyOwnPassword.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      const response = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', auth(owner))
        .send({ password: 'not-my-password' })
        .expect(401);

      // The same generic message login uses — it says nothing about the account.
      expect(response.body.message).toBe('Invalid credentials');

      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
      expect(prismaServiceMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('requires the password in the body — an empty one is a 400, not a transfer', async () => {
      for (const body of [{}, { password: '' }]) {
        await request(app.getHttpServer())
          .post(url)
          .set('Authorization', auth(owner))
          .send(body)
          .expect(400);
      }

      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('is 404 for a customer, an unknown id or a deleted account', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/admin/staff/customer-staff-1/transfer-ownership')
        .set('Authorization', auth(owner))
        .send({ password: PASSWORD })
        .expect(404);
    });

    it('is 400 for a manager and for a deactivated admin', async () => {
      staffRepositoryMock.findStaffById.mockResolvedValue(account(managerRow));
      await request(app.getHttpServer())
        .post(`/api/admin/staff/${managerRow.id}/transfer-ownership`)
        .set('Authorization', auth(owner))
        .send({ password: PASSWORD })
        .expect(400);

      staffRepositoryMock.findStaffById.mockResolvedValue(
        account(row({ id: adminRow.id, role: 'ADMIN', isActive: false })),
      );
      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', auth(owner))
        .send({ password: PASSWORD })
        .expect(400);

      expect(staffRepositoryMock.transferOwnership).not.toHaveBeenCalled();
    });

    it('writes exactly ONE audit row, and it names both parties', async () => {
      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', auth(owner))
        .send({ password: PASSWORD })
        .expect(200);

      // One, not two: `@RecordsOwnAudit()` stops the generic interceptor adding a
      // second row whose only content would be the submitted body — which here is
      // the owner's password.
      expect(prismaServiceMock.auditLog.create).toHaveBeenCalledTimes(1);

      const { data } = prismaServiceMock.auditLog.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data.action).toBe('staff.transferOwnership');
      expect(data.entityId).toBe(adminRow.id);
      expect(String(data.summary)).toContain(adminRow.email);
      expect(String(data.summary)).toContain(ownerRow.email);
      expect(data.diff).toMatchObject({
        isOwner: { from: ownerRow.email, to: adminRow.email },
      });
      // And not a trace of what was typed to confirm it.
      expect(JSON.stringify(data)).not.toContain(PASSWORD);
    });
  });

  // ─── What moved off /api/users ──────────────────────────────────────────────

  describe('the routes this section replaced', () => {
    it('no longer exist on /api/users, for the owner either', async () => {
      // 404 from the router, not 403 from a guard: the handlers are gone. An
      // admin panel still calling them must fail loudly rather than appear to work.
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', auth(owner))
        .send({ email: 'x@example.com', password: 'StrongP@ss123', role: 'MANAGER' })
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/users/some-user/password')
        .set('Authorization', auth(owner))
        .send({ newPassword: 'StrongP@ss123' })
        .expect(404);

      await request(app.getHttpServer())
        .patch('/api/users/some-user/role')
        .set('Authorization', auth(owner))
        .send({ role: 'MANAGER' })
        .expect(404);
    });

    it('leaves the customer surface answering 404 for a staff id', async () => {
      // The other half of the split: a service account is not reachable through
      // `customers:*` any more, and the answer does not distinguish "staff" from
      // "no such id".
      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/users/target-admin')
        .set('Authorization', auth(deputy))
        .expect(404);

      await request(app.getHttpServer())
        .patch('/api/users/target-admin/deactivate')
        .set('Authorization', auth(manager))
        .expect(404);

      expect(userRepositoryMock.deactivate).not.toHaveBeenCalled();
    });
  });
});
