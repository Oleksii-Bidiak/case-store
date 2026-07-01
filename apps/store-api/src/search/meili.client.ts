import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MeiliSearch } from 'meilisearch';

/** The single Meilisearch index this app maintains — active products. */
export const PRODUCTS_INDEX = 'products';

/** Meili status string that means the engine is up and reachable. */
const HEALTH_AVAILABLE = 'available';

/**
 * A search document as stored in the `products` index. Holds enough to render a
 * result/suggestion card without a second DB hit (public fields only — no raw
 * stock). `price`/`createdAt` are numeric so Meili can sort on them.
 */
export interface ProductSearchDocument {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  categoryId: string;
  categoryName: string;
  primaryImageUrl: string | null;
  blurDataUrl: string | null;
  inStock: boolean;
  isActive: boolean;
  /** Unix epoch ms — sortable recency key. */
  createdAt: number;
}

/** Index settings applied by {@link MeiliClient.ensureIndex}. */
export interface IndexSettings {
  searchableAttributes: string[];
  filterableAttributes: string[];
  sortableAttributes: string[];
  rankingRules: string[];
  typoTolerance?: Record<string, unknown>;
}

/** Options accepted by {@link MeiliClient.search}. */
export interface MeiliSearchOptions {
  limit?: number;
  offset?: number;
  filter?: string | string[];
  sort?: string[];
}

/** Normalised search result surfaced to the service. */
export interface MeiliSearchResult<T> {
  hits: T[];
  estimatedTotalHits: number;
}

/**
 * Minimal surface of the `meilisearch` SDK index this wrapper depends on. Kept
 * narrow so unit specs can inject a mock without a running engine.
 */
export interface MeiliIndexApi {
  updateSettings(settings: IndexSettings): Promise<unknown>;
  addDocuments(docs: ProductSearchDocument[], options?: { primaryKey?: string }): Promise<unknown>;
  deleteDocument(id: string): Promise<unknown>;
  deleteAllDocuments(): Promise<unknown>;
  search<T = ProductSearchDocument>(
    query: string,
    options?: MeiliSearchOptions,
  ): Promise<{ hits: T[]; estimatedTotalHits?: number }>;
}

/** Minimal surface of the `meilisearch` SDK client this wrapper depends on. */
export interface MeiliClientApi {
  health(): Promise<{ status: string }>;
  index(uid: string): MeiliIndexApi;
  createIndex(uid: string, options?: { primaryKey?: string }): Promise<unknown>;
  getIndex(uid: string): Promise<unknown>;
}

/**
 * MeiliClient — thin, resilient wrapper around the official `meilisearch` SDK.
 *
 * Mirrors the Nova Poshta external-client pattern: it holds the engine
 * host/master-key server-side and exposes `isConfigured()` so callers can gate
 * on it. **Every network call is wrapped in try/catch** and surfaced as a benign
 * "not available" (search → `null`, mutations → no-op) so a down or unconfigured
 * engine NEVER 500s the storefront — the search endpoints fall back to Postgres
 * instead.
 *
 * The underlying SDK client is constructor-overridable (`@Optional()`) so specs
 * can inject a mock without hitting a real engine.
 */
@Injectable()
export class MeiliClient {
  private readonly client: MeiliClientApi | null;

  constructor(
    config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() injectedClient?: MeiliClientApi,
  ) {
    this.logger.setContext(MeiliClient.name);

    if (injectedClient) {
      // Test/override path — a pre-built (mock) client was supplied.
      this.client = injectedClient;
      return;
    }

    const host = config.get<string>('MEILI_HOST');
    // Server-side index writes require the admin/master key. A public
    // search-only key (MEILI_SEARCH_KEY) is reserved for future browser-side
    // use and is not needed here.
    const apiKey = config.get<string>('MEILI_MASTER_KEY');

    this.client = host && apiKey ? (new MeiliSearch({ host, apiKey }) as MeiliClientApi) : null;
  }

  /** True when the engine is configured (host + key present, or a client was injected). */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Ping the engine. Returns false when unconfigured or unreachable (never throws). */
  async health(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const res = await this.client.health();
      return res?.status === HEALTH_AVAILABLE;
    } catch (err) {
      this.logger.warn({ err }, 'Meilisearch health check failed');
      return false;
    }
  }

  /**
   * Ensure the products index exists and its settings are applied. Idempotent
   * and best-effort — a failure here is logged and swallowed so bootstrap never
   * crashes on a down engine.
   */
  async ensureIndex(settings: IndexSettings): Promise<void> {
    if (!this.client) return;
    try {
      try {
        await this.client.getIndex(PRODUCTS_INDEX);
      } catch {
        // Index does not exist yet — create it with `id` as the primary key.
        await this.client.createIndex(PRODUCTS_INDEX, { primaryKey: 'id' });
      }
      await this.client.index(PRODUCTS_INDEX).updateSettings(settings);
    } catch (err) {
      this.logger.warn({ err }, 'Meilisearch ensureIndex failed');
    }
  }

  /** Upsert documents into the products index (best-effort). */
  async indexDocuments(docs: ProductSearchDocument[]): Promise<void> {
    if (!this.client || docs.length === 0) return;
    try {
      await this.client.index(PRODUCTS_INDEX).addDocuments(docs, { primaryKey: 'id' });
    } catch (err) {
      this.logger.warn({ err, count: docs.length }, 'Meilisearch addDocuments failed');
    }
  }

  /** Remove a single document by id (best-effort). */
  async deleteDocument(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.index(PRODUCTS_INDEX).deleteDocument(id);
    } catch (err) {
      this.logger.warn({ err, id }, 'Meilisearch deleteDocument failed');
    }
  }

  /** Empty the index (used before a full reindex). Best-effort. */
  async clearDocuments(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.index(PRODUCTS_INDEX).deleteAllDocuments();
    } catch (err) {
      this.logger.warn({ err }, 'Meilisearch deleteAllDocuments failed');
    }
  }

  /**
   * Query the products index. Returns the hits + estimated total, or `null` when
   * the engine is unconfigured or the request fails — the caller treats `null`
   * as "not available" and falls back to Postgres.
   */
  async search(
    query: string,
    options?: MeiliSearchOptions,
  ): Promise<MeiliSearchResult<ProductSearchDocument> | null> {
    if (!this.client) return null;
    try {
      const res = await this.client
        .index(PRODUCTS_INDEX)
        .search<ProductSearchDocument>(query, options);
      const hits = res.hits ?? [];
      return { hits, estimatedTotalHits: res.estimatedTotalHits ?? hits.length };
    } catch (err) {
      this.logger.warn({ err, query }, 'Meilisearch search failed; caller will fall back');
      return null;
    }
  }
}
