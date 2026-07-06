import { Module } from '@nestjs/common';
import { SeoSettingsRepository } from './seo-settings.repository';
import { SeoSettingsService } from './seo-settings.service';
import { SeoSettingsController } from './seo-settings.controller';
import { AdminSeoSettingsController } from './admin-seo-settings.controller';

/**
 * SeoSettingsModule — singleton global SEO configuration (TASK-239).
 *
 * `RevalidationNotifier` is injected into the service from the `@Global()`
 * PublishingModule, so this module does not import it explicitly.
 */
@Module({
  controllers: [SeoSettingsController, AdminSeoSettingsController],
  providers: [SeoSettingsRepository, SeoSettingsService],
  exports: [SeoSettingsService],
})
export class SeoSettingsModule {}
