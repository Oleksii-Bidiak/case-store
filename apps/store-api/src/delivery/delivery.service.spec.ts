import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { CacheService } from '../cache';
import { DeliveryService, KYIV_CITY_REF } from './delivery.service';
import type { NovaPoshtaClient, NpSettlementRaw, NpWarehouseRaw } from './nova-poshta.client';

// ─── Stubs ─────────────────────────────────────────────────────────────────

/** ConfigService stub backed by a plain key→value map. */
function makeConfig(values: Record<string, unknown> = {}): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

/** No-op PinoLogger stub. */
function makeLogger(): PinoLogger {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as unknown as PinoLogger;
}

/** In-memory CacheService stub: get returns null unless primed via set. */
function makeCache(): jest.Mocked<Pick<CacheService, 'get' | 'set'>> {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  } as unknown as jest.Mocked<Pick<CacheService, 'get' | 'set'>>;
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
  cache?: ReturnType<typeof makeCache>;
  config?: ConfigService;
}) {
  const client = opts.client ?? makeClient();
  const cache = opts.cache ?? makeCache();
  const config = opts.config ?? makeConfig();
  const service = new DeliveryService(
    client,
    cache as unknown as CacheService,
    config,
    makeLogger(),
  );
  return { service, client, cache, config };
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
        `np:estimate:${KYIV_CITY_REF}:city-ref-1`,
        { cost: '60.00', etaDays: 2 },
        1800,
      );
    });

    it('uses NP_SENDER_CITY_REF as the dispatch origin when set', async () => {
      const client = makeClient({
        estimateShipping: jest.fn(async () => ({ cost: 75, etaDays: 1 })),
      });
      const config = makeConfig({ NP_SENDER_CITY_REF: 'lviv-ref' });
      const { service } = makeService({ client, config });

      await service.estimateShipping('city-ref-1');

      expect(client.estimateShipping).toHaveBeenCalledWith({
        recipientCityRef: 'city-ref-1',
        senderCityRef: 'lviv-ref',
      });
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
});
