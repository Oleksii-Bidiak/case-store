import { PinoLogger } from 'nestjs-pino';
import { MeiliClient, PRODUCTS_INDEX, BLOG_POSTS_INDEX } from '../search/meili.client';
import { DEFAULT_SYNONYM_GROUPS, UA_EN_SYNONYMS } from '../search/search-synonyms';
import { SearchSynonymsRepository } from './search-synonyms.repository';
import { SearchSynonymsService, SYNONYMS_CACHE_TTL_MS } from './search-synonyms.service';

const loggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

const SAVED = [
  ['гаджет', 'gadget'],
  ['чохол', 'case', 'cases'],
];

describe('SearchSynonymsService (TASK-559)', () => {
  let repository: jest.Mocked<Pick<SearchSynonymsRepository, 'findAllGroups' | 'replaceAllGroups'>>;
  let meili: jest.Mocked<Pick<MeiliClient, 'isConfigured' | 'updateSynonyms'>>;
  let service: SearchSynonymsService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = {
      findAllGroups: jest.fn().mockResolvedValue([]),
      replaceAllGroups: jest.fn().mockResolvedValue(undefined),
    };
    meili = {
      isConfigured: jest.fn().mockReturnValue(true),
      updateSynonyms: jest.fn().mockResolvedValue(true),
    };
    service = new SearchSynonymsService(
      repository as unknown as SearchSynonymsRepository,
      meili as unknown as MeiliClient,
      loggerMock,
    );
  });

  describe('reading', () => {
    it('uses the built-in dictionary while nothing is saved', async () => {
      const settings = await service.getSettings();

      expect(settings.isDefault).toBe(true);
      expect(settings.groups.map((g) => g.terms)).toEqual(
        DEFAULT_SYNONYM_GROUPS.map((group) => [...group]),
      );
      await expect(service.getSynonymMap()).resolves.toBe(UA_EN_SYNONYMS);
    });

    it('uses the saved list — and ONLY it — once there is one', async () => {
      repository.findAllGroups.mockResolvedValue(SAVED);

      const settings = await service.getSettings();
      const map = await service.getSynonymMap();

      expect(settings).toEqual({
        isDefault: false,
        groups: [{ terms: ['гаджет', 'gadget'] }, { terms: ['чохол', 'case', 'cases'] }],
      });
      expect(map['гаджет']).toEqual(['gadget']);
      expect(map['case']).toEqual(['чохол', 'cases']);
      // A built-in pair the owner dropped is gone, not merged back in.
      expect(map['айфон']).toBeUndefined();
    });

    it('caches the map between reads within the TTL', async () => {
      await service.getSynonymMap();
      await service.getSynonymMap();

      expect(repository.findAllGroups).toHaveBeenCalledTimes(1);
    });

    it('re-reads the table once the TTL has passed', async () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
      await service.getSynonymMap();
      now.mockReturnValue(1_000 + SYNONYMS_CACHE_TTL_MS + 1);
      await service.getSynonymMap();
      now.mockRestore();

      expect(repository.findAllGroups).toHaveBeenCalledTimes(2);
    });

    it('never throws on the indexing path: a DB error falls back to the last list', async () => {
      repository.findAllGroups.mockResolvedValueOnce(SAVED);
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
      await service.getSynonymMap();

      now.mockReturnValue(1_000 + SYNONYMS_CACHE_TTL_MS + 1);
      repository.findAllGroups.mockRejectedValueOnce(new Error('db down'));
      const map = await service.getSynonymMap();
      now.mockRestore();

      expect(map['гаджет']).toEqual(['gadget']);
      expect(loggerMock.warn).toHaveBeenCalled();
    });

    it('falls back to the built-in dictionary when the very first read fails', async () => {
      repository.findAllGroups.mockRejectedValueOnce(new Error('db down'));

      await expect(service.getSynonymMap()).resolves.toBe(UA_EN_SYNONYMS);
    });
  });

  describe('saving', () => {
    it('replaces the whole list and pushes the new map to BOTH indexes', async () => {
      const result = await service.replace(SAVED);

      expect(repository.replaceAllGroups).toHaveBeenCalledWith(SAVED);
      expect(meili.updateSynonyms).toHaveBeenCalledTimes(2);
      const [productsMap, productsIndex] = meili.updateSynonyms.mock.calls[0];
      expect(productsIndex).toBe(PRODUCTS_INDEX);
      expect(productsMap['gadget']).toEqual(['гаджет']);
      expect(meili.updateSynonyms.mock.calls[1][1]).toBe(BLOG_POSTS_INDEX);
      expect(result).toMatchObject({ isDefault: false, appliedToSearch: true });
    });

    it('serves the new map immediately, without waiting for the TTL', async () => {
      await service.getSynonymMap(); // caches the defaults
      await service.replace(SAVED);

      const map = await service.getSynonymMap();
      expect(map['гаджет']).toEqual(['gadget']);
      expect(repository.findAllGroups).toHaveBeenCalledTimes(1);
    });

    it('an empty list restores the built-in dictionary', async () => {
      const result = await service.replace([]);

      expect(repository.replaceAllGroups).toHaveBeenCalledWith([]);
      expect(result.isDefault).toBe(true);
      expect(meili.updateSynonyms).toHaveBeenCalledWith(UA_EN_SYNONYMS, PRODUCTS_INDEX);
    });

    it('still saves when the engine is not configured, and says it was not applied', async () => {
      meili.isConfigured.mockReturnValue(false);

      const result = await service.replace(SAVED);

      expect(repository.replaceAllGroups).toHaveBeenCalled();
      expect(meili.updateSynonyms).not.toHaveBeenCalled();
      expect(result.appliedToSearch).toBe(false);
    });

    it('reports not applied when one index refuses the update', async () => {
      meili.updateSynonyms.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const result = await service.replace(SAVED);

      expect(result.appliedToSearch).toBe(false);
    });

    it('a read that started before a save cannot overwrite the saved list in the cache', async () => {
      // A read begins (TTL expired, product indexing) and sees the PRE-save rows…
      let resolveStaleRead!: (groups: string[][]) => void;
      repository.findAllGroups.mockReturnValueOnce(
        new Promise<string[][]>((resolve) => {
          resolveStaleRead = resolve;
        }),
      );
      const staleRead = service.getSynonymMap();

      // …the admin saves while it is still in flight…
      await service.replace(SAVED);

      // …and only then does the old read come back.
      resolveStaleRead([]);
      await staleRead;

      // The cache still holds the SAVED list, not the pre-save defaults — so a
      // reindex in the next minute pushes the new map, not the old one.
      const map = await service.getSynonymMap();
      expect(map['гаджет']).toEqual(['gadget']);
      expect(map).not.toBe(UA_EN_SYNONYMS);
      expect(repository.findAllGroups).toHaveBeenCalledTimes(1);
    });

    it('the admin screen re-reads after a save instead of joining a stale in-flight read', async () => {
      let resolveStaleRead!: (groups: string[][]) => void;
      repository.findAllGroups.mockReturnValueOnce(
        new Promise<string[][]>((resolve) => {
          resolveStaleRead = resolve;
        }),
      );
      const staleRead = service.getSynonymMap();
      await service.replace(SAVED);

      repository.findAllGroups.mockResolvedValueOnce(SAVED);
      const settings = await service.getSettings();
      resolveStaleRead([]);
      await staleRead;

      expect(settings.isDefault).toBe(false);
      expect(repository.findAllGroups).toHaveBeenCalledTimes(2);
    });

    it('does not touch the engine when the database write fails', async () => {
      repository.replaceAllGroups.mockRejectedValueOnce(new Error('db down'));

      await expect(service.replace(SAVED)).rejects.toThrow('db down');
      expect(meili.updateSynonyms).not.toHaveBeenCalled();
    });
  });
});
