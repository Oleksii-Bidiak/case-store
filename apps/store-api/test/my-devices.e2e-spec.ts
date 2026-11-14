import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { MyDevicesRepository } from '../src/my-devices/my-devices.repository';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * «Мої пристрої» in the account over HTTP (TASK-1959): `GET / PUT /me/devices`
 * and `POST /me/devices/merge`.
 *
 * The controller and service are REAL; only the repository is a double, so
 * every assertion on its arguments is what production would send to the
 * database. The two properties this suite exists for are the boundary ones:
 * nothing is reachable without a JWT, and the user a request acts on is the
 * token's subject — never anything the body says. The database half (the
 * replace/merge transaction, the per-user scoping of every query) is proved on
 * Postgres by `my-devices.repository.int-spec.ts`.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('My devices (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const userA = { id: 'user-a-devices-1', role: 'CUSTOMER' };
  const userB = { id: 'user-b-devices-1', role: 'CUSTOMER' };

  const MODEL_A = '11111111-1111-4111-8111-111111111111';
  const MODEL_B = '22222222-2222-4222-8222-222222222222';

  const BASE = '/api/me/devices';

  const state = {
    devices: [
      {
        modelId: MODEL_A,
        slug: 'iphone-15-pro',
        name: 'iPhone 15 Pro',
        brandName: 'Apple',
        brandSlug: 'apple',
        series: 'iPhone 15',
        label: 'Мама',
        lastUsedAt: new Date('2026-11-01T10:00:00.000Z'),
      },
    ],
    settings: { compatOnly: true, compatScope: 'all' },
  };

  const repositoryMock = {
    findState: jest.fn(),
    findActiveModelIds: jest.fn(),
    replaceState: jest.fn(),
    mergeState: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    auditLog: { create: jest.fn() },
  };

  const bearer = (user: { id: string; role: string }) =>
    `Bearer ${jwtService.sign(
      { sub: user.id, role: user.role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    )}`;

  const validBody = () => ({
    devices: [{ modelId: MODEL_A, label: 'Мама', lastUsedAt: '2026-11-01T10:00:00.000Z' }],
    settings: { compatOnly: true, compatScope: 'all' },
  });

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
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(MyDevicesRepository)
      .useValue(repositoryMock)
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
    repositoryMock.findState.mockResolvedValue(state);
    repositoryMock.replaceState.mockResolvedValue(state);
    repositoryMock.mergeState.mockResolvedValue(state);
    repositoryMock.findActiveModelIds.mockImplementation((ids: string[]) => Promise.resolve(ids));
  });

  // ─── Authentication ───────────────────────────────────────────────────────

  describe('without a JWT', () => {
    it.each([
      ['get', BASE],
      ['put', BASE],
      ['post', `${BASE}/merge`],
    ] as const)('%s %s → 401 and the repository is never touched', async (method, url) => {
      await request(app.getHttpServer())[method](url).send(validBody()).expect(401);

      expect(repositoryMock.findState).not.toHaveBeenCalled();
      expect(repositoryMock.replaceState).not.toHaveBeenCalled();
      expect(repositoryMock.mergeState).not.toHaveBeenCalled();
    });

    it('a forged token (wrong secret) is refused too', async () => {
      const forged = jwtService.sign(
        { sub: userA.id, role: 'CUSTOMER' },
        { secret: 'not-the-secret-at-all-but-32-chars-long!!', expiresIn: '15m' },
      );
      await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });
  });

  // ─── GET ──────────────────────────────────────────────────────────────────

  describe('GET /me/devices', () => {
    it('returns the caller’s devices and settings in the { data } envelope', async () => {
      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', bearer(userA))
        .expect(200);

      expect(res.body).toEqual({
        data: {
          devices: [{ ...state.devices[0], lastUsedAt: '2026-11-01T10:00:00.000Z' }],
          settings: { compatOnly: true, compatScope: 'all' },
        },
      });
      expect(repositoryMock.findState).toHaveBeenCalledWith(userA.id);
    });

    it('reads the token subject’s devices, whoever asks', async () => {
      await request(app.getHttpServer()).get(BASE).set('Authorization', bearer(userB)).expect(200);

      expect(repositoryMock.findState).toHaveBeenCalledTimes(1);
      expect(repositoryMock.findState).toHaveBeenCalledWith(userB.id);
    });
  });

  // ─── PUT ──────────────────────────────────────────────────────────────────

  describe('PUT /me/devices', () => {
    it('replaces the caller’s state and returns it', async () => {
      const res = await request(app.getHttpServer())
        .put(BASE)
        .set('Authorization', bearer(userA))
        .send(validBody())
        .expect(200);

      expect(res.body.data.devices[0].modelId).toBe(MODEL_A);
      expect(repositoryMock.replaceState).toHaveBeenCalledWith(userA.id, {
        devices: [
          { modelId: MODEL_A, label: 'Мама', lastUsedAt: new Date('2026-11-01T10:00:00.000Z') },
        ],
        settings: { compatOnly: true, compatScope: 'all' },
      });
    });

    it('refuses a userId in the body — one user can never write another’s devices', async () => {
      await request(app.getHttpServer())
        .put(BASE)
        .set('Authorization', bearer(userA))
        .send({ ...validBody(), userId: userB.id })
        .expect(400);

      expect(repositoryMock.replaceState).not.toHaveBeenCalled();
    });

    it('accepts exactly 100 devices', async () => {
      const devices = Array.from({ length: 100 }, (_, i) => ({
        modelId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        lastUsedAt: new Date(1_700_000_000_000 + i).toISOString(),
      }));
      await request(app.getHttpServer())
        .put(BASE)
        .set('Authorization', bearer(userA))
        .send({ ...validBody(), devices })
        .expect(200);
    });

    it('refuses 101 devices with 400', async () => {
      const devices = Array.from({ length: 101 }, (_, i) => ({
        modelId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        lastUsedAt: new Date(1_700_000_000_000 + i).toISOString(),
      }));
      await request(app.getHttpServer())
        .put(BASE)
        .set('Authorization', bearer(userA))
        .send({ ...validBody(), devices })
        .expect(400);

      expect(repositoryMock.replaceState).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a non-UUID modelId',
        { devices: [{ modelId: 'nope', lastUsedAt: '2026-11-01T10:00:00Z' }] },
      ],
      [
        'a label over 30 characters',
        {
          devices: [
            { modelId: MODEL_A, label: 'x'.repeat(31), lastUsedAt: '2026-11-01T10:00:00Z' },
          ],
        },
      ],
      ['a missing lastUsedAt', { devices: [{ modelId: MODEL_A }] }],
      ['a non-date lastUsedAt', { devices: [{ modelId: MODEL_A, lastUsedAt: 'yesterday' }] }],
      ['an unknown compatScope', { settings: { compatOnly: true, compatScope: 'everyone' } }],
      ['a non-boolean compatOnly', { settings: { compatOnly: 'yes', compatScope: 'all' } }],
      ['missing settings', { settings: undefined }],
      ['devices that is not an array', { devices: { modelId: MODEL_A } }],
    ])('refuses %s with 400', async (_name, patch) => {
      await request(app.getHttpServer())
        .put(BASE)
        .set('Authorization', bearer(userA))
        .send({ ...validBody(), ...patch })
        .expect(400);

      expect(repositoryMock.replaceState).not.toHaveBeenCalled();
    });

    it('drops unknown / inactive models silently (still 200)', async () => {
      repositoryMock.findActiveModelIds.mockResolvedValue([MODEL_A]);

      await request(app.getHttpServer())
        .put(BASE)
        .set('Authorization', bearer(userA))
        .send({
          ...validBody(),
          devices: [
            { modelId: MODEL_A, lastUsedAt: '2026-11-01T10:00:00.000Z' },
            { modelId: MODEL_B, lastUsedAt: '2026-11-02T10:00:00.000Z' },
          ],
        })
        .expect(200);

      const write = repositoryMock.replaceState.mock.calls[0][1] as {
        devices: { modelId: string }[];
      };
      expect(write.devices.map((d) => d.modelId)).toEqual([MODEL_A]);
    });
  });

  // ─── POST /merge ──────────────────────────────────────────────────────────

  describe('POST /me/devices/merge', () => {
    it('merges the guest state into the caller’s account and returns 200 with the result', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/merge`)
        .set('Authorization', bearer(userA))
        .send(validBody())
        .expect(200);

      expect(res.body.data.settings).toEqual({ compatOnly: true, compatScope: 'all' });
      expect(repositoryMock.mergeState).toHaveBeenCalledWith(userA.id, expect.any(Function));
    });

    it('refuses a userId in the body', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/merge`)
        .set('Authorization', bearer(userA))
        .send({ ...validBody(), userId: userB.id })
        .expect(400);

      expect(repositoryMock.mergeState).not.toHaveBeenCalled();
    });

    it('applies the same 100-device bound', async () => {
      const devices = Array.from({ length: 101 }, (_, i) => ({
        modelId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        lastUsedAt: new Date(1_700_000_000_000 + i).toISOString(),
      }));
      await request(app.getHttpServer())
        .post(`${BASE}/merge`)
        .set('Authorization', bearer(userA))
        .send({ ...validBody(), devices })
        .expect(400);
    });
  });
});
