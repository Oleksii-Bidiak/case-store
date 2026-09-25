import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MeiliSearch } from 'meilisearch';

/** The Meilisearch index of active products. */
export const PRODUCTS_INDEX = 'products';

/**
 * The Meilisearch index of PUBLISHED blog posts (TASK-417). A second index
 * rather than a second document type in `products`: the two have different
 * searchable fields and different lifecycles, and Meilisearch ranks within one
 * index — mixing them would make an article compete with a product for the same
 * result slots.
 */
export const BLOG_POSTS_INDEX = 'blog_posts';

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
 * Per-request ceiling, in milliseconds.
 *
 * Without it the SDK skips its timeout race entirely, so the graceful
 * Postgres fallback covered a refused, erroring or 404-ing engine but NOT a
 * hung one: a wedged container that accepts the connection and never answers
 * parked every `/api/search`, every suggest keystroke, and — since TASK-417 —
 * the editor's Save, which waits on the blog index write.
 *
 * Five seconds is well past a healthy p99 (single-digit ms on this catalogue)
 * and well under any client-side patience.
 */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * `pagination.maxTotalHits` of every index this wrapper configures (TASK-537).
 *
 * Meilisearch never counts, nor serves, a hit past this bound: in
 * page/hitsPerPage mode `totalHits` stops at it, so the page list the storefront
 * draws from that total stops at the last page the engine can actually return.
 * Pinned here instead of inherited from the engine default (also 1000) so the
 * ceiling is visible in code and raising it is a deliberate settings change —
 * which, like any other, reaches a live index on the next boot or
 * `npm run search:reindex`. At 20 per page it is 50 pages of one query.
 */
export const SEARCH_MAX_TOTAL_HITS = 1000;

/** Anything this wrapper can store: a document keyed by its primary `id`. */
export interface IndexedDocument {
  id: string;
}

/**
 * A search document as stored in the `products` index. Holds enough to render a
 * result/suggestion card without a second DB hit (public fields only — no raw
 * stock). `price`/`createdAt` are numeric so Meili can sort on them.
 */
export interface ProductSearchDocument extends IndexedDocument {
  name: string;
  description: string | null;
  slug: string;
  /**
   * Article number (TASK-522). Searchable but exempt from typo tolerance — a
   * code one character off names a different product, not a misspelling.
   */
  sku: string | null;
  /**
   * Admin-curated tags (TASK-437/558) — words a shopper types that the name and
   * description do not contain. Searchable, ranked right after `sku`; never
   * displayed from the index.
   */
  keywords: string[];
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
 * A PUBLISHED blog post as stored in the `blog_posts` index (TASK-417). Only the
 * fields the header dropdown and the hub grid need are duplicated here; the hit
 * ids are re-hydrated from Postgres before anything is rendered, exactly as the
 * product path does, so a stale document can never put an unpublished article on
 * screen.
 */
export interface BlogPostSearchDocument extends IndexedDocument {
  title: string;
  /** Admin-curated tags (TASK-437/558), searchable right after the title. */
  keywords: string[];
  excerpt: string;
  slug: string;
  categorySlug: string;
  categoryName: string;
  /** Unix epoch ms of publication (0 when unknown) — sortable recency key. */
  publishedAt: number;
  /**
   * The listing gate (TASK-436), filterable so the engine drops unlisted posts
   * ITSELF (TASK-537): its exact total then counts only what the hub shows,
   * instead of counting posts the published re-read removes afterwards.
   */
  listed: boolean;
  /**
   * Cyrillic/Latin equivalents of the title + category tokens, injected at index
   * time so typo tolerance covers cross-script queries — the same trick the
   * product index uses (see `search-synonyms.ts`).
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
  /** Deepest hit the engine counts and serves — see {@link SEARCH_MAX_TOTAL_HITS}. */
  pagination?: { maxTotalHits: number };
}

/**
 * Options accepted by {@link MeiliClient.search}.
 *
 * Two modes, and which one a caller picks decides what total it gets back
 * (TASK-537):
 *  - `page` + `hitsPerPage` — for anything that shows NUMBERED pages. The engine
 *    counts exhaustively and answers an exact `totalHits`.
 *  - `limit` (+ `offset`) — for a top-N list that shows no total (autocomplete).
 *    The engine only estimates the total there, so {@link MeiliSearchResult}
 *    reports `totalHits: null` rather than pass the estimate off as a count.
 */
export interface MeiliSearchOptions {
  page?: number;
  hitsPerPage?: number;
  limit?: number;
  offset?: number;
  filter?: string | string[];
  sort?: string[];
}

/** Normalised search result surfaced to the service. */
export interface MeiliSearchResult<T> {
  hits: T[];
  /**
   * The EXACT number of matches (capped at `pagination.maxTotalHits`) when the
   * query was made with `page`/`hitsPerPage`; `null` for a `limit` query, whose
   * only total is Meilisearch's documented-as-inexact `estimatedTotalHits`. An
   * overshooting estimate used to draw clickable pages with no hits on them.
   */
  totalHits: number | null;
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
  addDocuments(docs: IndexedDocument[], options?: { primaryKey?: string }): Promise<EnqueuedWrite>;
  deleteDocument(id: string): Promise<unknown>;
  deleteDocuments(ids: string[]): Promise<EnqueuedWrite>;
  deleteAllDocuments(): Promise<unknown>;
  getDocuments(params: {
    fields: string[];
    limit: number;
    offset: number;
  }): Promise<{ results: Array<{ id: string }>; total?: number }>;
  waitForTask(taskUid: number, options?: { timeOutMs?: number }): Promise<TaskStatus>;
  search<T = IndexedDocument>(
    query: string,
    options?: MeiliSearchOptions,
  ): Promise<{ hits: T[]; totalHits?: number; totalPages?: number; estimatedTotalHits?: number }>;
  getSettings(): Promise<{ searchableAttributes?: string[] | null }>;
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

    this.client =
      host && apiKey
        ? (new MeiliSearch({ host, apiKey, timeout: REQUEST_TIMEOUT_MS }) as MeiliClientApi)
        : null;
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
  async ensureIndex(settings: IndexSettings, indexUid: string = PRODUCTS_INDEX): Promise<void> {
    if (!this.client) return;
    try {
      try {
        await this.client.getIndex(indexUid);
      } catch {
        // Index does not exist yet — create it with `id` as the primary key.
        await this.client.createIndex(indexUid, { primaryKey: 'id' });
      }
      await this.client.index(indexUid).updateSettings(settings);
    } catch (err) {
      this.logger.warn({ err, indexUid }, 'Meilisearch ensureIndex failed');
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
  async indexDocuments(
    docs: IndexedDocument[],
    indexUid: string = PRODUCTS_INDEX,
  ): Promise<number | null> {
    if (!this.client || docs.length === 0) return null;
    try {
      const task = await this.client.index(indexUid).addDocuments(docs, { primaryKey: 'id' });
      return task?.taskUid ?? null;
    } catch (err) {
      this.logger.warn({ err, indexUid, count: docs.length }, 'Meilisearch addDocuments failed');
      return null;
    }
  }

  /**
   * Wait for enqueued index writes to actually finish. Returns the uids that did
   * NOT reach `succeeded` — including ones we could not check, because an
   * unverified write is not a successful write.
   */
  async waitForTasks(
    taskUids: number[],
    indexUid: string = PRODUCTS_INDEX,
  ): Promise<{ failedUids: number[] }> {
    if (!this.client || taskUids.length === 0) return { failedUids: [] };
    const index = this.client.index(indexUid);
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
  async listDocumentIds(indexUid: string = PRODUCTS_INDEX): Promise<Set<string> | null> {
    if (!this.client) return null;
    const index = this.client.index(indexUid);
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

  /**
   * The searchable attributes the engine has actually APPLIED to an index, or
   * `null` when unconfigured or the read failed (TASK-522).
   *
   * {@link ensureIndex} is best-effort and does not wait for its settings task,
   * so a rejected update is invisible to it. Reading the settings back is how the
   * reindex script proves a settings change reached the engine instead of
   * assuming it did. `null` means "unknown", never "no attributes".
   */
  async getSearchableAttributes(indexUid: string = PRODUCTS_INDEX): Promise<string[] | null> {
    if (!this.client) return null;
    try {
      const settings = await this.client.index(indexUid).getSettings();
      return settings?.searchableAttributes ?? null;
    } catch (err) {
      this.logger.warn({ err, indexUid }, 'Meilisearch getSettings failed');
      return null;
    }
  }

  /** Remove a single document by id (best-effort). */
  async deleteDocument(id: string, indexUid: string = PRODUCTS_INDEX): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.index(indexUid).deleteDocument(id);
    } catch (err) {
      this.logger.warn({ err, indexUid, id }, 'Meilisearch deleteDocument failed');
    }
  }

  /** Remove several documents by id (best-effort). Returns the task uid. */
  async deleteDocuments(ids: string[], indexUid: string = PRODUCTS_INDEX): Promise<number | null> {
    if (!this.client || ids.length === 0) return null;
    try {
      const task = await this.client.index(indexUid).deleteDocuments(ids);
      return task?.taskUid ?? null;
    } catch (err) {
      this.logger.warn({ err, indexUid, count: ids.length }, 'Meilisearch deleteDocuments failed');
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
   * Query an index. Returns the hits + the exact total (page/hitsPerPage queries
   * only — see {@link MeiliSearchResult.totalHits}), or `null` when the engine is
   * unconfigured or the request fails — the caller treats `null` as "not
   * available" and falls back to Postgres.
   */
  async search<T extends IndexedDocument = ProductSearchDocument>(
    query: string,
    options?: MeiliSearchOptions,
    indexUid: string = PRODUCTS_INDEX,
  ): Promise<MeiliSearchResult<T> | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.index(indexUid).search<T>(query, options);
      const hits = res.hits ?? [];
      return { hits, totalHits: typeof res.totalHits === 'number' ? res.totalHits : null };
    } catch (err) {
      this.logger.warn(
        { err, indexUid, query },
        'Meilisearch search failed; caller will fall back',
      );
      return null;
    }
  }
}
