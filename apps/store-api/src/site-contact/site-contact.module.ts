import { Module } from '@nestjs/common';
import { SiteContactRepository } from './site-contact.repository';
import { SiteContactService } from './site-contact.service';
import { SiteContactController } from './site-contact.controller';
import { AdminSiteContactController } from './admin-site-contact.controller';

@Module({
  controllers: [SiteContactController, AdminSiteContactController],
  providers: [SiteContactRepository, SiteContactService],
  exports: [SiteContactService],
})
export class SiteContactModule {}
