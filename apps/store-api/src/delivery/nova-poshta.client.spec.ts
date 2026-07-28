import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { NovaPoshtaClient } from './nova-poshta.client';
import { DeliveryNotConfiguredException, DeliveryUnavailableException } from './delivery.errors';

/**
 * These tests drive the client through a REAL local HTTP server rather than a
 * stubbed `fetch`. The constructor already took an `@Optional()` base URL for
 * exactly this purpose and nothing had ever used it — so the envelope the client
 * actually puts on the wire (including the keyless `apiKey: ''`) was untested.
 * A stubbed global `fetch` would have asserted our own mock's shape; a socket
 * asserts the client's.
 */

// ─── Mock NP server ──────────────────────────────────────────────────────────

interface CapturedRequest {
  apiKey: string;
  modelName: string;
  calledMethod: string;
  methodProperties: Record<string, unknown>;
}

/** A canned reply, or a function of the request for per-method responses. */
type Responder = (req: CapturedRequest) => { status?: number; body: unknown };

class MockNpServer {
  private server!: Server;
  readonly requests: CapturedRequest[] = [];
  respond: Responder = () => ({ body: { success: true, data: [] } });

  async start(): Promise<string> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as CapturedRequest;
        this.requests.push(parsed);
        const { status = 200, body } = this.respond(parsed);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      });
    });

    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve())),
    );
  }

  /** The single request captured — fails loudly if there was not exactly one. */
  get only(): CapturedRequest {
    expect(this.requests).toHaveLength(1);
    return this.requests[0];
  }

  find(calledMethod: string): CapturedRequest | undefined {
    return this.requests.find((r) => r.calledMethod === calledMethod);
  }
}

// ─── Stubs ───────────────────────────────────────────────────────────────────

function makeConfig(values: Record<string, unknown> = {}): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function makeLogger(): jest.Mocked<PinoLogger> {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as unknown as jest.Mocked<PinoLogger>;
}

const ok = (data: unknown[]) => ({ body: { success: true, data, errors: [], warnings: [] } });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NovaPoshtaClient', () => {
  let np: MockNpServer;
  let baseUrl: string;
  let logger: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    np = new MockNpServer();
    baseUrl = await np.start();
    logger = makeLogger();
  });

  afterEach(async () => {
    await np.stop();
  });

  /** Build a client against the mock server with the given env. */
  function makeClient(env: Record<string, unknown> = { NP_API_KEY: 'test-key' }): NovaPoshtaClient {
    return new NovaPoshtaClient(makeConfig(env), logger, baseUrl);
  }

  // ─── Credential modes ──────────────────────────────────────────────────────

  describe('credential mode', () => {
    it('is "key" when NP_API_KEY is set', () => {
      const client = makeClient({ NP_API_KEY: 'test-key' });
      expect(client.getMode()).toBe('key');
      expect(client.isConfigured()).toBe(true);
    });

    it('is "unconfigured" with no key and no keyless permission', () => {
      const client = makeClient({});
      expect(client.getMode()).toBe('unconfigured');
      expect(client.isConfigured()).toBe(false);
    });

    it('treats an empty-string NP_API_KEY as absent, not as a usable key', () => {
      const client = makeClient({ NP_API_KEY: '' });
      expect(client.getMode()).toBe('unconfigured');
    });

    it('is "keyless" with no key when NP_ALLOW_KEYLESS=true outside production', () => {
      const client = makeClient({ NP_ALLOW_KEYLESS: 'true', NODE_ENV: 'development' });
      expect(client.getMode()).toBe('keyless');
      // Keyless MUST count as configured: the storefront gates its NP delivery
      // UI on isConfigured(), and the whole point is that staging gets that UI.
      expect(client.isConfigured()).toBe(true);
    });

    it('only honours the literal string "true" for NP_ALLOW_KEYLESS', () => {
      expect(makeClient({ NP_ALLOW_KEYLESS: '1' }).getMode()).toBe('unconfigured');
      expect(makeClient({ NP_ALLOW_KEYLESS: 'yes' }).getMode()).toBe('unconfigured');
      expect(makeClient({ NP_ALLOW_KEYLESS: 'TRUE' }).getMode()).toBe('unconfigured');
    });

    it('REFUSES keyless mode in production and says so at error level', () => {
      const client = makeClient({ NP_ALLOW_KEYLESS: 'true', NODE_ENV: 'production' });

      expect(client.getMode()).toBe('unconfigured');
      expect(client.isConfigured()).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'delivery.keylessRefused' }),
        expect.stringContaining('IGNORED in production'),
      );
    });

    it('prefers a real key over keyless even when the flag is on', () => {
      const client = makeClient({ NP_API_KEY: 'real-key', NP_ALLOW_KEYLESS: 'true' });
      expect(client.getMode()).toBe('key');
    });
  });

  // ─── Request envelope ──────────────────────────────────────────────────────

  describe('request envelope', () => {
    it('POSTs { apiKey, modelName, calledMethod, methodProperties }', async () => {
      np.respond = () => ok([{ Addresses: [] }]);
      await makeClient({ NP_API_KEY: 'test-key' }).searchCities('Київ');

      expect(np.only).toEqual({
        apiKey: 'test-key',
        modelName: 'Address',
        calledMethod: 'searchSettlements',
        methodProperties: { CityName: 'Київ', Limit: '20' },
      });
    });

    it('survives a Cyrillic round trip (UTF-8 body, not mangled bytes)', async () => {
      np.respond = () => ok([{ Addresses: [] }]);
      await makeClient().searchCities('Кам’янець-Подільський');

      expect(np.only.methodProperties.CityName).toBe('Кам’янець-Подільський');
    });

    it('sends an EMPTY apiKey in keyless mode and really calls NP', async () => {
      np.respond = () => ok([{ Addresses: [] }]);
      const client = makeClient({ NP_ALLOW_KEYLESS: 'true', NODE_ENV: 'staging' });

      await client.searchCities('Львів');

      expect(np.only.apiKey).toBe('');
      expect(np.requests).toHaveLength(1);
    });

    it('throws DeliveryNotConfiguredException BEFORE any I/O when unconfigured', async () => {
      const client = makeClient({});

      await expect(client.searchCities('Київ')).rejects.toBeInstanceOf(
        DeliveryNotConfiguredException,
      );
      // The distinction that matters: nothing was sent, so this is not a
      // transient failure that a retry could fix.
      expect(np.requests).toHaveLength(0);
    });
  });

  // ─── Failure mapping ───────────────────────────────────────────────────────

  describe('failure mapping', () => {
    it('maps a non-OK HTTP status to DeliveryUnavailableException', async () => {
      np.respond = () => ({ status: 500, body: { success: false } });

      await expect(makeClient().searchCities('Київ')).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
        expect.stringContaining('non-OK status'),
      );
    });

    it('maps success:false to DeliveryUnavailableException carrying NP’s errors', async () => {
      np.respond = () => ({
        body: { success: false, data: [], errors: ['API key expired', 'Data is invalid'] },
      });

      await expect(makeClient().searchCities('Київ')).rejects.toThrow(
        'API key expired; Data is invalid',
      );
    });

    it('falls back to a generic message when success:false carries no errors', async () => {
      np.respond = () => ({ body: { success: false, data: [], errors: [] } });

      await expect(makeClient().searchCities('Київ')).rejects.toThrow('Nova Poshta API error');
    });

    it('maps a network failure to DeliveryUnavailableException', async () => {
      // Point the client at a port nothing is listening on.
      const client = new NovaPoshtaClient(
        makeConfig({ NP_API_KEY: 'test-key' }),
        logger,
        'http://127.0.0.1:1/',
      );

      await expect(client.searchCities('Київ')).rejects.toBeInstanceOf(
        DeliveryUnavailableException,
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ calledMethod: 'searchSettlements' }),
        expect.stringContaining('request failed'),
      );
    });

    it('returns an empty array when NP answers success with no data key', async () => {
      np.respond = () => ({ body: { success: true } });
      await expect(makeClient().searchWarehouses('city-ref')).resolves.toEqual([]);
    });
  });

  // ─── searchCities ──────────────────────────────────────────────────────────

  describe('searchCities', () => {
    const settlement = (over: Record<string, unknown> = {}) => ({
      Present: 'м. Київ, Київська обл.',
      MainDescription: 'Київ',
      Area: 'Київська',
      Ref: 'settlement-ref',
      DeliveryCity: 'city-ref',
      Warehouses: 1234,
      ...over,
    });

    it('unwraps data[0].Addresses', async () => {
      np.respond = () => ok([{ Addresses: [settlement()] }]);

      const result = await makeClient().searchCities('Київ');

      expect(result).toHaveLength(1);
      expect(result[0].DeliveryCity).toBe('city-ref');
    });

    it('drops settlements with no DeliveryCity — they cannot receive a parcel', async () => {
      np.respond = () =>
        ok([
          {
            Addresses: [
              settlement({ DeliveryCity: 'city-ref' }),
              settlement({ DeliveryCity: '', Present: 'с. Глухомань' }),
            ],
          },
        ]);

      const result = await makeClient().searchCities('Київ');

      expect(result).toHaveLength(1);
      expect(result[0].DeliveryCity).toBe('city-ref');
    });

    it('returns an empty array when the envelope has no Addresses', async () => {
      np.respond = () => ok([]);
      await expect(makeClient().searchCities('Хтознащо')).resolves.toEqual([]);
    });
  });

  // ─── searchWarehouses ──────────────────────────────────────────────────────

  describe('searchWarehouses', () => {
    it('sends CityRef + Limit and omits FindByString when no query is given', async () => {
      np.respond = () => ok([]);
      await makeClient().searchWarehouses('city-ref');

      expect(np.only.methodProperties).toEqual({ CityRef: 'city-ref', Limit: '50' });
      expect(np.only.calledMethod).toBe('getWarehouses');
    });

    it('adds FindByString when a query is given', async () => {
      np.respond = () => ok([]);
      await makeClient().searchWarehouses('city-ref', '12');

      expect(np.only.methodProperties).toEqual({
        CityRef: 'city-ref',
        FindByString: '12',
        Limit: '50',
      });
    });
  });

  // ─── estimateShipping ──────────────────────────────────────────────────────

  describe('estimateShipping', () => {
    /** Reply to the price call and the ETA call independently. */
    function priceAndEta(cost: unknown, etaDate: string | null) {
      np.respond = (req) => {
        if (req.calledMethod === 'getDocumentPrice') return ok([{ Cost: cost }]);
        if (req.calledMethod === 'getDocumentDeliveryDate') {
          return etaDate ? ok([{ DeliveryDate: { date: etaDate } }]) : ok([{}]);
        }
        return ok([]);
      };
    }

    /** `days` whole days from now, formatted the way NP returns a delivery date. */
    function npDate(daysFromNow: number): string {
      const d = new Date(Date.now() + daysFromNow * 86_400_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    }

    it('sends the documented getDocumentPrice properties', async () => {
      priceAndEta(90, npDate(2));
      await makeClient().estimateShipping({
        senderCityRef: 'kyiv-ref',
        recipientCityRef: 'lviv-ref',
      });

      expect(np.find('getDocumentPrice')?.methodProperties).toEqual({
        CitySender: 'kyiv-ref',
        CityRecipient: 'lviv-ref',
        Weight: '0.5',
        ServiceType: 'WarehouseWarehouse',
        Cost: '300',
        CargoType: 'Parcel',
        SeatsAmount: '1',
      });
    });

    it('defaults the weight to 0.5 kg and forwards an explicit weight otherwise', async () => {
      priceAndEta(90, null);
      await makeClient().estimateShipping({
        senderCityRef: 'kyiv-ref',
        recipientCityRef: 'lviv-ref',
        weight: 2.5,
      });

      expect(np.find('getDocumentPrice')?.methodProperties.Weight).toBe('2.5');
    });

    it('returns the cost and a positive ETA in days', async () => {
      priceAndEta(90, npDate(2));

      const result = await makeClient().estimateShipping({
        senderCityRef: 'kyiv-ref',
        recipientCityRef: 'lviv-ref',
      });

      expect(result.cost).toBe(90);
      expect(result.etaDays).toBeGreaterThanOrEqual(1);
      expect(result.etaDays).toBeLessThanOrEqual(3);
    });

    it('coerces a string Cost to a number (NP is inconsistent about this)', async () => {
      priceAndEta('90', null);

      const result = await makeClient().estimateShipping({
        senderCityRef: 'a',
        recipientCityRef: 'b',
      });

      expect(result.cost).toBe(90);
    });

    it('yields cost 0 when NP returns no price row', async () => {
      np.respond = () => ok([]);

      const result = await makeClient().estimateShipping({
        senderCityRef: 'a',
        recipientCityRef: 'b',
      });

      expect(result.cost).toBe(0);
    });

    it('formats the ETA request date as dd.mm.yyyy', async () => {
      priceAndEta(90, npDate(1));
      await makeClient().estimateShipping({ senderCityRef: 'a', recipientCityRef: 'b' });

      const dateTime = np.find('getDocumentDeliveryDate')?.methodProperties.DateTime as string;
      expect(dateTime).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      expect(dateTime).toBe(
        `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
      );
    });

    it('still returns the cost when the ETA lookup fails (best-effort catch)', async () => {
      np.respond = (req) => {
        if (req.calledMethod === 'getDocumentPrice') return ok([{ Cost: 90 }]);
        return { body: { success: false, data: [], errors: ['ETA exploded'] } };
      };

      const result = await makeClient().estimateShipping({
        senderCityRef: 'a',
        recipientCityRef: 'b',
      });

      expect(result).toEqual({ cost: 90, etaDays: null });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.anything() }),
        expect.stringContaining('ETA lookup failed'),
      );
    });

    it('returns etaDays null when NP sends no delivery date', async () => {
      priceAndEta(90, null);

      const result = await makeClient().estimateShipping({
        senderCityRef: 'a',
        recipientCityRef: 'b',
      });

      expect(result).toEqual({ cost: 90, etaDays: null });
    });

    it('returns etaDays null for an unparseable delivery date', async () => {
      priceAndEta(90, 'not-a-date');

      const result = await makeClient().estimateShipping({
        senderCityRef: 'a',
        recipientCityRef: 'b',
      });

      expect(result.etaDays).toBeNull();
    });

    it('returns etaDays null for a delivery date in the past', async () => {
      priceAndEta(90, npDate(-5));

      const result = await makeClient().estimateShipping({
        senderCityRef: 'a',
        recipientCityRef: 'b',
      });

      expect(result.etaDays).toBeNull();
    });

    it('propagates a price-call failure (only the ETA is best-effort)', async () => {
      np.respond = (req) =>
        req.calledMethod === 'getDocumentPrice'
          ? { status: 503, body: {} }
          : ok([{ DeliveryDate: { date: npDate(1) } }]);

      await expect(
        makeClient().estimateShipping({ senderCityRef: 'a', recipientCityRef: 'b' }),
      ).rejects.toBeInstanceOf(DeliveryUnavailableException);
    });

    it('works end-to-end in keyless mode with an empty apiKey on both calls', async () => {
      priceAndEta(90, npDate(2));
      const client = makeClient({ NP_ALLOW_KEYLESS: 'true', NODE_ENV: 'staging' });

      const result = await client.estimateShipping({
        senderCityRef: 'kyiv-ref',
        recipientCityRef: 'lviv-ref',
      });

      expect(result.cost).toBe(90);
      expect(np.requests.map((r) => r.apiKey)).toEqual(['', '']);
    });
  });
});
