import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminUserNoteController } from './admin-user-note.controller';
import { UserNoteService } from './user-note.service';
import { PermissionGuard } from '../auth/permissions';
import { REQUIRE_PERMISSION_KEY } from '../auth/permissions/require-permission.decorator';

const CUSTOMER_ID = 'user-uuid-1';
const AUTHOR_ID = 'manager-uuid-1';

describe('AdminUserNoteController (TASK-430)', () => {
  let controller: AdminUserNoteController;

  const serviceMock = {
    findByUser: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUserNoteController],
      providers: [{ provide: UserNoteService, useValue: serviceMock }],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AdminUserNoteController);
  });

  it('delegates the read to the service', async () => {
    serviceMock.findByUser.mockResolvedValue({ data: [], meta: { total: 0, limit: 50 } });

    const result = await controller.list(CUSTOMER_ID);

    expect(serviceMock.findByUser).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(result.meta.total).toBe(0);
  });

  it('takes the author from the access token, never from the body', async () => {
    serviceMock.create.mockResolvedValue({ id: 'note-uuid-1' });

    await controller.create(CUSTOMER_ID, AUTHOR_ID, { body: 'текст' });

    // Three positional args, and the author is the SECOND — the one the
    // `@CurrentUser('id')` decorator fills from the verified token. If this ever
    // became a body field, one operator could file a note under a colleague's
    // name, and the journal would stop being evidence of anything.
    expect(serviceMock.create).toHaveBeenCalledWith(CUSTOMER_ID, AUTHOR_ID, { body: 'текст' });
  });

  // ─── Staff-only, structurally ───────────────────────────────────────────────

  it('lives under an admin path, behind PermissionGuard', () => {
    // The admin path is what brings `permission.catalog.spec` to bear on these
    // routes: it fails the build for ANY route under `admin/` that is not guarded
    // and does not declare a requirement.
    expect(Reflect.getMetadata(PATH_METADATA, AdminUserNoteController)).toBe(
      'admin/users/:userId/notes',
    );
    expect(
      (Reflect.getMetadata(GUARDS_METADATA, AdminUserNoteController) as unknown[]) ?? [],
    ).toContain(PermissionGuard);
  });

  it('requires customers:read to read and customers:write to write', () => {
    const prototype = AdminUserNoteController.prototype as Record<string, object>;

    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, prototype.list)).toBe('customers:read');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, prototype.create)).toBe('customers:write');
  });

  it('offers no edit and no delete route', () => {
    const surface = Object.getOwnPropertyNames(AdminUserNoteController.prototype);

    expect(surface.sort()).toEqual(['constructor', 'create', 'list']);
  });

  it('is the ONLY controller in the API that can reach UserNoteService', () => {
    // The storefront-facing proof, and the reason it walks the real controller
    // classes rather than grepping: a note is what the shop says ABOUT a customer,
    // so no route a customer can call may return one. Injection is the narrowest
    // thing to assert — a controller that cannot reach the service cannot leak a
    // note, whatever its own guards say.
    const offenders: string[] = [];

    for (const file of findControllerFiles(resolve(__dirname, '..'))) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const moduleExports = require(file) as Record<string, unknown>;
      for (const exported of Object.values(moduleExports)) {
        if (typeof exported !== 'function') continue;
        const controller = exported as new (...args: never[]) => object;
        if (Reflect.getMetadata(PATH_METADATA, controller) === undefined) continue;
        if (controller === AdminUserNoteController) continue;

        const deps = (Reflect.getMetadata('design:paramtypes', controller) as unknown[]) ?? [];
        if (deps.includes(UserNoteService)) {
          offenders.push(controller.name);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/** Every `*.controller.ts` under src, excluding specs. Mirrors the walk in
 *  `permission.catalog.spec.ts` — real classes, real metadata, no source grepping. */
function findControllerFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findControllerFiles(full, found);
      continue;
    }
    if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      found.push(full);
    }
  }
  return found;
}
