import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryMethod } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { CacheService } from '../cache';
// One table, read by both the server check and the storefront (TASK-643); it is
// in the order barrel, but the order module already depends on this one.
// eslint-disable-next-line local/no-deep-module-import -- cycle: order barrel > order.module > delivery barrel > this file
import { allowedPaymentMethods } from '../order/delivery-payment-matrix';
import { DeliveryRepository, UpsertDeliverySettingInput } from './delivery.repository';
import { PickupPointRepository, type PickupPoint } from './pickup-point.repository';
import { DeliveryNotConfiguredException } from './delivery.errors';
import { DEFAULT_WEIGHT_KG, NovaPoshtaClient } from './nova-poshta.client';
import { DeliverySettingDto } from './dto';
import type {
  CourierTermsDto,
  DeliveryMethodsDto,
  NpCityDto,
  NpWarehouseDto,
  NpEstimateDto,
} from './dto';

/**
 * The delivery settings an order needs (TASK-643): which methods the shop offers
 * and what the courier costs. The single mapping from the settings row to
 * "enabled", shared by the checkout endpoint and the order-creation check, so
 * the two can never disagree about what is on offer.
 */
export interface DeliveryMethodSettings {
  /** Enabled methods, in the fixed order NOVA_POSHTA, PICKUP, COURIER, OTHER. */
  enabledMethods: DeliveryMethod[];
  courier: CourierTermsDto;
}

type MethodFlag = 'npEnabled' | 'pickupEnabled' | 'courierEnabled' | 'otherEnabled';

/**
 * The settings switch behind each method. A `Record`, so a fifth enum value
 * fails to compile here until someone decides where its switch lives.
 */
const METHOD_FLAG: Readonly<Record<DeliveryMethod, MethodFlag>> = {
  NOVA_POSHTA: 'npEnabled',
  PICKUP: 'pickupEnabled',
  COURIER: 'courierEnabled',
  OTHER: 'otherEnabled',
};

/** Fixed display order of the methods; also the order of `enabledMethods`. */
const METHOD_ORDER: readonly DeliveryMethod[] = [
  DeliveryMethod.NOVA_POSHTA,
  DeliveryMethod.PICKUP,
  DeliveryMethod.COURIER,
  DeliveryMethod.OTHER,
];

/** Kyiv NP city ref — the bootstrap dispatch origin when nothing else is set. */
export const KYIV_CITY_REF = 'db5c88e0-391c-11dd-90d9-001a92567626';

/** Cache TTLs (seconds). NP reference data changes rarely; estimates less so. */
const CITIES_TTL = 3600; // 1 hour
const WAREHOUSES_TTL = 1800; // 30 minutes
const ESTIMATE_TTL = 1800; // 30 minutes
/** The dispatch origin is one PK read; cache it briefly to keep estimates DB-free. */
const ORIGIN_TTL = 300; // 5 minutes

/** Cache key for the resolved dispatch origin, and the prefix every estimate shares. */
const ORIGIN_CACHE_KEY = 'np:origin';
const ESTIMATE_PREFIX = 'np:estimate:';

/** Minimum query length before we hit the NP API for a city search. */
const MIN_QUERY_LENGTH = 2;

/** The dispatch origin actually used for an estimate, after the fallback chain. */
interface DispatchOrigin {
  senderCityRef: string;
  weightKg: number;
}

/**
 * DeliveryService — business logic for Nova Poshta delivery.
 *
 * Wraps {@link NovaPoshtaClient} with caching (via the global {@link CacheService})
 * and maps the raw NP shapes onto the public DTOs.
 *
 * ## Dispatch origin (TASK-080-E)
 *
 * Resolved fresh per estimate (behind a 5-minute cache that
 * {@link updateSettings} invalidates), first non-empty wins:
 *
 *   1. `DeliverySetting.senderCityRef` — admin-set, the source of truth
 *   2. `NP_SENDER_CITY_REF` — bootstrap env fallback
 *   3. the built-in Kyiv ref
 *
 * and the same order for the parcel weight (`defaultWeightKg` → 0.5 kg). It is
 * deliberately NOT a constructor field any more: a value read once at boot means
 * an operator's edit in store-admin does nothing until the next restart, which
 * is exactly the kind of silent no-op this task exists to remove.
 */
@Injectable()
export class DeliveryService {
  private readonly isProduction: boolean;

  constructor(
    private readonly client: NovaPoshtaClient,
    private readonly repository: DeliveryRepository,
    // TASK-643: the checkout's pickup points.
    private readonly pickupPoints: PickupPointRepository,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeliveryService.name);
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';
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
   * Estimate the shipping cost + ETA to a recipient city.
   *
   * ## Where the "fail loudly" boundary sits (TASK-337)
   *
   * There are two ways this can fail and they are NOT the same failure, which is
   * why the pre-existing code already split the log levels:
   *
   * - **Not configured** — no `NP_API_KEY` and no permitted keyless mode. This is
   *   a deployment defect. It never heals on retry and it is not rare: it is
   *   EVERY order, silently, until someone fixes the env. And a zero is invisible
   *   downstream — the checkout summary reads `0` as "no cost yet" and falls back
   *   to a static "3–5 робочих днів" placeholder, while the order email and the
   *   confirmation breakdown omit zero rows entirely. So in **production** this
   *   now throws {@link DeliveryNotConfiguredException} instead of returning
   *   `0.00`. Better a visible 503 on one checkout than a shop that pays for
   *   every customer's delivery and never finds out.
   *
   * - **Transient NP failure** — configured, but NP was unreachable / errored.
   *   This DOES heal, and an order must never be blocked because a courier API
   *   had a bad minute. Still a `warn`, still a graceful zero, in every
   *   environment.
   *
   * Outside production the unconfigured case keeps degrading to `0.00` (at
   * `error` level, so it still reaches Sentry): a developer with no NP key must
   * be able to run a local checkout end to end, and staging that wants the real
   * thing sets `NP_ALLOW_KEYLESS=true` instead.
   */
  async estimateShipping(recipientCityRef: string): Promise<NpEstimateDto> {
    if (!this.client.isConfigured()) {
      this.logger.error(
        { event: 'delivery.notConfigured', recipientCityRef, isProduction: this.isProduction },
        'NP_API_KEY is not set — no shipping cost can be computed. In production this fails the request; elsewhere it degrades to 0.00.',
      );
      if (this.isProduction) {
        throw new DeliveryNotConfiguredException(
          'Shipping cost cannot be calculated: Nova Poshta is not configured',
        );
      }
      return { cost: '0.00', etaDays: null };
    }

    const { senderCityRef, weightKg } = await this.resolveOrigin();

    const key = `${ESTIMATE_PREFIX}${senderCityRef}:${recipientCityRef}:${weightKg}`;
    const cached = await this.cache.get<NpEstimateDto>(key);
    if (cached) return cached;

    try {
      const { cost, etaDays } = await this.client.estimateShipping({
        recipientCityRef,
        senderCityRef,
        weight: weightKg,
      });
      const dto: NpEstimateDto = { cost: cost.toFixed(2), etaDays };
      await this.cache.set(key, dto, ESTIMATE_TTL);
      return dto;
    } catch (err) {
      this.logger.warn({ err, recipientCityRef }, 'Shipping estimate failed; falling back to 0');
      return { cost: '0.00', etaDays: null };
    }
  }

  // ─── Admin: dispatch-origin settings (TASK-080-E) ──────────────────────────

  /**
   * Read the delivery settings for the admin form. Returns an all-null shape
   * (with the schema's default weight) when the singleton row is unwritten, so
   * the endpoint never 404s. Admin-only — guarded at the controller.
   */
  async getSettings(): Promise<DeliverySettingDto> {
    const row = await this.repository.findSettings();
    return row ? DeliverySettingDto.fromPrisma(row) : DeliverySettingDto.empty(DEFAULT_WEIGHT_KG);
  }

  /**
   * Upsert the delivery settings, then drop BOTH the cached origin and every
   * cached estimate. Without that second eviction an operator who corrects the
   * dispatch city would keep quoting the old city's prices for up to 30 minutes
   * — and the estimates keyed to the old origin would linger to be served again
   * if they ever switched back.
   */
  async updateSettings(input: UpsertDeliverySettingInput): Promise<DeliverySettingDto> {
    const row = await this.repository.upsertSettings(input);

    await this.cache.del(ORIGIN_CACHE_KEY);
    await this.cache.delByPrefix(ESTIMATE_PREFIX);

    this.logger.info(
      {
        event: 'delivery.settingsUpdated',
        senderCityRef: row.senderCityRef,
        defaultWeightKg: row.defaultWeightKg,
      },
      'Delivery dispatch origin updated',
    );

    return DeliverySettingDto.fromPrisma(row);
  }

  // ─── Delivery methods (TASK-643) ───────────────────────────────────────────
  //
  // Deliberately uncached: one PK read (plus one small indexed list for the
  // public endpoint), and a cache here would be one more thing `updateSettings`
  // and the pickup-point CRUD must remember to evict. An operator who switches a
  // method off expects the very next checkout to see it — the lesson of
  // TASK-080-E, where a value read once at boot made admin edits a no-op.

  /**
   * Which methods are on offer and what the courier costs. A never-written row
   * reads as the schema defaults (NP + OTHER on, courier 0.00, no threshold), via
   * {@link getSettings} — the same shape the admin form shows.
   */
  async getMethodSettings(): Promise<DeliveryMethodSettings> {
    const settings = await this.getSettings();
    return {
      enabledMethods: METHOD_ORDER.filter((method) => settings[METHOD_FLAG[method]]),
      courier: {
        price: settings.courierPrice,
        freeFrom: settings.courierFreeFrom,
        cityName: settings.courierCityName,
      },
    };
  }

  /**
   * Public `GET /api/delivery/methods`: what the checkout may offer right now.
   *
   * PICKUP is listed only while at least one active point exists — an enabled
   * method with nothing to pick would lead the shopper straight into a 400 at
   * submit. The order-side check agrees without special-casing it: with no
   * active point, no `pickupPointId` resolves.
   *
   * The payment matrix is served as a fresh copy per response, so nothing done
   * to a response object can reach back into the frozen table.
   */
  async getMethods(): Promise<DeliveryMethodsDto> {
    const { enabledMethods, courier } = await this.getMethodSettings();

    const pickupPoints = enabledMethods.includes(DeliveryMethod.PICKUP)
      ? await this.pickupPoints.findActive()
      : [];
    const methods =
      pickupPoints.length > 0
        ? enabledMethods
        : enabledMethods.filter((method) => method !== DeliveryMethod.PICKUP);

    return {
      methods,
      courier,
      pickupPoints,
      paymentMatrix: {
        NOVA_POSHTA: allowedPaymentMethods(DeliveryMethod.NOVA_POSHTA),
        PICKUP: allowedPaymentMethods(DeliveryMethod.PICKUP),
        COURIER: allowedPaymentMethods(DeliveryMethod.COURIER),
        OTHER: allowedPaymentMethods(DeliveryMethod.OTHER),
      },
    };
  }

  /**
   * The pickup point an order names, or null when it does not exist or has been
   * deactivated — the order service turns null into a 400.
   */
  resolveActivePickupPoint(id: string): Promise<PickupPoint | null> {
    return this.pickupPoints.findActiveById(id);
  }

  /**
   * Resolve the dispatch origin: DB row → `NP_SENDER_CITY_REF` → Kyiv, and
   * `defaultWeightKg` → 0.5 kg. Cached for 5 minutes and evicted on every write,
   * so an admin edit takes effect immediately without a DB read per estimate.
   */
  private async resolveOrigin(): Promise<DispatchOrigin> {
    const cached = await this.cache.get<DispatchOrigin>(ORIGIN_CACHE_KEY);
    if (cached) return cached;

    const row = await this.repository.findSettings();
    const origin: DispatchOrigin = {
      senderCityRef:
        row?.senderCityRef || this.config.get<string>('NP_SENDER_CITY_REF') || KYIV_CITY_REF,
      weightKg: row?.defaultWeightKg ?? DEFAULT_WEIGHT_KG,
    };

    await this.cache.set(ORIGIN_CACHE_KEY, origin, ORIGIN_TTL);
    return origin;
  }
}
