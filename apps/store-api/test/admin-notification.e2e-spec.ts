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
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * GET /api/admin/notifications/telegram over HTTP (TASK-674).
 *
 * Proves the route is wired the way the controller says: behind PermissionGuard,
 * owner-only (no settings key in the catalogue fits — see the controller), and
 * answering `unconfigured` when there is no bot token. `setup-e2e.ts` forces
 * TELEGRAM_BOT_TOKEN to empty, so the boot's `getMe` never leaves the process —
 * which is also the smoke test that the API starts without the token at all.
 *
 * Ids follow `permission-repository.mock.ts`: `admin-…` is staff by level, and
 * `isOwnerFor` picks exactly one of the two admins as the owner.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Admin notifications (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const owner = { id: 'admin-owner-notify-1', role: 'ADMIN' };
  const deputy = { id: 'admin-deputy-notify-1', role: 'ADMIN' };
  // A manager holding every settings key there is — to prove the refusal is about
  // the route being owner-only, not about holding nothing.
  const manager = { id: 'manager-notify-1', role: 'MANAGER' };
  const customer = { id: 'customer-notify-1', role: 'CUSTOMER' };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const token = (user: { id: string; role: string }) =>
    jwtService.sign(
      { sub: user.id, role: user.role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

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
        createPermissionRepositoryMock({
          grants: {
            MANAGER: ['settings:seo', 'settings:contacts', 'settings:delivery', 'settings:search'],
          },
          isOwnerFor: (userId) => userId === owner.id,
        }),
      )
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

  const URL = '/api/admin/notifications/telegram';

  it('401 without a token', async () => {
    await request(app.getHttpServer()).get(URL).expect(401);
  });

  it.each([
    ['a customer', customer],
    ['a manager with every settings key', manager],
    ['a deputy admin', deputy],
  ])('403 for %s', async (_label, user) => {
    const res = await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', `Bearer ${token(user)}`)
      .expect(403);
    expect(res.body.message).toBe('Admin access required');
  });

  it('200 for the owner: the channel is unconfigured without a bot token', async () => {
    const res = await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);

    expect(res.body).toEqual({ data: { state: 'unconfigured' } });
  });
});
