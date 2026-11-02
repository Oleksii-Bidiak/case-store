import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import {
  DeliveryMethod,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnDecision,
  ReturnStatus,
  UserRole,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { PermissionRepository, type PermissionActor } from '../src/auth/permissions';
import { OrderMoneyRepository, type LockedOrder } from '../src/order/order-money.repository';
import { PrismaService } from '../src/prisma';
import { UserRepository } from '../src/user/user.repository';

/**
 * Shared harness for the R2 A3 money-door e2e suites
 * (`admin-order-money.e2e-spec.ts`, `order-money-reversal.e2e-spec.ts`).
 *
 * The real guard, validation pipe, controllers, `OrderMoneyService` and the
 * audit interceptor run; `OrderMoneyRepository` is the double (the Clean
 * Architecture boundary), so each suite states the locked order and the money
 * basis it wants and asserts on what was written. Permissions are per ACCOUNT
 * here, not per role — the matrix under test is "which keys open which door".
 */

export const ORDER_ID = 'b0000000-0000-4000-8000-0000000000a3';
export const RETURN_ID = 'b0000000-0000-4000-8000-0000000000c3';
export const ENTRY_ID = 'b0000000-0000-4000-8000-0000000000e3';
export const UPDATED_AT = new Date('2026-11-01T10:00:00.000Z');

/** Every account the suites sign in as, by what it may do. */
const GRANTS: Record<string, string[] | 'ADMIN'> = {
  'admin-money': 'ADMIN',
  'reader-money': ['orders:read'],
  'payreader-money': ['orders:read', 'payments:read'],
  'writer-money': ['orders:read', 'orders:write'],
  'refunder-money': ['orders:read', 'payments:refund'],
  'refunder-returns-money': ['orders:read', 'payments:refund', 'returns:write'],
  'corrector-money': ['orders:read', 'payments:correct'],
  'returns-writer-money': ['returns:read', 'returns:write'],
  'returns-reader-money': ['returns:read'],
};

export type MoneyAccount = keyof typeof GRANTS;

function actorOf(id: string): PermissionActor | null {
  const grant = GRANTS[id];
  if (!grant) return null;
  return {
    id,
    email: `${id}@shop.test`,
    role: grant === 'ADMIN' ? UserRole.ADMIN : UserRole.MANAGER,
    isOwner: false,
    permissions: new Set(grant === 'ADMIN' ? [] : grant),
  };
}

export interface MoneyBasisState {
  paidKop: number;
  refundedKop: number;
  returns: Array<{
    id: string;
    status: ReturnStatus;
    decision: ReturnDecision | null;
    creditKop: number | null;
    paidOutKop: number;
  }>;
}

export function createMoneyHarness() {
  const state: { locked: LockedOrder; basis: MoneyBasisState } = {
    locked: freshLocked(),
    basis: { paidKop: 0, refundedKop: 0, returns: [] },
  };
  const tx = { marker: 'money-tx' };

  const repository = {
    transaction: jest.fn((_id: string, body: (t: unknown, o: LockedOrder) => unknown) =>
      body(tx, state.locked),
    ),
    readBasis: jest.fn(async () => state.basis),
    insertEntry: jest.fn(async (_t: unknown, entry: Record<string, unknown>) => ({
      id: 'entry-new',
      returnId: null,
      ...entry,
    })),
    reverseEntry: jest.fn(),
    findEntry: jest.fn(),
    voidEntry: jest.fn(),
    recompute: jest.fn(async () => ({})),
    syncReturnStatus: jest.fn(),
    returnPaidOutKop: jest.fn(async () => 0),
    lockOrder: jest.fn(async () => state.locked),
    findSnapshot: jest.fn(async () => ({
      id: state.locked.id,
      status: state.locked.status,
      paymentStatus: state.locked.paymentStatus,
      paymentMethod: state.locked.paymentMethod,
      deliveryMethod: state.locked.deliveryMethod,
      totalKop: state.locked.totalKop,
      paidKop: state.basis.paidKop,
      refundedKop: state.basis.refundedKop,
      returnCreditKop: 0,
      balanceKop: state.locked.totalKop - state.basis.paidKop + state.basis.refundedKop,
      updatedAt: state.locked.updatedAt,
      entries: [],
      returns: [],
    })),
  };

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { findUnique: jest.fn() },
    refreshToken: { findUnique: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };

  let app: INestApplication;
  let jwt: JwtService;

  return {
    state,
    tx,
    repository,
    prisma,
    reset(): void {
      jest.clearAllMocks();
      state.locked = freshLocked();
      state.basis = { paidKop: 0, refundedKop: 0, returns: [] };
    },
    async boot(extra: (builder: ReturnType<typeof Test.createTestingModule>) => void = () => {}) {
      const builder = Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
          ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
          AppModule,
        ],
      });
      builder
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(PermissionRepository)
        .useValue({ findActor: jest.fn(async (id: string) => actorOf(id)) })
        .overrideProvider(AuthRepository)
        .useValue({ findById: jest.fn(), findByEmail: jest.fn() })
        .overrideProvider(UserRepository)
        .useValue({ findById: jest.fn(), findByEmail: jest.fn() })
        .overrideProvider(OrderMoneyRepository)
        .useValue(repository)
        .overrideProvider(ThrottlerStorage)
        .useValue({
          increment: async () => ({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
        });
      extra(builder);
      const moduleFixture = await builder.compile();

      app = moduleFixture.createNestApplication();
      jwt = moduleFixture.get(JwtService);
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
      return app;
    },
    token(account: MoneyAccount | 'customer-money'): string {
      return `Bearer ${jwt.sign(
        { sub: account, role: account === 'admin-money' ? UserRole.ADMIN : UserRole.MANAGER },
        { secret: process.env.JWT_SECRET, expiresIn: '15m' },
      )}`;
    },
    async close(): Promise<void> {
      await app.close();
    },
  };
}

function freshLocked(): LockedOrder {
  return {
    id: ORDER_ID,
    totalKop: 129_900,
    status: OrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: PaymentMethod.ON_DELIVERY,
    deliveryMethod: DeliveryMethod.NOVA_POSHTA,
    updatedAt: UPDATED_AT,
  };
}

/** Let the fire-and-forget audit write land. */
export const settle = () => new Promise((resolve) => setImmediate(resolve));
