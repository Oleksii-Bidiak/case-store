import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PublishingScheduler } from './publishing.scheduler';
import { RevalidationNotifier } from './revalidation.notifier';

/**
 * PublishingModule — shared publishing infrastructure (TASK-187).
 *
 * Declared `@Global()` so {@link RevalidationNotifier} is injectable in any
 * content module (Pages today; blog/banners later) WITHOUT that module importing
 * this one — which keeps the dependency graph acyclic even though this module,
 * via {@link PublishingScheduler}, discovers those content repositories.
 *
 * The {@link PublishingScheduler} uses Nest's {@link DiscoveryModule} to collect
 * every repository registered under `PUBLISHABLE_REPOSITORY` (a `multi` token),
 * so new content models plug in by providing that token alone — no edit here.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [PublishingScheduler, RevalidationNotifier],
  exports: [RevalidationNotifier],
})
export class PublishingModule {}
