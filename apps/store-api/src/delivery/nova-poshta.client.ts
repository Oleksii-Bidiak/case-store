import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { DeliveryNotConfiguredException, DeliveryUnavailableException } from './delivery.errors';

/**
 * Nova Poshta API v2 endpoint. Every method is a `POST` of the JSON envelope
 * `{ apiKey, modelName, calledMethod, methodProperties }` to this single URL.
 */
export const NP_API_URL = 'https://api.novaposhta.ua/v2.0/json/';

/** Default parcel weight (kg) for the cost estimate when the real weight is unknown. */
export const DEFAULT_WEIGHT_KG = 0.5;
/** Declared/assessed cargo value (UAH) — required by getDocumentPrice. */
const DEFAULT_ASSESSED_COST = '300';
/** Branch-to-branch is the typical small-parcel mode in Ukraine. */
const SERVICE_TYPE = 'WarehouseWarehouse';

/** Standard NP response envelope. */
interface NpEnvelope<T> {
  success: boolean;
  data: T[];
  errors: string[];
  warnings: string[];
  info: string[];
}

/** A single settlement returned inside `searchSettlements` → `data[0].Addresses[]`. */
export interface NpSettlementRaw {
  Present: string;
  MainDescription: string;
  Area: string;
  Ref: string;
  /** The NP **city** ref to feed getWarehouses / the estimate (NOT `Ref`). */
  DeliveryCity: string;
  Warehouses: number | string;
}

/** A single warehouse returned by `getWarehouses`. */
export interface NpWarehouseRaw {
  Ref: string;
  Description: string;
  Number: string;
  TypeOfWarehouse: string;
  CityRef: string;
}

/** Normalised estimate the client returns to the service. */
export interface NpEstimateRaw {
  cost: number;
  etaDays: number | null;
}

/**
 * How this client is allowed to talk to Nova Poshta.
 *
 * - `key`          — `NP_API_KEY` is set; calls are authenticated. The only mode fit for production.
 * - `keyless`      — no key, but `NP_ALLOW_KEYLESS=true` outside production; calls go out with an
 *                    empty `apiKey`. See {@link NovaPoshtaClient} for why this works and why it is
 *                    barred from production.
 * - `unconfigured` — no key and no permission to go keyless; every request throws
 *                    {@link DeliveryNotConfiguredException} before any I/O.
 */
export type NpClientMode = 'key' | 'keyless' | 'unconfigured';

/**
 * NovaPoshtaClient — thin HTTP wrapper around the Nova Poshta API v2.
 *
 * Holds the API key server-side and speaks the NP JSON-RPC-ish envelope. It has
 * NO database or cache dependency (caching lives in `DeliveryService`).
 *
 * ## Two distinct failures, never conflated
 *
 * - No usable credentials → {@link DeliveryNotConfiguredException} (a deployment
 *   defect; does not heal on retry, must not be swallowed).
 * - NP unreachable / non-OK / `success: false` → {@link DeliveryUnavailableException}
 *   (transient; safe to degrade around).
 *
 * Both are 503s, so the storefront's existing behaviour is unchanged; callers
 * that need to react differently discriminate on the exception type or its
 * `code` (see `delivery.errors.ts`).
 *
 * ## Keyless mode (`NP_ALLOW_KEYLESS`, TASK-337)
 *
 * Verified against the live API on 2026-07-28: every method this project calls
 * answers with an EMPTY `apiKey` — `Address/searchSettlements`,
 * `Address/getWarehouses`, `InternetDocument/getDocumentPrice` (Kyiv→Lviv at
 * 0.5 kg returned `Cost: 90`), `InternetDocument/getDocumentDeliveryDate` and
 * `TrackingDocument/getStatusDocuments`. Only account-scoped methods demand a
 * key (`Counterparty/getCounterparties` answers "User is undefined", and by
 * extension `InternetDocument/save` waybill creation — neither of which this
 * project calls).
 *
 * That lets a staging stand exercise the REAL API — and pass the live
 * "shipping cost ≠ 0.00" check — before the shop owner has issued a key. It is
 * emphatically **not** for production: the behaviour is undocumented, NP can
 * withdraw it without notice, and anonymous calls are certainly rate limited.
 * The constructor therefore refuses to honour the flag when
 * `NODE_ENV === 'production'` and logs that refusal at error level.
 *
 * The base URL is injectable (constructor-overridable) so tests can point it at
 * a mock server without hitting the real API.
 */
@Injectable()
export class NovaPoshtaClient {
  private readonly apiKey?: string;
  private readonly mode: NpClientMode;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly baseUrl: string = NP_API_URL,
  ) {
    this.logger.setContext(NovaPoshtaClient.name);
    this.apiKey = this.config.get<string>('NP_API_KEY') || undefined;

    const keylessRequested = this.config.get<string>('NP_ALLOW_KEYLESS') === 'true';
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    if (this.apiKey) {
      this.mode = 'key';
    } else if (keylessRequested && !isProduction) {
      this.mode = 'keyless';
      this.logger.warn(
        { event: 'delivery.keyless' },
        'NP_ALLOW_KEYLESS=true and no NP_API_KEY — calling Nova Poshta anonymously. Undocumented and rate-limited; acceptable for dev/staging only.',
      );
    } else {
      this.mode = 'unconfigured';
      if (keylessRequested && isProduction) {
        // Loud on purpose: someone copied a staging env file into production and
        // believes delivery works. It does not — every request will now throw.
        this.logger.error(
          { event: 'delivery.keylessRefused' },
          'NP_ALLOW_KEYLESS=true is IGNORED in production — anonymous Nova Poshta access is not a supported production configuration. Set NP_API_KEY.',
        );
      }
    }
  }

  /**
   * True when this client can reach NP at all — an API key OR permitted keyless
   * mode. The storefront gates its NP delivery UI on this, and staging must get
   * that UI, so keyless counts as configured.
   */
  isConfigured(): boolean {
    return this.mode !== 'unconfigured';
  }

  /** Which credential mode is in force — surfaced for logging and tests. */
  getMode(): NpClientMode {
    return this.mode;
  }

  /** Online settlement search. Returns only settlements that support NP delivery. */
  async searchCities(query: string): Promise<NpSettlementRaw[]> {
    const data = await this.request<{ Addresses?: NpSettlementRaw[] }>(
      'Address',
      'searchSettlements',
      { CityName: query, Limit: '20' },
    );
    const addresses = data[0]?.Addresses ?? [];
    return addresses.filter((a) => Boolean(a.DeliveryCity));
  }

  /** Warehouses (branches) within a city, optionally filtered by name/number. */
  async searchWarehouses(cityRef: string, query?: string): Promise<NpWarehouseRaw[]> {
    return this.request<NpWarehouseRaw>('Address', 'getWarehouses', {
      CityRef: cityRef,
      ...(query ? { FindByString: query } : {}),
      Limit: '50',
    });
  }

  /**
   * Cost + ETA estimate for a warehouse-to-warehouse parcel. The ETA lookup is
   * best-effort: if it fails the cost is still returned (`etaDays: null`).
   */
  async estimateShipping(params: {
    recipientCityRef: string;
    senderCityRef: string;
    weight?: number;
  }): Promise<NpEstimateRaw> {
    const weight = params.weight ?? DEFAULT_WEIGHT_KG;
    const priceData = await this.request<{ Cost: number }>('InternetDocument', 'getDocumentPrice', {
      CitySender: params.senderCityRef,
      CityRecipient: params.recipientCityRef,
      Weight: String(weight),
      ServiceType: SERVICE_TYPE,
      Cost: DEFAULT_ASSESSED_COST,
      CargoType: 'Parcel',
      SeatsAmount: '1',
    });
    const cost = Number(priceData[0]?.Cost ?? 0);

    let etaDays: number | null = null;
    try {
      etaDays = await this.estimateEta(params.senderCityRef, params.recipientCityRef);
    } catch (err) {
      this.logger.warn({ err }, 'Nova Poshta ETA lookup failed; returning cost without ETA');
    }

    return { cost, etaDays };
  }

  /** Resolve estimated delivery days from `getDocumentDeliveryDate`. */
  private async estimateEta(
    senderCityRef: string,
    recipientCityRef: string,
  ): Promise<number | null> {
    const data = await this.request<{ DeliveryDate?: { date?: string } }>(
      'InternetDocument',
      'getDocumentDeliveryDate',
      {
        DateTime: this.formatDate(new Date()),
        ServiceType: SERVICE_TYPE,
        CitySender: senderCityRef,
        CityRecipient: recipientCityRef,
      },
    );
    const raw = data[0]?.DeliveryDate?.date;
    if (!raw) return null;
    const delivery = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(delivery.getTime())) return null;
    const days = Math.ceil((delivery.getTime() - Date.now()) / 86_400_000);
    return days >= 0 ? days : null;
  }

  /** NP expects dates as `dd.mm.yyyy`. */
  private formatDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${date.getFullYear()}`;
  }

  /**
   * POST the NP envelope and return its `data` array.
   *
   * Throws {@link DeliveryNotConfiguredException} when there are no usable
   * credentials (before any I/O) and {@link DeliveryUnavailableException} for
   * every transient failure. In keyless mode the envelope carries `apiKey: ''`
   * — NP accepts that for all the read methods used here.
   */
  private async request<T>(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, unknown>,
  ): Promise<T[]> {
    if (this.mode === 'unconfigured') {
      throw new DeliveryNotConfiguredException('Nova Poshta API key is not configured');
    }

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey ?? '',
          modelName,
          calledMethod,
          methodProperties,
        }),
      });
    } catch (err) {
      this.logger.error({ err, modelName, calledMethod }, 'Nova Poshta request failed');
      throw new DeliveryUnavailableException();
    }

    if (!response.ok) {
      this.logger.error(
        { status: response.status, modelName, calledMethod },
        'Nova Poshta returned a non-OK status',
      );
      throw new DeliveryUnavailableException();
    }

    const body = (await response.json()) as NpEnvelope<T>;
    if (!body.success) {
      this.logger.warn(
        { errors: body.errors, modelName, calledMethod, mode: this.mode },
        'Nova Poshta returned an error response',
      );
      throw new DeliveryUnavailableException(body.errors?.join('; ') || 'Nova Poshta API error');
    }

    return body.data ?? [];
  }
}
