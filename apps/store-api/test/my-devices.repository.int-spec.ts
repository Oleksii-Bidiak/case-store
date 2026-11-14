import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { MyDevicesRepository } from '../src/my-devices/my-devices.repository';
import { MyDevicesService } from '../src/my-devices/my-devices.service';
import type { AccountDevicesSnapshot } from '../src/my-devices/my-devices.types';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for MyDevicesRepository (TASK-1959) — the REAL repository
 * against a REAL Postgres. What mocks cannot prove: the replace is a real
 * delete-and-insert scoped to ONE user, the merge reads and writes inside one
 * transaction (and rolls back), the enrichment joins the device model and its
 * brand, and an inactive model disappears from the read without its row being
 * lost.
 *
 * Requires the isolated `*_test` database with the current migrations applied
 * (DATABASE_URL is forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */
describe('MyDevicesRepository (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: MyDevicesRepository;
  let service: MyDevicesService;

  let userA: string;
  let userB: string;
  let brandId: string;
  let modelA: string;
  let modelB: string;
  let modelInactive: string;

  const t = (iso: string) => new Date(iso);

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, MyDevicesRepository, MyDevicesService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(MyDevicesRepository);
    service = moduleRef.get(MyDevicesService);

    const suffix = randomUUID();
    const brand = await prisma.deviceBrand.create({
      data: { name: 'Apple', slug: `int-apple-${suffix}` },
    });
    brandId = brand.id;
    const create = (name: string, isActive = true) =>
      prisma.deviceModel.create({
        data: {
          deviceBrandId: brandId,
          name,
          slug: `int-${name.toLowerCase().replace(/\s+/g, '-')}-${suffix}`,
          series: 'iPhone 15',
          isActive,
        },
      });
    modelA = (await create('iPhone 15 Pro')).id;
    modelB = (await create('iPhone 15')).id;
    modelInactive = (await create('iPhone 15 Old', false)).id;

    userA = (
      await prisma.user.create({
        data: { email: `int-dev-a-${suffix}@test.local`, passwordHash: 'x' },
      })
    ).id;
    userB = (
      await prisma.user.create({
        data: { email: `int-dev-b-${suffix}@test.local`, passwordHash: 'x' },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.userDevice.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.userDeviceSettings.deleteMany({ where: { userId: { in: [userA, userB] } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.deviceModel.deleteMany({ where: { deviceBrandId: brandId } });
    await prisma.deviceBrand.deleteMany({ where: { id: brandId } });
    await app.close();
  });

  // ─── findState ────────────────────────────────────────────────────────────

  it('an account with nothing saved reads as an empty list with the default settings', async () => {
    await expect(repo.findState(userA)).resolves.toEqual({
      devices: [],
      settings: { compatOnly: true, compatScope: 'active' },
    });
  });

  // ─── replaceState ─────────────────────────────────────────────────────────

  it('replaceState stores the list and reads it back most-recent first, enriched from the model and brand', async () => {
    const state = await repo.replaceState(userA, {
      devices: [
        { modelId: modelB, label: null, lastUsedAt: t('2026-11-01T10:00:00.000Z') },
        { modelId: modelA, label: 'Мама', lastUsedAt: t('2026-11-02T10:00:00.000Z') },
      ],
      settings: { compatOnly: false, compatScope: 'all' },
    });

    expect(state.settings).toEqual({ compatOnly: false, compatScope: 'all' });
    expect(state.devices).toEqual([
      {
        modelId: modelA,
        slug: expect.stringContaining('int-iphone-15-pro-'),
        name: 'iPhone 15 Pro',
        brandName: 'Apple',
        brandSlug: expect.stringContaining('int-apple-'),
        series: 'iPhone 15',
        label: 'Мама',
        lastUsedAt: t('2026-11-02T10:00:00.000Z'),
      },
      expect.objectContaining({ modelId: modelB, label: null }),
    ]);
    await expect(repo.findState(userA)).resolves.toEqual(state);
  });

  it('replaceState is a full replacement — rows missing from the new list are gone', async () => {
    await repo.replaceState(userA, {
      devices: [
        { modelId: modelA, label: null, lastUsedAt: t('2026-11-01T10:00:00.000Z') },
        { modelId: modelB, label: null, lastUsedAt: t('2026-11-01T11:00:00.000Z') },
      ],
      settings: { compatOnly: true, compatScope: 'active' },
    });

    await repo.replaceState(userA, {
      devices: [{ modelId: modelA, label: 'Робочий', lastUsedAt: t('2026-11-03T10:00:00.000Z') }],
      settings: { compatOnly: true, compatScope: 'active' },
    });

    const rows = await prisma.userDevice.findMany({ where: { userId: userA } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ deviceModelId: modelA, label: 'Робочий' }));
  });

  it('one user’s replace never touches another user’s devices or settings', async () => {
    await repo.replaceState(userB, {
      devices: [{ modelId: modelB, label: 'Тато', lastUsedAt: t('2026-11-01T10:00:00.000Z') }],
      settings: { compatOnly: false, compatScope: 'all' },
    });

    await repo.replaceState(userA, {
      devices: [],
      settings: { compatOnly: true, compatScope: 'active' },
    });

    const b = await repo.findState(userB);
    expect(b.devices.map((d) => d.modelId)).toEqual([modelB]);
    expect(b.settings).toEqual({ compatOnly: false, compatScope: 'all' });
    expect((await repo.findState(userA)).devices).toEqual([]);
  });

  // ─── inactive models ──────────────────────────────────────────────────────

  it('a model deactivated after saving is hidden from the read but its row survives', async () => {
    await prisma.userDevice.create({
      data: { userId: userA, deviceModelId: modelInactive, lastUsedAt: new Date() },
    });

    expect((await repo.findState(userA)).devices).toEqual([]);
    expect(await prisma.userDevice.count({ where: { userId: userA } })).toBe(1);
  });

  it('a PUT keeps a hidden device: reactivating its model brings it back', async () => {
    const toggled = (
      await prisma.deviceModel.create({
        data: {
          deviceBrandId: brandId,
          name: 'iPhone 14',
          slug: `int-iphone-14-${randomUUID()}`,
          series: 'iPhone 14',
        },
      })
    ).id;
    await repo.replaceState(userA, {
      devices: [{ modelId: toggled, label: 'Мама', lastUsedAt: t('2026-11-01T10:00:00.000Z') }],
      settings: { compatOnly: true, compatScope: 'active' },
    });
    await prisma.deviceModel.update({ where: { id: toggled }, data: { isActive: false } });

    // The storefront's mirror never saw the hidden device, so its PUT lacks it.
    await service.replaceState(userA, {
      devices: [{ modelId: modelA, label: null, lastUsedAt: '2026-11-05T10:00:00.000Z' }],
      settings: { compatOnly: true, compatScope: 'active' },
    });
    await prisma.deviceModel.update({ where: { id: toggled }, data: { isActive: true } });

    const state = await repo.findState(userA);
    expect(state.devices.map((d) => [d.modelId, d.label])).toEqual([
      [modelA, null],
      [toggled, 'Мама'],
    ]);
  });

  it('findActiveModelIds keeps only ids of existing, active models', async () => {
    const ids = await repo.findActiveModelIds([modelA, modelInactive, randomUUID()]);
    expect(ids).toEqual([modelA]);
  });

  // ─── mergeState ───────────────────────────────────────────────────────────

  it('mergeState hands the compute the account rows (settings null while no row exists)', async () => {
    await prisma.userDevice.create({
      data: {
        userId: userA,
        deviceModelId: modelA,
        label: 'Мама',
        lastUsedAt: t('2026-11-01T10:00:00.000Z'),
      },
    });

    let seen: AccountDevicesSnapshot | undefined;
    await repo.mergeState(userA, (account) => {
      seen = account;
      return { devices: account.devices, settings: { compatOnly: true, compatScope: 'active' } };
    });

    expect(seen).toEqual({
      devices: [{ modelId: modelA, label: 'Мама', lastUsedAt: t('2026-11-01T10:00:00.000Z') }],
      settings: null,
    });
  });

  it('the real merge: union, later lastUsedAt, guest label, account settings when the row exists', async () => {
    await repo.replaceState(userA, {
      devices: [{ modelId: modelA, label: 'Мама', lastUsedAt: t('2026-11-01T10:00:00.000Z') }],
      settings: { compatOnly: false, compatScope: 'active' },
    });

    const merged = await service.mergeGuestState(userA, {
      devices: [
        { modelId: modelA, label: 'Робочий', lastUsedAt: '2026-11-05T10:00:00.000Z' },
        { modelId: modelB, label: null, lastUsedAt: '2026-11-02T10:00:00.000Z' },
        { modelId: modelInactive, label: null, lastUsedAt: '2026-11-09T10:00:00.000Z' },
      ],
      settings: { compatOnly: true, compatScope: 'all' },
    });

    expect(merged.devices.map((d) => [d.modelId, d.label, d.lastUsedAt.toISOString()])).toEqual([
      [modelA, 'Робочий', '2026-11-05T10:00:00.000Z'],
      [modelB, null, '2026-11-02T10:00:00.000Z'],
    ]);
    expect(merged.settings).toEqual({ compatOnly: false, compatScope: 'active' });
    // The inactive guest model was dropped, not written.
    expect(
      await prisma.userDevice.count({ where: { userId: userA, deviceModelId: modelInactive } }),
    ).toBe(0);
  });

  it('mergeState hands the compute only the visible rows and keeps the hidden ones', async () => {
    await prisma.userDevice.create({
      data: {
        userId: userA,
        deviceModelId: modelInactive,
        label: 'Син',
        lastUsedAt: t('2026-11-01T10:00:00.000Z'),
      },
    });

    let seen: AccountDevicesSnapshot | undefined;
    await repo.mergeState(userA, (account) => {
      seen = account;
      return {
        devices: [{ modelId: modelA, label: null, lastUsedAt: t('2026-11-02T10:00:00.000Z') }],
        settings: { compatOnly: true, compatScope: 'active' },
      };
    });

    expect(seen?.devices).toEqual([]);
    const hidden = await prisma.userDevice.findMany({
      where: { userId: userA, deviceModelId: modelInactive },
    });
    expect(hidden).toEqual([expect.objectContaining({ label: 'Син' })]);
  });

  it('merging the same guest state twice changes nothing the second time', async () => {
    await repo.replaceState(userA, {
      devices: [{ modelId: modelA, label: 'Мама', lastUsedAt: t('2026-11-01T10:00:00.000Z') }],
      settings: { compatOnly: false, compatScope: 'active' },
    });
    const guest = {
      devices: [
        { modelId: modelA, label: null, lastUsedAt: '2026-11-03T10:00:00.000Z' },
        { modelId: modelB, label: 'Робочий', lastUsedAt: '2026-11-02T10:00:00.000Z' },
      ],
      settings: { compatOnly: true, compatScope: 'all' as const },
    };

    const first = await service.mergeGuestState(userA, guest);
    const second = await service.mergeGuestState(userA, guest);

    expect(second).toEqual(first);
    expect(first.devices.map((d) => [d.modelId, d.label])).toEqual([
      [modelA, 'Мама'],
      [modelB, 'Робочий'],
    ]);
  });

  it('two tabs writing at once: merge + merge and replace + merge both succeed without duplicates', async () => {
    const guest = {
      devices: [
        { modelId: modelA, label: 'Мама', lastUsedAt: '2026-11-03T10:00:00.000Z' },
        { modelId: modelB, label: null, lastUsedAt: '2026-11-02T10:00:00.000Z' },
      ],
      settings: { compatOnly: true, compatScope: 'active' as const },
    };

    await Promise.all([
      service.mergeGuestState(userA, guest),
      service.mergeGuestState(userA, guest),
    ]);
    await Promise.all([service.replaceState(userA, guest), service.mergeGuestState(userA, guest)]);

    const rows = await prisma.userDevice.findMany({ where: { userId: userA } });
    expect(rows.map((r) => r.deviceModelId).sort()).toEqual([modelA, modelB].sort());
  });

  it('one user’s merge is invisible to another user', async () => {
    await service.mergeGuestState(userB, {
      devices: [{ modelId: modelB, label: 'Тато', lastUsedAt: '2026-11-01T10:00:00.000Z' }],
      settings: { compatOnly: false, compatScope: 'all' },
    });

    const a = await repo.findState(userA);
    expect(a.devices).toEqual([]);
    expect(await prisma.userDeviceSettings.count({ where: { userId: userA } })).toBe(0);
  });

  it('a fresh account adopts the guest settings on merge', async () => {
    const merged = await service.mergeGuestState(userA, {
      devices: [],
      settings: { compatOnly: false, compatScope: 'all' },
    });

    expect(merged.settings).toEqual({ compatOnly: false, compatScope: 'all' });
    expect(await prisma.userDeviceSettings.count({ where: { userId: userA } })).toBe(1);
  });

  it('mergeState rolls back when the compute throws — the account is left as it was', async () => {
    await repo.replaceState(userA, {
      devices: [{ modelId: modelA, label: null, lastUsedAt: t('2026-11-01T10:00:00.000Z') }],
      settings: { compatOnly: true, compatScope: 'active' },
    });

    await expect(
      repo.mergeState(userA, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const rows = await prisma.userDevice.findMany({ where: { userId: userA } });
    expect(rows.map((r) => r.deviceModelId)).toEqual([modelA]);
  });

  it('mergeState rolls back a write that fails half-way (a model id with no row)', async () => {
    await repo.replaceState(userA, {
      devices: [{ modelId: modelA, label: null, lastUsedAt: t('2026-11-01T10:00:00.000Z') }],
      settings: { compatOnly: true, compatScope: 'active' },
    });

    await expect(
      repo.mergeState(userA, () => ({
        devices: [{ modelId: randomUUID(), label: null, lastUsedAt: new Date() }],
        settings: { compatOnly: false, compatScope: 'all' },
      })),
    ).rejects.toThrow();

    const state = await repo.findState(userA);
    expect(state.devices.map((d) => d.modelId)).toEqual([modelA]);
    expect(state.settings).toEqual({ compatOnly: true, compatScope: 'active' });
  });

  it('deleting the user cascades to the devices and the settings row', async () => {
    const suffix = randomUUID();
    const temp = await prisma.user.create({
      data: { email: `int-dev-tmp-${suffix}@test.local`, passwordHash: 'x' },
    });
    await repo.replaceState(temp.id, {
      devices: [{ modelId: modelA, label: null, lastUsedAt: new Date() }],
      settings: { compatOnly: true, compatScope: 'active' },
    });

    await prisma.user.delete({ where: { id: temp.id } });

    expect(await prisma.userDevice.count({ where: { userId: temp.id } })).toBe(0);
    expect(await prisma.userDeviceSettings.count({ where: { userId: temp.id } })).toBe(0);
  });
});
