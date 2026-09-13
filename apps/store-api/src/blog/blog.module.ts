import { Module } from '@nestjs/common';
import { BlogRepository } from './blog.repository';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { AdminBlogController } from './admin-blog.controller';
import { PUBLISHABLE_REPOSITORY } from '../publishing';
import { SlugRedirectModule } from '../slug-redirect';
import { SearchModule } from '../search/search.module';

@Module({
  // SearchModule supplies the BlogIndexer seam (TASK-417) — the narrow port
  // BlogService uses to keep the `blog_posts` index in step with post mutations
  // and to ask it a query. The edge is one-directional on purpose: SearchModule
  // provides its OWN BlogRepository instance rather than importing BlogModule,
  // so this import cannot close a module cycle.
  imports: [SlugRedirectModule, SearchModule],
  controllers: [BlogController, AdminBlogController],
  providers: [
    BlogRepository,
    BlogService,
    // Register BlogRepository as a scheduled publisher under the shared token so
    // the PublishingScheduler flips due SCHEDULED posts live. The scheduler
    // collects every module's token provider via DiscoveryService — Nest has no
    // Angular-style `multi`, so one `useExisting` alias per content module is the
    // registration mechanism (see docs/plans/104-publishing-foundation.md).
    { provide: PUBLISHABLE_REPOSITORY, useExisting: BlogRepository },
  ],
  exports: [BlogService],
})
export class BlogModule {}
