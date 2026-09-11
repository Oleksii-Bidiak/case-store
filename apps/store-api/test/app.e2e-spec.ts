import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  // Mock PrismaService to prevent database connection errors in test environment.
  // `$queryRaw` is load-bearing: since TASK-305 /health pings the database and
  // reports `error` + 503 when the ping fails. A mock without it made the endpoint
  // report a down database, so this suite had been red — the check that was supposed
  // to prove /health tells the truth was itself failing unnoticed while CI was red
  // for other reasons (TASK-325/326).
  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env', '../.env'],
        }),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.setGlobalPrefix('api', {
      exclude: ['health'],
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('uptime');
          // `rateLimitStore: 'disabled'` because setup-e2e forces REDIS_HOST='':
          // the in-memory throttler store is a deliberate choice here, not an
          // outage, so `degraded` stays false (TASK-401).
          expect(res.body.checks).toEqual({ database: 'up', rateLimitStore: 'disabled' });
          expect(res.body.degraded).toBe(false);
        });
    });

    // The point of TASK-305: a deploy with a broken database must NOT get a green
    // smoke check. Without this case, /health could regress to a static "ok" and
    // the suite above would still pass.
    it('reports 503 and an error status when the database ping fails', async () => {
      prismaServiceMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));

      await request(app.getHttpServer())
        .get('/health')
        .expect(503)
        .expect((res) => {
          expect(res.body.status).toBe('error');
          expect(res.body.checks).toEqual({ database: 'down', rateLimitStore: 'disabled' });
        });
    });
  });
});
