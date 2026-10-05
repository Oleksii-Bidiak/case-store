import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line local/no-deep-module-import -- cycle: search barrel > search.module > search-synonyms.module > this file
import { MeiliClient, PRODUCTS_INDEX, BLOG_POSTS_INDEX } from '../search/meili.client';
// eslint-disable-next-line local/no-deep-module-import -- cycle: search barrel > search.module > search-synonyms.module > this file
import {
  DEFAULT_SYNONYM_GROUPS,
  UA_EN_SYNONYMS,
  buildSynonymMap,
  type SynonymMap,
} from '../search/search-synonyms';
import { SearchSynonymsRepository } from './search-synonyms.repository';
import type { SearchSynonymsEntity, SearchSynonymsSaveResultEntity } from './entities';

/**
 * How long a read of the saved list is trusted before the next one goes back
 * to the database. Saves on THIS process refresh it immediately; the TTL only
 * bounds how stale another API process (or a restored database) can be.
 */
export const SYNONYMS_CACHE_TTL_MS = 60_000;

interface ResolvedSynonyms {
  groups: string[][];
  isDefault: boolean;
  map: SynonymMap;
}

/** The built-in dictionary, as a resolved list. */
function defaults(): ResolvedSynonyms {
  return {
    groups: DEFAULT_SYNONYM_GROUPS.map((group) => [...group]),
    isDefault: true,
    map: UA_EN_SYNONYMS,
  };
}

/**
 * Search synonyms the owner edits on /settings/search (TASK-559).
 *
 * THE RULE: an empty table means "never saved", and search then runs on the
 * built-in UA↔EN dictionary (`search/search-synonyms.ts`). So a fresh install
 * and every existing deployment keep working with no seed step, and saving an
 * empty list is how the admin restores the defaults.
 *
 * WHO READS IT. Both halves of the synonym mechanism (see `search-synonyms.ts`):
 *  - query side — the `synonyms` index setting of the products and blog indexes,
 *    pushed by {@link replace} right after a save and re-applied by every
 *    `ensureIndex` (boot, reindex) from {@link getSynonymMap};
 *  - document side — the `searchTerms` each product/post document carries, built
 *    from {@link getSynonymMap} at indexing time. Those only change when a
 *    document is re-indexed, so a new synonym is typo-tolerant after the next
 *    reindex (the admin screen says so and has the button right there).
 *
 * NEVER FAILS A SEARCH. {@link getSynonymMap} is on the indexing path of every
 * product save; a database hiccup there falls back to the last good list (or
 * the defaults) with a warning rather than throwing.
 */
@Injectable()
export class SearchSynonymsService {
  private cached: { value: ResolvedSynonyms; at: number } | null = null;
  private loading: Promise<ResolvedSynonyms> | null = null;
  /** Bumped by every save; a read that started under an older one is stale. */
  private generation = 0;

  constructor(
    private readonly repository: SearchSynonymsRepository,
    private readonly meili: MeiliClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SearchSynonymsService.name);
  }

  /** The synonym map search should use right now. Never throws. */
  async getSynonymMap(): Promise<SynonymMap> {
    return (await this.resolve()).map;
  }

  /** The list for the admin screen — always a fresh database read. */
  async getSettings(): Promise<SearchSynonymsEntity> {
    const resolved = await this.load();
    return toEntity(resolved);
  }

  /**
   * Save the WHOLE list (the DTO has already trimmed, lowercased, de-duplicated
   * and validated it), then push the new map to both indexes. An empty list
   * clears the table, i.e. restores the built-in dictionary.
   *
   * The engine push is best-effort by design: the save is the owner's intent and
   * must not be lost because Meilisearch is down. `appliedToSearch: false` tells
   * the screen to say so; the next boot or reindex applies the saved list.
   */
  async replace(groups: string[][]): Promise<SearchSynonymsSaveResultEntity> {
    await this.repository.replaceAllGroups(groups);
    // Every read already in flight may hold the PRE-save rows: bump the
    // generation so it cannot cache them over the list we just saved, and drop
    // it from single-flight so the next caller reads the committed table.
    // Bumped AFTER the commit on purpose — a read starting mid-write is
    // skipped too; one starting after this line sees the new rows.
    this.generation += 1;
    this.loading = null;
    const resolved = resolveGroups(groups);
    this.remember(resolved);

    const appliedToSearch = await this.pushToSearch(resolved.map);
    this.logger.info(
      { groups: groups.length, isDefault: resolved.isDefault, appliedToSearch },
      'Search synonyms saved',
    );
    return { ...toEntity(resolved), appliedToSearch };
  }

  private async pushToSearch(map: SynonymMap): Promise<boolean> {
    if (!this.meili.isConfigured()) return false;
    // Sequential: the second index gains nothing from racing the first on a
    // small engine, and both must succeed for the answer to be "applied".
    const products = await this.meili.updateSynonyms(map, PRODUCTS_INDEX);
    const blog = await this.meili.updateSynonyms(map, BLOG_POSTS_INDEX);
    return products && blog;
  }

  /** The cached list while fresh; otherwise one (shared) database read. */
  private async resolve(): Promise<ResolvedSynonyms> {
    if (this.cached && Date.now() - this.cached.at < SYNONYMS_CACHE_TTL_MS) {
      return this.cached.value;
    }
    try {
      return await this.load();
    } catch (err) {
      this.logger.warn(
        { err },
        'Could not read search synonyms; using the last known list or the built-in dictionary',
      );
      return this.cached?.value ?? defaults();
    }
  }

  /**
   * Read the table (single-flight) and cache the result. Throws on DB errors.
   *
   * A read overtaken by a save ({@link replace} bumped the generation while it
   * was in flight) still answers its own caller, but is NOT cached: otherwise it
   * would put the pre-save list back for a whole TTL, and a reindex in that
   * window would push the old map to Meilisearch over the one just saved.
   */
  private load(): Promise<ResolvedSynonyms> {
    if (!this.loading) {
      const generation = this.generation;
      const loading: Promise<ResolvedSynonyms> = this.repository
        .findAllGroups()
        .then((groups) => {
          const resolved = resolveGroups(groups);
          if (generation === this.generation) this.remember(resolved);
          return resolved;
        })
        .finally(() => {
          if (this.loading === loading) this.loading = null;
        });
      this.loading = loading;
    }
    return this.loading;
  }

  private remember(value: ResolvedSynonyms): void {
    this.cached = { value, at: Date.now() };
  }
}

/** Saved groups → what search uses; an empty list means the defaults. */
function resolveGroups(groups: string[][]): ResolvedSynonyms {
  if (groups.length === 0) return defaults();
  return { groups, isDefault: false, map: buildSynonymMap(groups) };
}

function toEntity(resolved: ResolvedSynonyms): SearchSynonymsEntity {
  return {
    groups: resolved.groups.map((terms) => ({ terms })),
    isDefault: resolved.isDefault,
  };
}
