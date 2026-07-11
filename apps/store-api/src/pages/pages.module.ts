import { Module } from '@nestjs/common';
import { PageRepository } from './pages.repository';
import { PageService } from './pages.service';
import { PageController } from './pages.controller';
import { AdminPageController } from './admin-pages.controller';
import { PUBLISHABLE_REPOSITORY } from '../publishing';
import { SlugRedirectModule } from '../slug-redirect';

@Module({
  imports: [SlugRedirectModule],
  controllers: [PageController, AdminPageController],
  providers: [
    PageRepository,
    PageService,
    // Register PageRepository as a scheduled publisher under the shared token so
    // the PublishingScheduler flips due SCHEDULED pages live. The scheduler
    // collects every module's token provider via DiscoveryService — Nest has no
    // Angular-style `multi`, so one `useExisting` alias per content module is the
    // registration mechanism.
    { provide: PUBLISHABLE_REPOSITORY, useExisting: PageRepository },
  ],
  exports: [PageService],
})
export class PagesModule {}
