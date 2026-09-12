import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
import { UserNoteRepository } from '../src/user-note';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the customer-notes journal (TASK-430).
 *
 * Three properties are worth proving at this level, and they are the three the
 * owner's decision rests on:
 *
 *   1. STAFF-ONLY. A customer must not reach the notes about themselves, and no
 *      storefront path may serve them at all.
 *   2. APPEND-ONLY, and the author is the TOKEN's subject — not a body field, or one
 *      operator could file a note under a colleague's name.
 *   3. The author reference SURVIVES the author's account being deleted. That is a
 *      database-level property (no foreign key), so it is asserted against the
 *      migration that creates the table as well as through the read path.
 *
 * Repositories are mocked: what is under test is the route contract and the guard,
 * not Prisma (covered in `user-note.repository.spec.ts`).
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const CUSTOMER_ID = 'customer-e2e-notes';
/** The owner: ADMIN, never subject to the permission matrix, so they can write. */
const OWNER_ID = 'admin-e2e-notes';
/** A MANAGER whose role holds `customers:read` and NOT `customers:write`. */
const MANAGER_ID = 'manager-e2e-notes';

describe('Customer notes (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const noteRepositoryMock = {
    findByUserId: jest.fn(),
    countByUserId: jest.fn(),
    create: jest.fn(),
  };

  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
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
    return `Bearer ${jwtService.sign(
      { sub: userId, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    )}`;
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
        createPermissionRepositoryMock({
          // MANAGER holds `customers:read` and nothing else, deliberately: the
          // write-refusal test below then fails for the RIGHT reason (a missing
          // `customers:write`) rather than because the matrix is empty, which would
          // pass the test while proving nothing. The writing actor is the OWNER,
          // who is never subject to the matrix at all.
          grants: { MANAGER: ['customers:read'] },
        }),
      )
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(UserNoteRepository)
      .useValue(noteRepositoryMock)
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
    userRepositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        email: `${id}@test.local`,
        originalEmail: null,
        role: id === CUSTOMER_ID ? 'CUSTOMER' : 'ADMIN',
      }),
    );
    noteRepositoryMock.findByUserId.mockResolvedValue([]);
    noteRepositoryMock.countByUserId.mockResolvedValue(0);
  });

  const url = `/api/admin/users/${CUSTOMER_ID}/notes`;

  // ─── Staff-only ───────────────────────────────────────────────────────────

  it('refuses an unauthenticated read', async () => {
    await request(app.getHttpServer()).get(url).expect(401);

    expect(noteRepositoryMock.findByUserId).not.toHaveBeenCalled();
  });

  it('refuses the CUSTOMER the notes are about', async () => {
    // The notes are what the shop says about a customer. Being the subject grants
    // nothing — there is no "my notes" here, by design.
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', auth(CUSTOMER_ID, 'CUSTOMER'))
      .expect(403);

    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', auth(CUSTOMER_ID, 'CUSTOMER'))
      .send({ body: 'я хороший клієнт' })
      .expect(403);

    expect(noteRepositoryMock.findByUserId).not.toHaveBeenCalled();
    expect(noteRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('serves NO storefront path — the notes exist only under admin/', async () => {
    // The route is `admin/users/:userId/notes`, which is what brings
    // `permission.catalog.spec` to bear on it. The plausible non-admin spellings
    // must not exist at all, for anyone.
    for (const path of [
      `/api/users/${CUSTOMER_ID}/notes`,
      `/api/users/me/notes`,
      `/api/user-notes`,
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', auth(OWNER_ID, 'ADMIN'))
        .expect(404);
    }
  });

  it('lets a MANAGER with customers:read read the journal', async () => {
    noteRepositoryMock.findByUserId.mockResolvedValue([
      {
        id: 'note-1',
        userId: CUSTOMER_ID,
        authorId: MANAGER_ID,
        authorEmail: 'manager@test.local',
        body: 'Просив передзвонити після 18:00.',
        createdAt: new Date('2026-09-13T07:24:00.000Z'),
      },
    ]);
    noteRepositoryMock.countByUserId.mockResolvedValue(1);

    const response = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', auth(MANAGER_ID, 'MANAGER'))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        authorEmail: 'manager@test.local',
        body: 'Просив передзвонити після 18:00.',
      }),
    );
    expect(response.body.meta).toEqual({ total: 1, limit: 50 });
  });

  it('refuses a write to a role that holds only customers:read', async () => {
    // The MANAGER role holds `customers:read` in this suite's matrix, so the 403
    // is the missing `customers:write` and not an empty matrix.
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', auth(MANAGER_ID, 'MANAGER'))
      .send({ body: 'нотатка' })
      .expect(403);

    expect(noteRepositoryMock.create).not.toHaveBeenCalled();
  });

  // ─── Append-only, author from the token ───────────────────────────────────

  it('stamps the author from the token and ignores an author in the body', async () => {
    noteRepositoryMock.create.mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({
        id: 'note-2',
        createdAt: new Date('2026-09-13T07:30:00.000Z'),
        ...input,
      }),
    );

    // `forbidNonWhitelisted` rejects the smuggled fields outright — the strongest
    // form of "the client cannot choose the author".
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', auth(OWNER_ID, 'ADMIN'))
      .send({ body: 'нотатка', authorId: 'someone-else', authorEmail: 'ceo@test.local' })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post(url)
      .set('Authorization', auth(OWNER_ID, 'ADMIN'))
      .send({ body: 'нотатка' })
      .expect(201);

    expect(noteRepositoryMock.create).toHaveBeenCalledWith({
      userId: CUSTOMER_ID,
      authorId: OWNER_ID,
      authorEmail: `${OWNER_ID}@test.local`,
      body: 'нотатка',
    });
    expect(response.body.data.authorId).toBe(OWNER_ID);
  });

  it('rejects an empty or whitespace-only note', async () => {
    for (const body of ['', '   ', '\n\t']) {
      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', auth(OWNER_ID, 'ADMIN'))
        .send({ body })
        .expect(400);
    }

    expect(noteRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('rejects a note longer than the cap', async () => {
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', auth(OWNER_ID, 'ADMIN'))
      .send({ body: 'я'.repeat(2001) })
      .expect(400);

    expect(noteRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('offers no edit and no delete route', async () => {
    // The journal shape IS the feature: the only way to correct an entry is to write
    // another one. A PATCH or DELETE appearing later would be a silent overwrite of
    // a colleague's words.
    await request(app.getHttpServer())
      .patch(`${url}/note-1`)
      .set('Authorization', auth(OWNER_ID, 'ADMIN'))
      .send({ body: 'inplace edit' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`${url}/note-1`)
      .set('Authorization', auth(OWNER_ID, 'ADMIN'))
      .expect(404);
  });

  it('404s for an unknown customer rather than answering with an empty journal', async () => {
    userRepositoryMock.findById.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/admin/users/does-not-exist/notes')
      .set('Authorization', auth(OWNER_ID, 'ADMIN'))
      .expect(404);
  });

  // ─── The author outliving their account ───────────────────────────────────

  it('renders a note whose author account is gone', async () => {
    noteRepositoryMock.findByUserId.mockResolvedValue([
      {
        id: 'note-3',
        userId: CUSTOMER_ID,
        // The account was deleted; the snapshot is all that is left, and it is
        // enough to read the entry.
        authorId: null,
        authorEmail: 'fired@test.local',
        body: 'Клієнт просив рахунок на ФОП.',
        createdAt: new Date('2026-09-13T07:24:00.000Z'),
      },
    ]);
    noteRepositoryMock.countByUserId.mockResolvedValue(1);

    const response = await request(app.getHttpServer())
      .get(url)
      .set('Authorization', auth(OWNER_ID, 'ADMIN'))
      .expect(200);

    expect(response.body.data[0].authorId).toBeNull();
    expect(response.body.data[0].authorEmail).toBe('fired@test.local');
    expect(response.body.data[0].body).toBe('Клієнт просив рахунок на ФОП.');
  });

  it('creates user_notes with NO foreign key on author_id', () => {
    // The read path above proves the API copes. This proves the DATABASE does: with
    // a real relation, deleting a staff account would either cascade the note away
    // or be refused outright, and both outcomes lose the record of what somebody
    // said about a customer. `user_id` is the only FK the table has — a note about
    // nobody is meaningless, a note by nobody is not.
    const migrationsDir = resolve(__dirname, '../prisma/migrations');
    const sql = readdirSync(migrationsDir)
      .map((dir) => join(migrationsDir, dir, 'migration.sql'))
      .filter((file) => file.endsWith('migration.sql'))
      .map((file) => {
        try {
          return readFileSync(file, 'utf8');
        } catch {
          return '';
        }
      })
      .filter((body) => body.includes('"user_notes"'))
      .join('\n');

    expect(sql).toContain('CREATE TABLE "user_notes"');
    expect(sql).toContain('"author_id" TEXT');
    // Exactly one FK, and it is the customer.
    const foreignKeys = sql.match(/ADD CONSTRAINT "user_notes_[^"]+_fkey"/g) ?? [];
    expect(foreignKeys).toEqual(['ADD CONSTRAINT "user_notes_user_id_fkey"']);
  });
});
