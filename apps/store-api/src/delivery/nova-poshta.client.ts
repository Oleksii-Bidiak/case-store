import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

/**
 * Nova Poshta API v2 endpoint. Every method is a `POST` of the JSON envelope
 * `{ apiKey, modelName, calledMethod, methodProperties }` to this single URL.
 */
export const NP_API_URL = 'https://api.novaposhta.ua/v2.0/json/';

/** Default parcel weight (kg) for the cost estimate when the real weight is unknown. */
const DEFAULT_WEIGHT_KG = 0.5;
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
 * NovaPoshtaClient — thin HTTP wrapper around the Nova Poshta API v2.
 *
 * Holds the API key server-side and speaks the NP JSON-RPC-ish envelope. It has
 * NO database or cache dependency (caching lives in {@link DeliveryService}). It
 * throws {@link ServiceUnavailableException} when the key is missing or the NP
 * API errors, so callers either surface a 503 (search endpoints) or fall back
 * to a zero estimate (order creation).
 *
 * The base URL is injectable (constructor-overridable) so tests can point it at
 * a mock server without hitting the real API.
 */
@Injectable()
export class NovaPoshtaClient {
  private readonly apiKey?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly baseUrl: string = NP_API_URL,
  ) {
    this.logger.setContext(NovaPoshtaClient.name);
    this.apiKey = this.config.get<string>('NP_API_KEY');
  }

  /** True when an API key is present — the storefront uses this to gate NP UI. */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
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

  /** POST the NP envelope and return its `data` array, or throw a 503 on any failure. */
  private async request<T>(
    modelName: string,
    calledMethod: string,
    methodProperties: Record<string, unknown>,
  ): Promise<T[]> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Nova Poshta API key is not configured');
    }

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: this.apiKey, modelName, calledMethod, methodProperties }),
      });
    } catch (err) {
      this.logger.error({ err, modelName, calledMethod }, 'Nova Poshta request failed');
      throw new ServiceUnavailableException('Nova Poshta API is unavailable');
    }

    if (!response.ok) {
      this.logger.error(
        { status: response.status, modelName, calledMethod },
        'Nova Poshta returned a non-OK status',
      );
      throw new ServiceUnavailableException('Nova Poshta API is unavailable');
    }

    const body = (await response.json()) as NpEnvelope<T>;
    if (!body.success) {
      this.logger.warn(
        { errors: body.errors, modelName, calledMethod },
        'Nova Poshta returned an error response',
      );
      throw new ServiceUnavailableException(body.errors?.join('; ') || 'Nova Poshta API error');
    }

    return body.data ?? [];
  }
}
