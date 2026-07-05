import { Module } from '@nestjs/common';
import { NewsletterRepository } from './newsletter.repository';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { AdminNewsletterController } from './admin-newsletter.controller';

@Module({
  controllers: [NewsletterController, AdminNewsletterController],
  providers: [NewsletterRepository, NewsletterService],
  exports: [NewsletterService],
})
export class NewsletterModule {}
