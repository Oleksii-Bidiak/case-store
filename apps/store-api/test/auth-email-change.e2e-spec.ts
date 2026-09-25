import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { EmailTokenPurpose, UserRole } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { MailOutboxRepository } from '../src/mail-outbox/mail-outbox.repository';
import { AuditRepository } from '../src/audit/audit.repository';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * Changing the sign-in address, end to end (TASK-396).
 *
 * Unlike most e2e suites, AuthRepository here is a small STATEFUL fake rather
 * than a bag of jest.fn()s: the property under test is a sequence — request,
 * click, the OLD session no longer refreshes — and a stateless mock can only
 * assert that some method was called, not that the session it minted a minute
 * ago is dead now. The fake keeps users, links and refresh tokens in maps, and
 * the raw link tokens are read out of the outbox rows the real MailOutboxService
 * writes, exactly as they would reach an inbox.
 */

type Row = Record<string, unknown> & { id: string };

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  isActive: boolean;
  deletedAt: Date | null;
  emailVerifiedAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PASSWORD = 'TestP@ss123';

describe('Email change (e2e, TASK-396)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // ─── State ─────────────────────────────────────────────────────────────────
  const users = new Map<string, FakeUser>();
  const links = new Map<string, Row>(); // raw token → row
  const refresh = new Map<string, Row>(); // raw token → row
  const outbox: Array<{ type: string; recipient: string; payload: Record<string, string> }> = [];
  const auditRows: Array<Record<string, unknown>> = [];
  let seq = 0;
  const nextId = (p: string) => `${p}-${++seq}`;

  const byEmail = (email: string) => [...users.values()].find((u) => u.email === email) ?? null;
  const assertUnique = (userId: string, email: string) => {
    const holder = byEmail(email);
    if (holder && holder.id !== userId) {
      // What the real unique index would do.
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    }
  };
  const revokeAll = (userId: string) => {
    for (const row of refresh.values()) if (row.userId === userId) row.isRevoked = true;
  };

  const authRepositoryFake = {
    findByEmail: async (email: string) => byEmail(email),
    findById: async (id: string) => users.get(id) ?? null,
    saveRefreshToken: async (userId: string, raw: string, expiresAt: Date) => {
      const row = { id: nextId('rt'), token: raw, userId, expiresAt, isRevoked: false };
      refresh.set(raw, row);
      return row;
    },
    findRefreshToken: async (raw: string) => {
      const row = refresh.get(raw);
      return row ? { ...row, user: users.get(row.userId as string) } : null;
    },
    rotateRefreshToken: async (oldId: string, userId: string, raw: string, expiresAt: Date) => {
      for (const row of refresh.values()) if (row.id === oldId) row.isRevoked = true;
      refresh.set(raw, { id: nextId('rt'), token: raw, userId, expiresAt, isRevoked: false });
    },
    revokeAllUserTokens: async (userId: string) => revokeAll(userId),
    clearFailedLogins: async () => undefined,
    recordFailedLogin: async () => 1,
    lockLoginUntil: async () => undefined,
    saveEmailVerificationToken: async (
      userId: string,
      email: string,
      raw: string,
      expiresAt: Date,
      options: { purpose?: EmailTokenPurpose; previousEmail?: string } = {},
    ) => {
      const row = {
        id: nextId('evt'),
        token: raw,
        userId,
        email,
        expiresAt,
        usedAt: null,
        createdAt: new Date(),
        purpose: options.purpose ?? EmailTokenPurpose.VERIFY,
        previousEmail: options.previousEmail ?? null,
      };
      links.set(raw, row);
      return row;
    },
    findEmailVerificationToken: async (raw: string) => {
      const row = links.get(raw);
      return row ? { ...row, user: { ...users.get(row.userId as string)! } } : null;
    },
    markEmailVerificationTokenUsed: async (id: string) => {
      for (const row of links.values()) if (row.id === id) row.usedAt = new Date();
    },
    invalidateActiveEmailVerificationTokens: async (
      userId: string,
      purposes: EmailTokenPurpose[] = [EmailTokenPurpose.VERIFY],
    ) => {
      for (const row of links.values()) {
        if (row.userId === userId && !row.usedAt && purposes.includes(row.purpose as never)) {
          row.usedAt = new Date();
        }
      }
    },
    markEmailVerified: async (userId: string, at: Date) => {
      users.get(userId)!.emailVerifiedAt = at;
    },
    applyEmailChange: async (p: {
      userId: string;
      tokenId: string;
      newEmail: string;
      verifiedAt: Date;
    }) => {
      assertUnique(p.userId, p.newEmail);
      const user = users.get(p.userId)!;
      user.email = p.newEmail;
      user.emailVerifiedAt = p.verifiedAt;
      for (const row of links.values()) {
        if (row.id === p.tokenId) row.usedAt = p.verifiedAt;
        if (
          row.userId === p.userId &&
          !row.usedAt &&
          row.purpose !== EmailTokenPurpose.EMAIL_CHANGE_REVERT
        ) {
          row.usedAt = p.verifiedAt;
        }
      }
      revokeAll(p.userId);
    },
    revertEmailChange: async (p: {
      userId: string;
      tokenId: string;
      restoreEmail: string;
      verifiedAt: Date;
    }) => {
      assertUnique(p.userId, p.restoreEmail);
      const user = users.get(p.userId)!;
      user.email = p.restoreEmail;
      user.emailVerifiedAt = p.verifiedAt;
      for (const row of links.values()) {
        if (row.userId === p.userId && !row.usedAt) row.usedAt = p.verifiedAt;
      }
      revokeAll(p.userId);
    },
    setUnverifiedEmail: async (userId: string, newEmail: string) => {
      assertUnique(userId, newEmail);
      const user = users.get(userId)!;
      user.email = newEmail;
      user.emailVerifiedAt = null;
      for (const row of links.values())
        if (row.userId === userId && !row.usedAt) row.usedAt = new Date();
      revokeAll(userId);
    },
  };

  const userRepositoryMock = {
    findById: async (id: string) => users.get(id) ?? null,
    findCustomerById: async (id: string) => {
      const user = users.get(id);
      return user && user.role === UserRole.CUSTOMER && !user.deletedAt ? { ...user } : null;
    },
  };

  const mailOutboxRepositoryMock = {
    enqueue: async (params: { type: string; recipient: string; payload: unknown }) => {
      outbox.push(params as (typeof outbox)[number]);
      return { id: nextId('mail') };
    },
    claimDue: async () => [],
    hasRecentByTypeAndRecipient: async () => false,
  };

  const auditRepositoryMock = {
    create: async (input: Record<string, unknown>) => {
      auditRows.push(input);
      return input;
    },
    findActorSnapshot: async () => null,
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function seedCustomer(id: string, email: string): Promise<FakeUser> {
    const user: FakeUser = {
      id,
      email,
      passwordHash: await argon2.hash(PASSWORD),
      role: UserRole.CUSTOMER,
      isActive: true,
      deletedAt: null,
      emailVerifiedAt: new Date('2026-09-01'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      firstName: 'Ivan',
      lastName: 'Petrenko',
      phone: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
    users.set(id, user);
    return user;
  }

  /** Sign in for real; returns the access token and the refresh cookie line. */
  async function signIn(email: string): Promise<{ access: string; cookie: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((c) => c.startsWith('refreshToken='))!.split(';')[0];
    return { access: res.body.data.accessToken as string, cookie };
  }

  const refreshWith = (cookie: string) =>
    request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie);

  /** The raw token in the last outbox row of this type (what the inbox would show). */
  function linkToken(type: string): string {
    const row = [...outbox].reverse().find((r) => r.type === type)!;
    const url = row.payload.confirmUrl ?? row.payload.revertUrl ?? row.payload.verifyUrl;
    return new URL(url).searchParams.get('token')!;
  }

  // ─── App ───────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryFake)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(MailOutboxRepository)
      .useValue(mailOutboxRepositoryMock)
      .overrideProvider(AuditRepository)
      .useValue(auditRepositoryMock)
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
    app.use(cookieParser());
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
    await app?.close();
  });

  beforeEach(() => {
    users.clear();
    links.clear();
    refresh.clear();
    outbox.length = 0;
    auditRows.length = 0;
  });

  // ─── The self-service cycle ────────────────────────────────────────────────

  it('request → nothing changes → confirm → new login, old session dead, old password + new email work', async () => {
    await seedCustomer('customer-e2e-1', 'old@example.com');
    const session = await signIn('old@example.com');

    await request(app.getHttpServer())
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${session.access}`)
      .send({ newEmail: '  New@Example.com ', currentPassword: PASSWORD })
      .expect(200);

    // Two letters, two inboxes.
    expect(outbox.map((r) => [r.type, r.recipient])).toEqual([
      ['email-change-confirm', 'new@example.com'],
      ['email-change-notice', 'old@example.com'],
    ]);
    // Nothing about the account changed yet — the old session still refreshes.
    expect(users.get('customer-e2e-1')!.email).toBe('old@example.com');
    const stillAlive = await refreshWith(session.cookie).expect(200);
    const rotatedCookie = (stillAlive.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('refreshToken='))!
      .split(';')[0];

    const confirm = await request(app.getHttpServer())
      .post('/api/auth/email-change/confirm')
      .send({ token: linkToken('email-change-confirm') })
      .expect(200);

    // The browser that clicked has its refresh cookie cleared as well.
    expect(String(confirm.headers['set-cookie'])).toMatch(/refreshToken=;.*Max-Age=0/i);

    const user = users.get('customer-e2e-1')!;
    expect(user.email).toBe('new@example.com');
    expect(user.emailVerifiedAt).not.toBeNull();

    // Every session is gone: the rotated refresh cookie is refused.
    await refreshWith(rotatedCookie).expect(401);

    // The old address no longer signs in; the new one does.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'old@example.com', password: PASSWORD })
      .expect(401);
    await signIn('new@example.com');

    // The confirm link is single-use.
    await request(app.getHttpServer())
      .post('/api/auth/email-change/confirm')
      .send({ token: linkToken('email-change-confirm') })
      .expect(400);
  });

  it('revert from the OLD inbox restores the address after a confirmed change and ends every session', async () => {
    await seedCustomer('customer-e2e-1', 'old@example.com');
    const session = await signIn('old@example.com');

    await request(app.getHttpServer())
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${session.access}`)
      .send({ newEmail: 'attacker@example.com', currentPassword: PASSWORD })
      .expect(200);
    const revertToken = linkToken('email-change-notice');

    await request(app.getHttpServer())
      .post('/api/auth/email-change/confirm')
      .send({ token: linkToken('email-change-confirm') })
      .expect(200);
    const attackerSession = await signIn('attacker@example.com');

    await request(app.getHttpServer())
      .post('/api/auth/email-change/revert')
      .send({ token: revertToken })
      .expect(200);

    expect(users.get('customer-e2e-1')!.email).toBe('old@example.com');
    await refreshWith(attackerSession.cookie).expect(401);
    await signIn('old@example.com');
  });

  it('revert BEFORE confirm cancels the pending change — the confirm link stops working', async () => {
    await seedCustomer('customer-e2e-1', 'old@example.com');
    const session = await signIn('old@example.com');

    await request(app.getHttpServer())
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${session.access}`)
      .send({ newEmail: 'new@example.com', currentPassword: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/email-change/revert')
      .send({ token: linkToken('email-change-notice') })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/email-change/confirm')
      .send({ token: linkToken('email-change-confirm') })
      .expect(400);
    expect(users.get('customer-e2e-1')!.email).toBe('old@example.com');
    await refreshWith(session.cookie).expect(401);
  });

  it('answers 409 when the new address was registered by someone else before the click', async () => {
    await seedCustomer('customer-e2e-1', 'old@example.com');
    const session = await signIn('old@example.com');

    await request(app.getHttpServer())
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${session.access}`)
      .send({ newEmail: 'new@example.com', currentPassword: PASSWORD })
      .expect(200);

    // Somebody signs up with that address while the letter sits unread.
    await seedCustomer('customer-e2e-2', 'new@example.com');

    const res = await request(app.getHttpServer())
      .post('/api/auth/email-change/confirm')
      .send({ token: linkToken('email-change-confirm') })
      .expect(409);

    expect(res.body.message).toMatch(/already registered/);
    expect(users.get('customer-e2e-1')!.email).toBe('old@example.com');
  });

  it('answers 401 for a wrong current password and sends no mail', async () => {
    await seedCustomer('customer-e2e-1', 'old@example.com');
    const session = await signIn('old@example.com');

    await request(app.getHttpServer())
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${session.access}`)
      .send({ newEmail: 'new@example.com', currentPassword: 'Wrong-pass-1' })
      .expect(401);

    expect(outbox).toHaveLength(0);
  });

  it('answers 409 at request time for an address that is already taken', async () => {
    await seedCustomer('customer-e2e-1', 'old@example.com');
    await seedCustomer('customer-e2e-2', 'taken@example.com');
    const session = await signIn('old@example.com');

    await request(app.getHttpServer())
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${session.access}`)
      .send({ newEmail: 'taken@example.com', currentPassword: PASSWORD })
      .expect(409);
  });

  it('requires a session to request a change', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/email-change/request')
      .send({ newEmail: 'new@example.com', currentPassword: PASSWORD })
      .expect(401);
  });

  it('refuses a change link at the plain verify-email endpoint without burning it', async () => {
    await seedCustomer('customer-e2e-1', 'old@example.com');
    const session = await signIn('old@example.com');
    await request(app.getHttpServer())
      .post('/api/auth/email-change/request')
      .set('Authorization', `Bearer ${session.access}`)
      .send({ newEmail: 'new@example.com', currentPassword: PASSWORD })
      .expect(200);
    const token = linkToken('email-change-confirm');

    await request(app.getHttpServer())
      .post('/api/auth/email/verify/confirm')
      .send({ token })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/email-change/confirm')
      .send({ token })
      .expect(200);
  });

  // ─── The operator's half ───────────────────────────────────────────────────

  describe('POST /api/users/:id/email (owner-only)', () => {
    const ownerToken = () =>
      jwtService.sign(
        { sub: 'admin-e2e-1', role: 'ADMIN' },
        { secret: process.env.JWT_SECRET, expiresIn: '15m' },
      );

    it('refuses without a reason (400) and changes nothing', async () => {
      await seedCustomer('customer-e2e-1', 'old@example.com');

      await request(app.getHttpServer())
        .post('/api/users/customer-e2e-1/email')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ newEmail: 'new@example.com' })
        .expect(400);

      expect(users.get('customer-e2e-1')!.email).toBe('old@example.com');
      expect(auditRows).toHaveLength(0);
    });

    it('sets the address UNVERIFIED, mails a verification link to it, ends sessions, and audits from → to with the reason', async () => {
      await seedCustomer('customer-e2e-1', 'lost@example.com');
      const session = await signIn('lost@example.com');

      const res = await request(app.getHttpServer())
        .post('/api/users/customer-e2e-1/email')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({
          newEmail: 'found@example.com',
          reason: 'Клієнт телефонував, втратив доступ до пошти',
        })
        .expect(200);

      expect(res.body.data.email).toBe('found@example.com');
      expect(res.body.data.emailVerifiedAt).toBeNull();

      expect(outbox.map((r) => [r.type, r.recipient])).toEqual([
        ['email-verification', 'found@example.com'],
      ]);
      await refreshWith(session.cookie).expect(401);

      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({
        action: 'user.changeEmail',
        entityType: 'user',
        entityId: 'customer-e2e-1',
        diff: {
          email: { from: 'lost@example.com', to: 'found@example.com' },
          emailVerified: { from: true, to: false },
          reason: 'Клієнт телефонував, втратив доступ до пошти',
        },
      });
      expect(String(auditRows[0].summary)).toContain('Клієнт телефонував');

      // The verification link then proves the new inbox.
      await request(app.getHttpServer())
        .post('/api/auth/email/verify/confirm')
        .send({ token: linkToken('email-verification') })
        .expect(200);
      expect(users.get('customer-e2e-1')!.emailVerifiedAt).not.toBeNull();
    });

    it('is refused to a manager (owner-only)', async () => {
      await seedCustomer('customer-e2e-1', 'old@example.com');
      const managerToken = jwtService.sign(
        { sub: 'manager-e2e-1', role: 'MANAGER' },
        { secret: process.env.JWT_SECRET, expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .post('/api/users/customer-e2e-1/email')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ newEmail: 'new@example.com', reason: 'test reason' })
        .expect(403);
    });
  });
});
