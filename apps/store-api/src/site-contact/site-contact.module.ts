import { Module } from '@nestjs/common';
import { SiteContactRepository } from './site-contact.repository';
import { SiteContactService } from './site-contact.service';
import { SiteContactController } from './site-contact.controller';
import { AdminSiteContactController } from './admin-site-contact.controller';

/**
 * SiteContactModule — singleton site-contact settings (phone/hours/social links).
 *
 * `RevalidationNotifier` is injected into the service from the `@Global()`
 * PublishingModule, so this module does not import it explicitly.
 */
@Module({
  controllers: [SiteContactController, AdminSiteContactController],
  providers: [SiteContactRepository, SiteContactService],
  exports: [SiteContactService],
})
export class SiteContactModule {}
