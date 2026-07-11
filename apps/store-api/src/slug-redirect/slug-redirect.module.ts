import { Module } from '@nestjs/common';
import { SlugRedirectRepository } from './slug-redirect.repository';
import { SlugRedirectService } from './slug-redirect.service';
import { SlugRedirectController } from './slug-redirect.controller';

/**
 * SlugRedirectModule — server-side 301-redirect ledger for admin-renamed
 * content slugs (TASK-285, plan 147).
 *
 * Exports `SlugRedirectRepository` so the four content modules
 * (Pages/Blog/Product/Category) can inject it into their own repositories and
 * compose `recordRename` into the entity's slug-update transaction
 * (repository-to-repository DI — no service-layer involvement, no import
 * cycle since this module depends on nothing else).
 */
@Module({
  controllers: [SlugRedirectController],
  providers: [SlugRedirectRepository, SlugRedirectService],
  exports: [SlugRedirectRepository],
})
export class SlugRedirectModule {}
