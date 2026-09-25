import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SlugRedirectEntity } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { DeviceRepository } from '../src/device/device.repository';
import { DeviceService } from '../src/device/device.service';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository, SlugRedirectService } from '../src/slug-redirect';

/**
 * A device-model slug rename leaves a 308 behind — TASK-699, against a REAL Postgres.
 *
 * The model slug is the second segment of the public compatibility landing
 * `/catalog/<категорія>/<модель>` (TASK-490). The unit specs prove the service
 * decides and the repository composes; only a live database proves the new
 * `DEVICE_MODEL` enum value exists (its migration applied), that the ledger row
 * commits WITH the model update, and that a rename rejected by the unique slug
 * leaves no redirect to a slug nobody holds.
 */
describe('DeviceModel slug rename → SlugRedirect (integration, TASK-699)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: DeviceService;
  let lookup: SlugRedirectService;

  const s = randomUUID().slice(0, 8);
  const slug = (name: string) => `dm-rename-${name}-${s}`;

  let brandId: string;
  let activeId: string;
  let hiddenId: string;
  let otherId: string;

  async function ledger(): Promise<Array<{ oldSlug: string; newSlug: string }>> {
    const rows = await prisma.slugRedirect.findMany({
      where: { entity: SlugRedirectEntity.DEVICE_MODEL, oldSlug: { endsWith: s } },
      orderBy: { oldSlug: 'asc' },
    });
    return rows.map(({ oldSlug, newSlug }) => ({ oldSlug, newSlug }));
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        SlugRedirectRepository,
        SlugRedirectService,
        DeviceRepository,
        DeviceService,
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(DeviceService);
    lookup = moduleRef.get(SlugRedirectService);

    const brand = await prisma.deviceBrand.create({
      data: { name: `DM brand ${s}`, slug: slug('brand') },
    });
    brandId = brand.id;
    activeId = (
      await prisma.deviceModel.create({
        data: { deviceBrandId: brandId, name: 'Active', slug: slug('a1') },
      })
    ).id;
    hiddenId = (
      await prisma.deviceModel.create({
        data: { deviceBrandId: brandId, name: 'Hidden', slug: slug('h1'), isActive: false },
      })
    ).id;
    otherId = (
      await prisma.deviceModel.create({
        data: { deviceBrandId: brandId, name: 'Other', slug: slug('other') },
      })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.slugRedirect.deleteMany({
      where: { entity: SlugRedirectEntity.DEVICE_MODEL, oldSlug: { endsWith: s } },
    });
    await prisma.deviceModel.deleteMany({ where: { id: { in: [activeId, hiddenId, otherId] } } });
    await prisma.deviceBrand.deleteMany({ where: { id: brandId } });
    await app.close();
  });

  it('records the old slug of an ACTIVE model and resolves it to the new one', async () => {
    await service.updateModel(activeId, { slug: slug('a2') });

    expect(await ledger()).toEqual([{ oldSlug: slug('a1'), newSlug: slug('a2') }]);
    await expect(lookup.lookup(SlugRedirectEntity.DEVICE_MODEL, slug('a1'))).resolves.toEqual({
      newSlug: slug('a2'),
    });
  });

  it('collapses a second rename so every old slug points straight at the live one', async () => {
    await service.updateModel(activeId, { slug: slug('a3') });

    expect(await ledger()).toEqual([
      { oldSlug: slug('a1'), newSlug: slug('a3') },
      { oldSlug: slug('a2'), newSlug: slug('a3') },
    ]);
  });

  it('writes nothing for a model that was hidden — its address never answered', async () => {
    await service.updateModel(hiddenId, { slug: slug('h2') });

    const model = await prisma.deviceModel.findUnique({ where: { id: hiddenId } });
    expect(model?.slug).toBe(slug('h2'));
    expect(await ledger()).not.toContainEqual(expect.objectContaining({ oldSlug: slug('h1') }));
  });

  it('leaves no redirect behind when the rename loses the unique slug race', async () => {
    // The service's pre-check passes (nothing holds the slug yet); a concurrent
    // writer takes it between the check and the write. Simulated by writing through
    // the repository with a slug another model already holds.
    const repo = app.get(DeviceRepository);

    await expect(
      repo.updateModel(
        activeId,
        { slug: slug('other') },
        { oldSlug: slug('a3'), newSlug: slug('other') },
      ),
    ).rejects.toMatchObject({ code: 'P2002' });

    const model = await prisma.deviceModel.findUnique({ where: { id: activeId } });
    expect(model?.slug).toBe(slug('a3'));
    expect(await ledger()).not.toContainEqual(expect.objectContaining({ oldSlug: slug('a3') }));
  });
});
