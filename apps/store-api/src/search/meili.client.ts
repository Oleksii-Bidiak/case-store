import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MeiliSearch } from 'meilisearch';

/** The single Meilisearch index this app maintains — active products. */
export const PRODUCTS_INDEX = 'products';

/** Meili status string that means the engine is up and reachable. */
const HEALTH_AVAILABLE = 'available';

/** Meili task status that means the write was actually applied. */
const TASK_SUCCEEDED = 'succeeded';

/**
 * How long to wait for a single index write to leave the queue. Generous — a
 * reindex batch on a small VPS is slow — but bounded, so a stuck engine cannot
 * hang the admin's reindex request forever.
 */
const TASK_WAIT_TIMEOUT_MS = 30_000;

/** Page size for reading document ids back out of the index. */
const DOCUMENT_ID_PAGE = 1000;

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
  /**
   * The product's own category plus every ancestor id (TASK-236 rollup), so a
   * future category-scoped filter (`categoryIds = <parent>`) matches products
   * filed in subcategories too — mirroring the Postgres subtree rollup.
   */
  categoryIds: string[];
  /**
   * Compatible device-model ids (TASK-190) — a flat list so a
   * `deviceModelIds = <id>` filter matches products that fit that device. No
   * ancestor expansion (device models have no hierarchy beyond their brand).
   */
  deviceModelIds: string[];
  categoryName: string;
  /** Manufacturer id — filterable facet for the brand catalog filter (TASK-189). */
  brandId: string | null;
  /** Manufacturer name — searchable so "spigen чохол" matches (TASK-189). */
  brandName: string | null;
  primaryImageUrl: string | null;
  blurDataUrl: string | null;
  inStock: boolean;
  isActive: boolean;
  /** Unix epoch ms — sortable recency key. */
  createdAt: number;
  /**
   * Cyrillic UA equivalents of the (EN) name/category tokens, injected at
   * indexing time so typo-tolerant matching works for Ukrainian queries
   * (TASK-200). Searchable, never displayed.
   */
  searchTerms: string[];
}

/**
 * Index settings applied by {@link MeiliClient.ensureIndex}. Note that
 * `ensureIndex` pushes these via `updateSettings` on EVERY call — not only on
 * index creation — so changes (e.g. new synonyms) reach existing indexes on
 * the next bootstrap/reindex.
 */
export interface IndexSettings {
  searchableAttributes: string[];
  filterableAttributes: string[];
  sortableAttributes: string[];
  rankingRules: string[];
  typoTolerance?: Record<string, unknown>;
  /** Query-side synonym map: `{ term: [equivalent, ...] }`. */
  synonyms?: Record<string, string[]>;
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

/** An index write accepted for processing — Meilisearch applies it asynchronously. */
export interface EnqueuedWrite {
  taskUid: number;
}

/** A task as reported by Meilisearch once it has left the queue. */
export interface TaskStatus {
  status: string;
  error?: unknown;
}

/**
 * Minimal surface of the `meilisearch` SDK index this wrapper depends on. Kept
 * narrow so unit specs can inject a mock without a running engine.
 */
export interface MeiliIndexApi {
  updateSettings(settings: IndexSettings): Promise<unknown>;
  addDocuments(
    docs: ProductSearchDocument[],
    options?: { primaryKey?: string },
  ): Promise<EnqueuedWrite>;
  deleteDocument(id: string): Promise<unknown>;
  deleteDocuments(ids: string[]): Promise<EnqueuedWrite>;
  deleteAllDocuments(): Promise<unknown>;
  getDocuments(params: {
    fields: string[];
    limit: number;
    offset: number;
  }): Promise<{ results: Array<{ id: string }>; total?: number }>;
  waitForTask(taskUid: number, options?: { timeOutMs?: number }): Promise<TaskStatus>;
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

  /**
   * Upsert documents into the products index (best-effort).
   *
   * Returns the id of the ENQUEUED task, or `null` when nothing was sent or the
   * call failed. Meilisearch applies writes asynchronously, so a resolved
   * promise only means "accepted into the queue" — pass the uid to
   * {@link waitForTasks} before reporting the write as done. Without that, a
   * reindex can log a healthy document count while the engine rejects every
   * batch.
   */
  async indexDocuments(docs: ProductSearchDocument[]): Promise<number | null> {
    if (!this.client || docs.length === 0) return null;
    try {
      const task = await this.client.index(PRODUCTS_INDEX).addDocuments(docs, { primaryKey: 'id' });
      return task?.taskUid ?? null;
    } catch (err) {
      this.logger.warn({ err, count: docs.length }, 'Meilisearch addDocuments failed');
      return null;
    }
  }

  /**
   * Wait for enqueued index writes to actually finish. Returns the uids that did
   * NOT reach `succeeded` — including ones we could not check, because an
   * unverified write is not a successful write.
   */
  async waitForTasks(taskUids: number[]): Promise<{ failedUids: number[] }> {
    if (!this.client || taskUids.length === 0) return { failedUids: [] };
    const index = this.client.index(PRODUCTS_INDEX);
    const failedUids: number[] = [];
    for (const taskUid of taskUids) {
      try {
        const task = await index.waitForTask(taskUid, { timeOutMs: TASK_WAIT_TIMEOUT_MS });
        if (task?.status !== TASK_SUCCEEDED) {
          failedUids.push(taskUid);
          this.logger.warn(
            { taskUid, status: task?.status, err: task?.error },
            'Meili task failed',
          );
        }
      } catch (err) {
        failedUids.push(taskUid);
        this.logger.warn({ err, taskUid }, 'Meilisearch waitForTask failed');
      }
    }
    return { failedUids };
  }

  /**
   * Every document id currently in the index, or `null` when unconfigured or the
   * read failed. `null` means "unknown" and callers must treat it as such — a
   * failed listing that looked like an empty one would make the reindex prune
   * delete the whole index.
   */
  async listDocumentIds(): Promise<Set<string> | null> {
    if (!this.client) return null;
    const index = this.client.index(PRODUCTS_INDEX);
    const ids = new Set<string>();
    let offset = 0;
    try {
      for (;;) {
        const page = await index.getDocuments({
          fields: ['id'],
          limit: DOCUMENT_ID_PAGE,
          offset,
        });
        const results = page?.results ?? [];
        for (const doc of results) ids.add(doc.id);
        if (results.length < DOCUMENT_ID_PAGE) break;
        offset += DOCUMENT_ID_PAGE;
      }
      return ids;
    } catch (err) {
      this.logger.warn({ err }, 'Meilisearch getDocuments failed; skipping stale-document prune');
      return null;
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

  /** Remove several documents by id (best-effort). Returns the task uid. */
  async deleteDocuments(ids: string[]): Promise<number | null> {
    if (!this.client || ids.length === 0) return null;
    try {
      const task = await this.client.index(PRODUCTS_INDEX).deleteDocuments(ids);
      return task?.taskUid ?? null;
    } catch (err) {
      this.logger.warn({ err, count: ids.length }, 'Meilisearch deleteDocuments failed');
      return null;
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
