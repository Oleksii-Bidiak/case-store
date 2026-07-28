import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DeliverySetting } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { CacheService } from '../cache';
import { DeliveryService, KYIV_CITY_REF } from './delivery.service';
import { DeliveryNotConfiguredException } from './delivery.errors';
import type { DeliveryRepository } from './delivery.repository';
import type { NovaPoshtaClient, NpSettlementRaw, NpWarehouseRaw } from './nova-poshta.client';

// ─── Stubs ─────────────────────────────────────────────────────────────────

/** ConfigService stub backed by a plain key→value map. */
function makeConfig(values: Record<string, unknown> = {}): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

/** No-op PinoLogger stub. */
function makeLogger(): jest.Mocked<PinoLogger> {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as unknown as jest.Mocked<PinoLogger>;
}

/** In-memory CacheService stub: get returns null unless primed via set. */
function makeCache(): jest.Mocked<Pick<CacheService, 'get' | 'set' | 'del' | 'delByPrefix'>> {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    delByPrefix: jest.fn(async (prefix: string) => {
      for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
    }),
  } as unknown as jest.Mocked<Pick<CacheService, 'get' | 'set' | 'del' | 'delByPrefix'>>;
}

const settingRow = (over: Partial<DeliverySetting> = {}): DeliverySetting => ({
  id: '00000000-0000-0000-0000-000000000003',
  senderCityRef: null,
  senderCityName: null,
  senderWarehouseRef: null,
  defaultWeightKg: 0.5,
  createdAt: new Date('2026-07-28T00:00:00Z'),
  updatedAt: new Date('2026-07-28T00:00:00Z'),
  ...over,
});

/** DeliveryRepository stub — no settings row by default. */
function makeRepository(
  overrides: Partial<jest.Mocked<DeliveryRepository>> = {},
): jest.Mocked<DeliveryRepository> {
  return {
    findSettings: jest.fn(async () => null),
    upsertSettings: jest.fn(async (data) => settingRow(data as Partial<DeliverySetting>)),
    ...overrides,
  } as unknown as jest.Mocked<DeliveryRepository>;
}

function makeClient(
  overrides: Partial<jest.Mocked<NovaPoshtaClient>> = {},
): jest.Mocked<NovaPoshtaClient> {
  return {
    isConfigured: jest.fn(() => true),
    searchCities: jest.fn(async () => []),
    searchWarehouses: jest.fn(async () => []),
    estimateShipping: jest.fn(async () => ({ cost: 0, etaDays: null })),
    ...overrides,
  } as unknown as jest.Mocked<NovaPoshtaClient>;
}

function makeService(opts: {
  client?: jest.Mocked<NovaPoshtaClient>;
  repository?: jest.Mocked<DeliveryRepository>;
  cache?: ReturnType<typeof makeCache>;
  config?: ConfigService;
}) {
  const client = opts.client ?? makeClient();
  const repository = opts.repository ?? makeRepository();
  const cache = opts.cache ?? makeCache();
  const config = opts.config ?? makeConfig();
  const logger = makeLogger();
  const service = new DeliveryService(
    client,
    repository,
    cache as unknown as CacheService,
    config,
    logger,
  );
  return { service, client, repository, cache, config, logger };
}

const cityRaw = (over: Partial<NpSettlementRaw> = {}): NpSettlementRaw => ({
  Present: 'м. Київ, Київська обл.',
  MainDescription: 'Київ',
  Area: 'Київська',
  Ref: 'settlement-ref-1',
  DeliveryCity: 'city-ref-1',
  Warehouses: 1234,
  ...over,
});

const warehouseRaw = (over: Partial<NpWarehouseRaw> = {}): NpWarehouseRaw => ({
  Ref: 'wh-ref-1',
  Description: 'Відділення №1',
  Number: '1',
  TypeOfWarehouse: 'type-1',
  CityRef: 'city-ref-1',
  ...over,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DeliveryService', () => {
  describe('isConfigured', () => {
    it('delegates to the NP client', () => {
      const client = makeClient({ isConfigured: jest.fn(() => false) });
      const { service } = makeService({ client });
      expect(service.isConfigured()).toBe(false);
      expect(client.isConfigured).toHaveBeenCalled();
    });
  });

  describe('searchCities', () => {
    it('throws BadRequestException for a query shorter than 2 characters', async () => {
      const { service, client } = makeService({});
      await expect(service.searchCities('a')).rejects.toBeInstanceOf(BadRequestException);
      expect(client.searchCities).not.toHaveBeenCalled();
    });

    it('maps the raw NP settlement onto the city DTO (ref = DeliveryCity)', async () => {
      const client = makeClient({ searchCities: jest.fn(async () => [cityRaw()]) });
      const { service } = makeService({ client });

      const result = await service.searchCities('Київ');

      expect(result).toEqual([
        { ref: 'city-ref-1', name: 'м. Київ, Київська обл.', area: 'Київська', warehouses: 1234 },
      ]);
    });

    it('caches the result with a 1-hour TTL and serves the cache on the next call', async () => {
      const client = makeClient({ searchCities: jest.fn(async () => [cityRaw()]) });
      const cache = makeCache();
      const { service } = makeService({ client, cache });

      await service.searchCities('Київ');
      await service.searchCities('Київ');

      expect(client.searchCities).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledWith('np:cities:київ', expect.any(Array), 3600);
    });
  });

  describe('searchWarehouses', () => {
    it('maps the raw warehouse onto the DTO and caches with a 30-minute TTL', async () => {
      const client = makeClient({
        searchWarehouses: jest.fn(async () => [warehouseRaw()]),
      });
      const cache = makeCache();
      const { service } = makeService({ client, cache });

      const result = await service.searchWarehouses('city-ref-1');

      expect(result).toEqual([
        { ref: 'wh-ref-1', description: 'Відділення №1', number: '1', typeOfWarehouse: 'type-1' },
      ]);
      expect(cache.set).toHaveBeenCalledWith('np:warehouses:city-ref-1:', expect.any(Array), 1800);
    });

    it('serves a cache hit without calling the client', async () => {
      const client = makeClient({
        searchWarehouses: jest.fn(async () => [warehouseRaw()]),
      });
      const cache = makeCache();
      const { service } = makeService({ client, cache });

      await service.searchWarehouses('city-ref-1');
      await service.searchWarehouses('city-ref-1');

      expect(client.searchWarehouses).toHaveBeenCalledTimes(1);
    });
  });

  describe('estimateShipping', () => {
    it('returns the mapped cost (2dp) + ETA and caches it', async () => {
      const client = makeClient({
        estimateShipping: jest.fn(async () => ({ cost: 60, etaDays: 2 })),
      });
      const cache = makeCache();
      const { service } = makeService({ client, cache });

      const result = await service.estimateShipping('city-ref-1');

      expect(result).toEqual({ cost: '60.00', etaDays: 2 });
      expect(cache.set).toHaveBeenCalledWith(
        `np:estimate:${KYIV_CITY_REF}:city-ref-1:0.5`,
        { cost: '60.00', etaDays: 2 },
        1800,
      );
    });

    it('falls back to a zero estimate (never throws) when the client errors', async () => {
      const client = makeClient({
        estimateShipping: jest.fn(async () => {
          throw new Error('NP down');
        }),
      });
      const { service } = makeService({ client });

      await expect(service.estimateShipping('city-ref-1')).resolves.toEqual({
        cost: '0.00',
        etaDays: null,
      });
    });
  });

  // ─── TASK-337: the unconfigured branch ─────────────────────────────────────

  describe('estimateShipping when Nova Poshta is not configured', () => {
    const unconfigured = () => makeClient({ isConfigured: jest.fn(() => false) });

    it('THROWS in production rather than quietly charging 0', async () => {
      const client = unconfigured();
      const config = makeConfig({ NODE_ENV: 'production' });
      const { service } = makeService({ client, config });

      await expect(service.estimateShipping('city-ref-1')).rejects.toBeInstanceOf(
        DeliveryNotConfiguredException,
      );
      expect(client.estimateShipping).not.toHaveBeenCalled();
    });

    it('degrades to 0.00 outside production so local checkout still works', async () => {
      const { service } = makeService({
        client: unconfigured(),
        config: makeConfig({ NODE_ENV: 'development' }),
      });

      await expect(service.estimateShipping('city-ref-1')).resolves.toEqual({
        cost: '0.00',
        etaDays: null,
      });
    });

    it('logs at ERROR level in both cases — a zero here must reach Sentry', async () => {
      const { service, logger } = makeService({
        client: unconfigured(),
        config: makeConfig({ NODE_ENV: 'development' }),
      });

      await service.estimateShipping('city-ref-1');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'delivery.notConfigured' }),
        expect.stringContaining('NP_API_KEY is not set'),
      );
    });

    it('never reaches the DB or the cache when unconfigured', async () => {
      const repository = makeRepository();
      const cache = makeCache();
      const { service } = makeService({ client: unconfigured(), repository, cache });

      await service.estimateShipping('city-ref-1');

      expect(repository.findSettings).not.toHaveBeenCalled();
      expect(cache.get).not.toHaveBeenCalled();
    });
  });

  // ─── TASK-080-E: DeliverySetting-driven dispatch origin ────────────────────

  describe('dispatch-origin resolution', () => {
    const client = () =>
      makeClient({ estimateShipping: jest.fn(async () => ({ cost: 75, etaDays: 1 })) });

    it('falls back to Kyiv with neither a DB row nor an env var', async () => {
      const c = client();
      const { service } = makeService({ client: c });

      await service.estimateShipping('city-ref-1');

      expect(c.estimateShipping).toHaveBeenCalledWith({
        recipientCityRef: 'city-ref-1',
        senderCityRef: KYIV_CITY_REF,
        weight: 0.5,
      });
    });

    it('uses NP_SENDER_CITY_REF when there is no DB row', async () => {
      const c = client();
      const { service } = makeService({
        client: c,
        config: makeConfig({ NP_SENDER_CITY_REF: 'lviv-ref' }),
      });

      await service.estimateShipping('city-ref-1');

      expect(c.estimateShipping).toHaveBeenCalledWith(
        expect.objectContaining({ senderCityRef: 'lviv-ref' }),
      );
    });

    it('lets the DeliverySetting row OVERRIDE the env var', async () => {
      const c = client();
      const repository = makeRepository({
        findSettings: jest.fn(async () => settingRow({ senderCityRef: 'odesa-ref' })),
      });
      const { service } = makeService({
        client: c,
        repository,
        config: makeConfig({ NP_SENDER_CITY_REF: 'lviv-ref' }),
      });

      await service.estimateShipping('city-ref-1');

      expect(c.estimateShipping).toHaveBeenCalledWith(
        expect.objectContaining({ senderCityRef: 'odesa-ref' }),
      );
    });

    it('ignores an empty senderCityRef and continues down the chain', async () => {
      const c = client();
      const repository = makeRepository({
        findSettings: jest.fn(async () => settingRow({ senderCityRef: '' })),
      });
      const { service } = makeService({
        client: c,
        repository,
        config: makeConfig({ NP_SENDER_CITY_REF: 'lviv-ref' }),
      });

      await service.estimateShipping('city-ref-1');

      expect(c.estimateShipping).toHaveBeenCalledWith(
        expect.objectContaining({ senderCityRef: 'lviv-ref' }),
      );
    });

    it('uses the row’s defaultWeightKg and keys the cache by it', async () => {
      const c = client();
      const repository = makeRepository({
        findSettings: jest.fn(async () => settingRow({ defaultWeightKg: 2 })),
      });
      const cache = makeCache();
      const { service } = makeService({ client: c, repository, cache });

      await service.estimateShipping('city-ref-1');

      expect(c.estimateShipping).toHaveBeenCalledWith(expect.objectContaining({ weight: 2 }));
      expect(cache.set).toHaveBeenCalledWith(
        `np:estimate:${KYIV_CITY_REF}:city-ref-1:2`,
        expect.anything(),
        1800,
      );
    });

    it('caches the resolved origin instead of reading the DB per estimate', async () => {
      const repository = makeRepository();
      const { service } = makeService({ client: client(), repository });

      await service.estimateShipping('city-ref-1');
      await service.estimateShipping('city-ref-2');

      expect(repository.findSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSettings', () => {
    it('returns an all-null shape with the default weight when unwritten', async () => {
      const { service } = makeService({});

      await expect(service.getSettings()).resolves.toEqual({
        senderCityRef: null,
        senderCityName: null,
        senderWarehouseRef: null,
        defaultWeightKg: 0.5,
        updatedAt: null,
      });
    });

    it('maps the row and never leaks the singleton id', async () => {
      const repository = makeRepository({
        findSettings: jest.fn(async () =>
          settingRow({ senderCityRef: 'kyiv-ref', senderCityName: 'м. Київ' }),
        ),
      });
      const { service } = makeService({ repository });

      const result = await service.getSettings();

      expect(result).toMatchObject({ senderCityRef: 'kyiv-ref', senderCityName: 'м. Київ' });
      expect(result).not.toHaveProperty('id');
    });
  });

  describe('updateSettings', () => {
    it('upserts and returns the mapped row', async () => {
      const repository = makeRepository();
      const { service } = makeService({ repository });

      const result = await service.updateSettings({ senderCityRef: 'odesa-ref' });

      expect(repository.upsertSettings).toHaveBeenCalledWith({ senderCityRef: 'odesa-ref' });
      expect(result.senderCityRef).toBe('odesa-ref');
    });

    it('evicts the cached origin AND every cached estimate', async () => {
      const cache = makeCache();
      const { service } = makeService({ cache });

      await service.updateSettings({ senderCityRef: 'odesa-ref' });

      expect(cache.del).toHaveBeenCalledWith('np:origin');
      expect(cache.delByPrefix).toHaveBeenCalledWith('np:estimate:');
    });

    it('takes effect on the very next estimate — no restart required', async () => {
      const c = makeClient({ estimateShipping: jest.fn(async () => ({ cost: 75, etaDays: 1 })) });
      const cache = makeCache();
      let row: DeliverySetting | null = null;
      const repository = makeRepository({
        findSettings: jest.fn(async () => row),
        upsertSettings: jest.fn(async (data) => {
          row = settingRow(data as Partial<DeliverySetting>);
          return row;
        }),
      });
      const { service } = makeService({ client: c, repository, cache });

      await service.estimateShipping('city-ref-1');
      expect(c.estimateShipping).toHaveBeenLastCalledWith(
        expect.objectContaining({ senderCityRef: KYIV_CITY_REF }),
      );

      await service.updateSettings({ senderCityRef: 'odesa-ref' });
      await service.estimateShipping('city-ref-1');

      expect(c.estimateShipping).toHaveBeenLastCalledWith(
        expect.objectContaining({ senderCityRef: 'odesa-ref' }),
      );
    });
  });
});
