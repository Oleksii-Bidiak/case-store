import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { CacheService } from '../cache';
import { NovaPoshtaClient } from './nova-poshta.client';
import type { NpCityDto, NpWarehouseDto, NpEstimateDto } from './dto';

/** Kyiv NP city ref — the bootstrap dispatch origin when nothing else is set. */
export const KYIV_CITY_REF = 'db5c88e0-391c-11dd-90d9-001a92567626';

/** Cache TTLs (seconds). NP reference data changes rarely; estimates less so. */
const CITIES_TTL = 3600; // 1 hour
const WAREHOUSES_TTL = 1800; // 30 minutes
const ESTIMATE_TTL = 1800; // 30 minutes

/** Minimum query length before we hit the NP API for a city search. */
const MIN_QUERY_LENGTH = 2;

/**
 * DeliveryService — business logic for Nova Poshta delivery.
 *
 * Wraps {@link NovaPoshtaClient} with caching (via the global {@link CacheService})
 * and maps the raw NP shapes onto the public DTOs. The dispatch-origin city is
 * resolved from `NP_SENDER_CITY_REF`, falling back to Kyiv (TASK-080-E moves the
 * source of truth to an admin-editable `DeliverySetting`).
 *
 * `estimateShipping` never throws — order creation must not fail because a cost
 * lookup did; it falls back to a zero estimate. The search methods DO propagate
 * the client's {@link ServiceUnavailableException} so unconfigured/NP-down
 * states surface as 503 to the storefront.
 */
@Injectable()
export class DeliveryService {
  private readonly senderCityRef: string;

  constructor(
    private readonly client: NovaPoshtaClient,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeliveryService.name);
    this.senderCityRef = this.config.get<string>('NP_SENDER_CITY_REF') || KYIV_CITY_REF;
  }

  /** True when NP is configured (the storefront gates its delivery UI on this). */
  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  /** Search settlements by name. Throws 400 for queries shorter than 2 chars. */
  async searchCities(q: string): Promise<NpCityDto[]> {
    const query = q?.trim() ?? '';
    if (query.length < MIN_QUERY_LENGTH) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }

    const key = `np:cities:${query.toLowerCase()}`;
    const cached = await this.cache.get<NpCityDto[]>(key);
    if (cached) return cached;

    const raw = await this.client.searchCities(query);
    const cities: NpCityDto[] = raw.map((c) => ({
      ref: c.DeliveryCity,
      name: c.Present,
      area: c.Area,
      warehouses: Number(c.Warehouses) || 0,
    }));

    await this.cache.set(key, cities, CITIES_TTL);
    return cities;
  }

  /** List warehouses in a city, optionally filtered by name/number. */
  async searchWarehouses(cityRef: string, q?: string): Promise<NpWarehouseDto[]> {
    const filter = q?.trim() ?? '';
    const key = `np:warehouses:${cityRef}:${filter.toLowerCase()}`;
    const cached = await this.cache.get<NpWarehouseDto[]>(key);
    if (cached) return cached;

    const raw = await this.client.searchWarehouses(cityRef, filter || undefined);
    const warehouses: NpWarehouseDto[] = raw.map((w) => ({
      ref: w.Ref,
      description: w.Description,
      number: w.Number,
      typeOfWarehouse: w.TypeOfWarehouse,
    }));

    await this.cache.set(key, warehouses, WAREHOUSES_TTL);
    return warehouses;
  }

  /**
   * Estimate the shipping cost + ETA to a recipient city. Never throws: on any
   * NP failure it returns a zero-cost, no-ETA estimate so callers (including
   * order creation) degrade gracefully.
   */
  async estimateShipping(recipientCityRef: string): Promise<NpEstimateDto> {
    const key = `np:estimate:${this.senderCityRef}:${recipientCityRef}`;
    const cached = await this.cache.get<NpEstimateDto>(key);
    if (cached) return cached;

    try {
      const { cost, etaDays } = await this.client.estimateShipping({
        recipientCityRef,
        senderCityRef: this.senderCityRef,
      });
      const dto: NpEstimateDto = { cost: cost.toFixed(2), etaDays };
      await this.cache.set(key, dto, ESTIMATE_TTL);
      return dto;
    } catch (err) {
      this.logger.warn({ err, recipientCityRef }, 'Shipping estimate failed; falling back to 0');
      return { cost: '0.00', etaDays: null };
    }
  }
}
