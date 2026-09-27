import { Module } from '@nestjs/common';
import { MeiliClient } from '../search/meili.client';
import { SearchSynonymsRepository } from './search-synonyms.repository';
import { SearchSynonymsService } from './search-synonyms.service';
import { AdminSearchSynonymsController } from './admin-search-synonyms.controller';

/**
 * SearchSynonymsModule — the admin-edited synonym list (TASK-559).
 *
 * `SearchModule` imports this module (for {@link SearchSynonymsService}); this
 * module never imports `SearchModule`, so the edge is one-directional. It
 * therefore provides its OWN {@link MeiliClient} — a stateless wrapper around
 * the engine's HTTP API, the same way `SearchModule` provides its own
 * repositories — to push the new map after a save.
 */
@Module({
  controllers: [AdminSearchSynonymsController],
  providers: [SearchSynonymsRepository, SearchSynonymsService, MeiliClient],
  exports: [SearchSynonymsService],
})
export class SearchSynonymsModule {}
