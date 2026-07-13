import { Module } from '@nestjs/common';
import { SeoSettingsRepository } from './seo-settings.repository';
import { SeoSettingsService } from './seo-settings.service';
import { StoreLogoService } from './store-logo.service';
import { SeoSettingsController } from './seo-settings.controller';
import { AdminSeoSettingsController } from './admin-seo-settings.controller';
import { StorageModule } from '../storage';

/**
 * SeoSettingsModule — singleton global SEO configuration (TASK-239) plus the
 * store logo that lives on it (TASK-299, hence the StorageModule import).
 *
 * `RevalidationNotifier` is injected into the service from the `@Global()`
 * PublishingModule, so this module does not import it explicitly.
 */
@Module({
  imports: [StorageModule],
  controllers: [SeoSettingsController, AdminSeoSettingsController],
  providers: [SeoSettingsRepository, SeoSettingsService, StoreLogoService],
  exports: [SeoSettingsService],
})
export class SeoSettingsModule {}
