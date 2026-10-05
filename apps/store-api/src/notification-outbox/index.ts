// Notification Outbox Module — public API
export { NotificationOutboxModule } from './notification-outbox.module';
export { NotificationOutboxService } from './notification-outbox.service';
export {
  NotificationOutboxRepository,
  type EnqueueNotificationParams,
} from './notification-outbox.repository';
export { NotificationOutboxWorker } from './notification-outbox.worker';
export { NOTIFICATION_OUTBOX_CLOCK, systemClock, type Clock } from './notification-outbox.clock';
export { ORDER_CONFIRMATION_MAIL_TYPE, type DispatchResult } from './notification-outbox.types';
export {
  NOTIFICATION_CHANNEL_ADAPTERS,
  PermanentDeliveryError,
  type ChannelHealth,
  type NotificationChannelAdapter,
} from './channels/notification-channel-adapter';
export { EmailAdapter } from './channels/email.adapter';
