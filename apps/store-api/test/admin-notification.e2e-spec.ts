import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { NotificationAudience, NotificationChannel, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { NotificationBindingService } from '../src/notification/notification-binding.service';
import { TelegramClient, TelegramApiError } from '../src/notification/telegram/telegram.client';
import {
  TelegramChannelState,
  type TelegramChannelSnapshot,
} from '../src/notification/telegram/telegram-channel.state';
import { TELEGRAM_TEST_MESSAGE } from '../src/notification/telegram/telegram-admin.service';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * /api/admin/notifications/telegram/* over HTTP (TASK-674, TASK-675).
 *
 * Proves the four routes are wired the way the controller says: behind
 * PermissionGuard, gated by `settings:notifications` (owner's decision
 * 2026-10-01 — the owner and deputy admins by level, a manager only with the
 * key, the four other settings keys buy nothing here), answering 409 while the
 * bot is not usable, and audited as `notification.*`.
 *
 * No network: `TelegramChannelState` and `TelegramClient` are replaced with
 * doubles whose state each test sets, and the binding service with a double —
 * the binding logic itself is proved on real Postgres by
 * `notification-binding.int-spec.ts`. `setup-e2e.ts` also forces
 * TELEGRAM_BOT_TOKEN empty, so nothing could reach api.telegram.org anyway.
 *
 * Ids follow `permission-repository.mock.ts`: `admin-…` is staff by level, and
 * `isOwnerFor` picks exactly one of the two admins as the owner.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const OTHER_SETTINGS_KEYS = [
  'settings:seo',
  'settings:contacts',
  'settings:delivery',
  'settings:search',
];

const BINDING_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';

describe('Admin notifications (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const owner = { id: 'admin-owner-notify-1', role: 'ADMIN' };
  const deputy = { id: 'admin-deputy-notify-1', role: 'ADMIN' };
  const manager = { id: 'manager-notify-1', role: 'MANAGER' };
  const customer = { id: 'customer-notify-1', role: 'CUSTOMER' };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    auditLog: { create: jest.fn() },
  };

  const permissionRepository = createPermissionRepositoryMock({
    grants: { MANAGER: OTHER_SETTINGS_KEYS },
    isOwnerFor: (userId) => userId === owner.id,
  });

  let snapshot: TelegramChannelSnapshot;
  const channelState = {
    onModuleInit: () => undefined,
    snapshot: () => snapshot,
    isOk: () => snapshot.state === 'ok',
    ensureFresh: () => Promise.resolve(snapshot),
    markFailed: jest.fn(),
  };
  const telegramClient = {
    isConfigured: () => true,
    getMe: jest.fn(),
    getUpdates: jest.fn(),
    sendMessage: jest.fn(),
  };
  const bindings = {
    issueToken: jest.fn(),
    consumeToken: jest.fn(),
    listActive: jest.fn(),
    findActiveRecipients: jest.fn(),
    hasActiveRecipient: jest.fn(),
    revoke: jest.fn(),
    revokeByExternalId: jest.fn(),
    getOffset: jest.fn(),
    saveOffset: jest.fn(),
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
      .useValue(permissionRepository)
      .overrideProvider(TelegramChannelState)
      .useValue(channelState)
      .overrideProvider(TelegramClient)
      .useValue(telegramClient)
      .overrideProvider(NotificationBindingService)
      .useValue(bindings)
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
    permissionRepository.setGrants(UserRole.MANAGER, OTHER_SETTINGS_KEYS);
    snapshot = {
      state: 'ok',
      botUsername: 'shop_bot',
      checkedAt: new Date('2026-10-01T12:00:00Z'),
    };
    bindings.listActive.mockResolvedValue([]);
    bindings.findActiveRecipients.mockResolvedValue([]);
    bindings.issueToken.mockResolvedValue({
      token: 'tok_en-123',
      expiresAt: new Date('2026-10-01T12:15:00.000Z'),
    });
    bindings.revoke.mockResolvedValue(undefined);
    bindings.revokeByExternalId.mockResolvedValue(1);
    telegramClient.sendMessage.mockResolvedValue({ message_id: 1 });
  });

  const BASE = '/api/admin/notifications/telegram';
  const ROUTES: ReadonlyArray<readonly [method: 'get' | 'post' | 'delete', path: string]> = [
    ['get', BASE],
    ['post', `${BASE}/link`],
    ['post', `${BASE}/test`],
    ['delete', `${BASE}/bindings/${BINDING_ID}`],
  ];

  const call = (
    method: 'get' | 'post' | 'delete',
    path: string,
    user?: { id: string; role: string },
  ) => {
    const req = request(app.getHttpServer())[method](path);
    return user ? req.set('Authorization', `Bearer ${token(user)}`) : req;
  };

  describe('permissions — settings:notifications on every route', () => {
    it.each(ROUTES)('%s %s → 401 without a token', async (method, path) => {
      await call(method, path).expect(401);
    });

    it.each(ROUTES)('%s %s → 403 for a customer', async (method, path) => {
      const res = await call(method, path, customer).expect(403);
      expect(res.body.message).toBe('Admin access required');
    });

    it.each(ROUTES)(
      '%s %s → 403 for a manager holding the four other settings keys',
      async (method, path) => {
        const res = await call(method, path, manager).expect(403);
        expect(res.body.message).toBe('Admin access required');
      },
    );

    it.each(ROUTES)(
      '%s %s → allowed for a manager WITH settings:notifications',
      async (method, path) => {
        permissionRepository.setGrants(UserRole.MANAGER, ['settings:notifications']);
        bindings.findActiveRecipients.mockResolvedValue([binding()]);

        const res = await call(method, path, manager);

        expect([200, 204]).toContain(res.status);
      },
    );

    it.each([
      ['the owner', owner],
      ['a deputy admin (by level, no row)', deputy],
    ])('%s passes every route', async (_label, user) => {
      bindings.findActiveRecipients.mockResolvedValue([binding()]);
      for (const [method, path] of ROUTES) {
        const res = await call(method, path, user);
        expect({ route: `${method} ${path}`, status: res.status }).toEqual({
          route: `${method} ${path}`,
          status: method === 'delete' ? 204 : 200,
        });
      }
    });
  });

  describe('GET /telegram', () => {
    it('unconfigured: the state alone, with an empty chat list', async () => {
      snapshot = { state: 'unconfigured' };

      const res = await call('get', BASE, owner).expect(200);

      expect(res.body).toEqual({ data: { state: 'unconfigured', bindings: [] } });
    });

    it('ok: the bot name and the active shop chats, their kind and who connected them', async () => {
      bindings.listActive.mockResolvedValue([
        {
          ...binding(),
          label: 'Замовлення',
          connectedBy: {
            id: 'u-1',
            email: 'owner@example.com',
            firstName: 'Олена',
            lastName: null,
          },
        },
        {
          ...binding('7a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', '42'),
          label: null,
          connectedBy: null,
        },
      ]);

      const res = await call('get', BASE, owner).expect(200);

      expect(bindings.listActive).toHaveBeenCalledWith(
        NotificationChannel.TELEGRAM,
        NotificationAudience.SHOP,
      );
      expect(res.body).toEqual({
        data: {
          state: 'ok',
          botUsername: 'shop_bot',
          checkedAt: '2026-10-01T12:00:00.000Z',
          bindings: [
            {
              id: BINDING_ID,
              label: 'Замовлення',
              kind: 'GROUP',
              createdAt: '2026-10-01T10:00:00.000Z',
              connectedBy: {
                id: 'u-1',
                email: 'owner@example.com',
                firstName: 'Олена',
                lastName: null,
              },
            },
            {
              id: '7a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
              kind: 'PRIVATE',
              createdAt: '2026-10-01T10:00:00.000Z',
            },
          ],
        },
      });
    });
  });

  describe('POST /telegram/link', () => {
    it.each<TelegramChannelSnapshot>([
      { state: 'unconfigured' },
      {
        state: 'failed',
        reason: 'Telegram getMe failed (401): Unauthorized',
        checkedAt: new Date(),
      },
    ])('409 while the channel is $state, and no token is issued', async (s) => {
      snapshot = s;

      const res = await call('post', `${BASE}/link`, owner).expect(409);

      expect(res.body.message).toMatch(/Telegram-бот/);
      expect(bindings.issueToken).not.toHaveBeenCalled();
    });

    it('200 with both deep links, a SHOP token issued for the caller, and an audit row', async () => {
      const res = await call('post', `${BASE}/link`, owner).expect(200);

      expect(res.body).toEqual({
        data: {
          deepLink: 'https://t.me/shop_bot?start=tok_en-123',
          groupDeepLink: 'https://t.me/shop_bot?startgroup=tok_en-123',
          expiresAt: '2026-10-01T12:15:00.000Z',
        },
      });
      expect(bindings.issueToken).toHaveBeenCalledWith({
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.SHOP,
        userId: owner.id,
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(prismaServiceMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'notification.createTelegramLink',
            entityType: 'notification',
          }),
        }),
      );
    });
  });

  describe('POST /telegram/test', () => {
    it('409 while the channel is not ok', async () => {
      snapshot = { state: 'unconfigured' };

      await call('post', `${BASE}/test`, owner).expect(409);
      expect(telegramClient.sendMessage).not.toHaveBeenCalled();
    });

    it('409 when no chat is connected', async () => {
      const res = await call('post', `${BASE}/test`, owner).expect(409);

      expect(res.body.message).toMatch(/Немає жодного підключеного чату/);
    });

    it('200 with one result per chat; a blocked chat is reported and revoked', async () => {
      const other = '7a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
      bindings.findActiveRecipients.mockResolvedValue([
        binding(BINDING_ID, '-1001'),
        binding(other, '42'),
      ]);
      const blocked = 'Telegram sendMessage failed (403): Forbidden: bot was blocked by the user';
      telegramClient.sendMessage
        .mockResolvedValueOnce({ message_id: 1 })
        .mockRejectedValueOnce(new TelegramApiError(blocked, 'permanent', 'sendMessage', 403));

      const res = await call('post', `${BASE}/test`, owner).expect(200);

      expect(res.body).toEqual({
        data: {
          results: [
            { bindingId: BINDING_ID, ok: true },
            { bindingId: other, ok: false, error: blocked, revoked: true },
          ],
        },
      });
      expect(telegramClient.sendMessage).toHaveBeenCalledWith('-1001', TELEGRAM_TEST_MESSAGE);
      expect(bindings.revokeByExternalId).toHaveBeenCalledWith(NotificationChannel.TELEGRAM, '42');
    });
  });

  describe('DELETE /telegram/bindings/:id', () => {
    it('204, scoped to TELEGRAM + SHOP', async () => {
      await call('delete', `${BASE}/bindings/${BINDING_ID}`, owner).expect(204);

      expect(bindings.revoke).toHaveBeenCalledWith(BINDING_ID, {
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.SHOP,
      });
    });

    it('404 when there is no such active chat', async () => {
      bindings.revoke.mockRejectedValue(new NotFoundException('Підключений чат не знайдено'));

      await call('delete', `${BASE}/bindings/${BINDING_ID}`, owner).expect(404);
    });

    it('400 for an id that is not a UUID', async () => {
      await call('delete', `${BASE}/bindings/not-a-uuid`, owner).expect(400);
      expect(bindings.revoke).not.toHaveBeenCalled();
    });
  });
});

function binding(id = BINDING_ID, externalId = '-1001') {
  return {
    id,
    channel: NotificationChannel.TELEGRAM,
    audience: NotificationAudience.SHOP,
    externalId,
    label: null,
    userId: null,
    orderId: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    revokedAt: null,
  };
}
