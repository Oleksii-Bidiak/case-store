// Mail Outbox Module — public API
export { MailOutboxModule } from './mail-outbox.module';
export { MailOutboxService } from './mail-outbox.service';
export { MailOutboxRepository, type EnqueueMailParams } from './mail-outbox.repository';
export { MailOutboxWorker } from './mail-outbox.worker';
export { MAIL_OUTBOX_CLOCK, systemClock, type Clock } from './mail-outbox.clock';
export { ORDER_CONFIRMATION_MAIL_TYPE, type DispatchResult } from './mail-outbox.types';
