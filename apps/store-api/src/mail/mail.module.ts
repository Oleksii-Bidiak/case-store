import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * MailModule — transactional email.
 *
 * Declared `@Global()` so `MailService` is injectable anywhere after a single
 * import in `AppModule`, without each consuming module re-importing it. Today
 * only `OrderModule` uses it; the global decorator keeps future senders
 * (e.g. abandoned-cart follow-up, TASK-049) friction-free.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
