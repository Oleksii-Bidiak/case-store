import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { AddonServiceService } from '../src/addon-service/addon-service.service';
import { AttributeDefinitionService } from '../src/attribute-definition/attribute-definition.service';
import { BannerService } from '../src/banners/banners.service';
import { BlogService } from '../src/blog/blog.service';
import { BrandService } from '../src/brand/brand.service';
import { CarouselService } from '../src/carousels/carousels.service';
import { CategoryService } from '../src/category/category.service';
import { DeviceService } from '../src/device/device.service';
import { DiscountService } from '../src/discount/discount.service';
import { FaqService } from '../src/faq/faq.service';
import { PageService } from '../src/pages/pages.service';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the `:read` keys of the reference and content sections (TASK-666, plan 186,
 * decision B-9 №5) — the AC, section by section, over real HTTP:
 *
 *   - a manager holding ONLY `x:read` gets 200 on every admin GET of the section;
 *   - the same manager gets 403 on EVERY write route of it, and the request never
 *     reaches the service (so no repository write can happen);
 *   - a manager holding `x:write` still opens the GETs — nobody loses a screen.
 *
 * The sections' services are replaced by stubs built from their own prototypes: this
 * suite is about the guard, and each GET handler only wraps the service result in the
 * `{ data, meta? }` envelope, so one paginated-looking stub answers every read. The
 * route-metadata half of the same rules (every GET of a section accepts `x:read`, no
 * write does) is pinned without HTTP in `permission.catalog.spec.ts`. `home:read` is
 * covered by `home-blocks.e2e-spec.ts`.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const ID = '550e8400-e29b-41d4-a716-446655440001';
const ID2 = '550e8400-e29b-41d4-a716-446655440002';

/** Answers every read: list handlers read `.items`/`.meta`, the rest wrap it as is. */
const STUB_RESULT = { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };

type ServiceClass = abstract new (...args: never[]) => object;
type ServiceStub = Record<string, jest.Mock>;

/** A stub with a `jest.fn` for every method on the class (and its parents). */
function stubFor(service: ServiceClass): ServiceStub {
  const stub: ServiceStub = {};
  let proto: object | null = service.prototype as object;
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name in stub) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (typeof descriptor?.value === 'function') {
        stub[name] = jest.fn(() => Promise.resolve(STUB_RESULT));
      }
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return stub;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Route = readonly [Method, string];

interface Section {
  name: string;
  read: string;
  write: string;
  service: ServiceClass;
  reads: readonly string[];
  writes: readonly Route[];
}

const SECTIONS: readonly Section[] = [
  {
    name: 'categories',
    read: 'categories:read',
    write: 'categories:write',
    service: CategoryService,
    reads: ['/api/admin/categories', `/api/admin/categories/${ID}`, '/api/categories/admin/tree'],
    writes: [
      ['post', '/api/admin/categories'],
      ['put', `/api/admin/categories/${ID}`],
      ['patch', '/api/admin/categories/reorder'],
      ['patch', '/api/admin/categories/status'],
      ['patch', `/api/admin/categories/${ID}/activate`],
      ['patch', `/api/admin/categories/${ID}/deactivate`],
      ['delete', `/api/admin/categories/${ID}`],
    ],
  },
  {
    name: 'brands',
    read: 'brands:read',
    write: 'brands:write',
    service: BrandService,
    reads: ['/api/brands/admin/list', `/api/brands/admin/${ID}`],
    writes: [
      ['post', '/api/brands'],
      ['patch', `/api/brands/${ID}`],
      ['patch', `/api/brands/${ID}/status`],
    ],
  },
  {
    name: 'devices',
    read: 'devices:read',
    write: 'devices:write',
    service: DeviceService,
    reads: [
      '/api/admin/devices/brands',
      `/api/admin/devices/brands/${ID}`,
      '/api/admin/devices/models',
      `/api/admin/devices/models/${ID}`,
    ],
    writes: [
      ['patch', '/api/admin/devices/brands/reorder'],
      ['post', '/api/admin/devices/brands'],
      ['put', `/api/admin/devices/brands/${ID}`],
      ['patch', `/api/admin/devices/brands/${ID}/activate`],
      ['patch', `/api/admin/devices/brands/${ID}/deactivate`],
      ['post', '/api/admin/devices/models'],
      ['put', `/api/admin/devices/models/${ID}`],
      ['patch', `/api/admin/devices/models/${ID}/activate`],
      ['patch', `/api/admin/devices/models/${ID}/deactivate`],
    ],
  },
  {
    name: 'attributes',
    read: 'attributes:read',
    write: 'attributes:write',
    service: AttributeDefinitionService,
    reads: [
      `/api/categories/${ID}/attribute-definitions`,
      `/api/categories/${ID}/effective-attribute-definitions`,
      `/api/categories/${ID}/facet-ceiling`,
    ],
    writes: [
      ['post', `/api/categories/${ID}/attribute-definitions`],
      ['patch', `/api/categories/${ID}/attribute-definitions/reorder`],
      ['patch', `/api/attribute-definitions/${ID2}`],
      ['delete', `/api/attribute-definitions/${ID2}`],
    ],
  },
  {
    name: 'addons',
    read: 'addons:read',
    write: 'addons:write',
    service: AddonServiceService,
    reads: [
      '/api/addon-services/admin/list',
      '/api/addon-services/admin/active',
      `/api/addon-services/admin/${ID}`,
      `/api/addon-services/templates/category/${ID}`,
      `/api/addon-services/templates/category/${ID}/resolved`,
      `/api/addon-services/deltas/product/${ID}`,
    ],
    writes: [
      ['post', '/api/addon-services'],
      ['patch', `/api/addon-services/${ID}`],
      ['patch', `/api/addon-services/${ID}/status`],
      ['patch', `/api/addon-services/templates/category/${ID}`],
      ['put', `/api/addon-services/deltas/product/${ID}/${ID2}`],
      ['delete', `/api/addon-services/deltas/product/${ID}/${ID2}`],
    ],
  },
  {
    name: 'discounts',
    read: 'discounts:read',
    write: 'discounts:write',
    service: DiscountService,
    reads: ['/api/admin/discounts', `/api/admin/discounts/${ID}`],
    writes: [
      ['post', '/api/admin/discounts'],
      ['patch', `/api/admin/discounts/${ID}`],
      ['delete', `/api/admin/discounts/${ID}`],
    ],
  },
  {
    name: 'pages',
    read: 'pages:read',
    write: 'pages:write',
    service: PageService,
    reads: ['/api/admin/pages', `/api/admin/pages/${ID}`],
    writes: [
      ['patch', '/api/admin/pages/reorder'],
      ['post', '/api/admin/pages'],
      ['put', `/api/admin/pages/${ID}`],
      ['patch', `/api/admin/pages/${ID}/publish`],
      ['patch', `/api/admin/pages/${ID}/unpublish`],
      ['delete', `/api/admin/pages/${ID}`],
    ],
  },
  {
    name: 'blog',
    read: 'blog:read',
    write: 'blog:write',
    service: BlogService,
    reads: [
      '/api/admin/blog/categories',
      `/api/admin/blog/categories/${ID}`,
      '/api/admin/blog/posts',
      `/api/admin/blog/posts/${ID}`,
    ],
    writes: [
      ['patch', '/api/admin/blog/categories/reorder'],
      ['post', '/api/admin/blog/categories'],
      ['put', `/api/admin/blog/categories/${ID}`],
      ['delete', `/api/admin/blog/categories/${ID}`],
      ['post', '/api/admin/blog/posts'],
      ['put', `/api/admin/blog/posts/${ID}`],
      ['patch', `/api/admin/blog/posts/${ID}/publish`],
      ['patch', `/api/admin/blog/posts/${ID}/unpublish`],
      ['delete', `/api/admin/blog/posts/${ID}`],
    ],
  },
  {
    name: 'banners',
    read: 'banners:read',
    write: 'banners:write',
    service: BannerService,
    reads: ['/api/admin/banners', `/api/admin/banners/${ID}`],
    writes: [
      ['patch', '/api/admin/banners/reorder'],
      ['post', '/api/admin/banners'],
      ['put', `/api/admin/banners/${ID}`],
      ['patch', `/api/admin/banners/${ID}/publish`],
      ['patch', `/api/admin/banners/${ID}/unpublish`],
      ['delete', `/api/admin/banners/${ID}`],
    ],
  },
  {
    name: 'carousels',
    read: 'carousels:read',
    write: 'carousels:write',
    service: CarouselService,
    reads: [
      '/api/admin/carousels',
      `/api/admin/carousels/${ID}`,
      `/api/admin/carousels/${ID}/items`,
    ],
    writes: [
      ['patch', '/api/admin/carousels/reorder'],
      ['post', '/api/admin/carousels'],
      ['put', `/api/admin/carousels/${ID}`],
      ['patch', `/api/admin/carousels/${ID}/publish`],
      ['patch', `/api/admin/carousels/${ID}/unpublish`],
      ['delete', `/api/admin/carousels/${ID}`],
      ['put', `/api/admin/carousels/${ID}/items`],
    ],
  },
  {
    name: 'faq',
    read: 'faq:read',
    write: 'faq:write',
    service: FaqService,
    reads: ['/api/admin/faq', `/api/admin/faq/${ID}`],
    writes: [
      ['patch', '/api/admin/faq/reorder'],
      ['post', '/api/admin/faq'],
      ['put', `/api/admin/faq/${ID}`],
      ['delete', `/api/admin/faq/${ID}`],
    ],
  },
];

describe('Read-only section permissions (e2e, TASK-666)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const permissions = createPermissionRepositoryMock();
  const stubs = new Map<ServiceClass, ServiceStub>(
    SECTIONS.map((section) => [section.service, stubFor(section.service)] as const),
  );

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

  const managerAuth = () =>
    `Bearer ${jwtService.sign(
      { sub: 'manager-read-1', email: 'manager-read-1@example.com', role: 'MANAGER' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    )}`;

  const send = (method: Method, path: string, auth: string) => {
    const req = request(app.getHttpServer())[method](path).set('Authorization', auth);
    return method === 'get' || method === 'delete' ? req : req.send({});
  };

  beforeAll(async () => {
    let builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(permissions)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough);
    for (const [service, stub] of stubs) {
      builder = builder.overrideProvider(service).useValue(stub);
    }
    const moduleFixture: TestingModule = await builder.compile();

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
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // clear, not reset: the stubs keep their resolved value between tests.
    jest.clearAllMocks();
    permissions.setGrants(UserRole.MANAGER, []);
  });

  describe.each(SECTIONS)('$name', (section) => {
    const stub = () => stubs.get(section.service) as ServiceStub;
    const calledMethods = () =>
      Object.entries(stub())
        .filter(([, fn]) => fn.mock.calls.length > 0)
        .map(([name]) => name);

    it(`refuses every GET to a manager holding neither ${section.read} nor ${section.write}`, async () => {
      const auth = managerAuth();
      for (const path of section.reads) {
        await send('get', path, auth).expect(403);
      }
      expect(calledMethods()).toEqual([]);
    });

    it(`opens every GET with ${section.read} alone`, async () => {
      permissions.setGrants(UserRole.MANAGER, [section.read]);
      const auth = managerAuth();
      for (const path of section.reads) {
        const res = await send('get', path, auth);
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
    });

    it(`refuses EVERY write to ${section.read} alone, before the service is reached`, async () => {
      permissions.setGrants(UserRole.MANAGER, [section.read]);
      const auth = managerAuth();
      for (const [method, path] of section.writes) {
        const res = await send(method, path, auth);
        expect({ method, path, status: res.status }).toEqual({ method, path, status: 403 });
        expect((res.body as { message?: string }).message).toBe('Admin access required');
      }
      expect(calledMethods()).toEqual([]);
    });

    it(`still opens every GET with ${section.write} — nobody loses a screen`, async () => {
      permissions.setGrants(UserRole.MANAGER, [section.write]);
      const auth = managerAuth();
      for (const path of section.reads) {
        const res = await send('get', path, auth);
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
    });
  });
});
