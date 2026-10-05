import type { NotificationChannel, NotificationOutbox } from '@prisma/client';

/**
 * Result of a cheap, side-effect-free channel probe (TASK-673).
 *
 * - `ok` — the transport is configured and believed to work;
 * - `disabled` — deliberately not configured (no SMTP in dev, no bot token);
 * - `failed` — configured, but the last probe said it does not work.
 */
export interface ChannelHealth {
  state: 'ok' | 'disabled' | 'failed';
  /** Human-readable reason, e.g. the bot username or the failure description. */
  detail?: string;
}

/**
 * One delivery channel of the notification outbox (TASK-673).
 *
 * The outbox row answers two independent questions: `type` — "what happened"
 * (order confirmed, password reset requested…) and `channel` — "where to say
 * it". An adapter owns one channel and renders the pair `(type, channel)`: the
 * email adapter keeps using the mail templates where they live today; the
 * Telegram adapter (`notification/telegram/telegram.adapter.ts`, TASK-674)
 * renders its own short text for the same `type`.
 *
 * {@link NotificationOutboxService.dispatchDue} picks the adapter by
 * `row.channel` and owns the retry/backoff state machine — an adapter only
 * sends, and signals failure by throwing:
 * - any `Error` → transient: the row is rescheduled with backoff until
 *   `maxAttempts`, then marked FAILED;
 * - {@link PermanentDeliveryError} → the row is marked FAILED at once (retrying
 *   a blocked chat or a malformed address only burns attempts).
 */
export interface NotificationChannelAdapter {
  /** The channel this adapter delivers. At most one adapter per channel. */
  readonly channel: NotificationChannel;

  /**
   * Whether the channel can deliver right now. When `false` the dispatcher
   * applies the "transport disabled" branch to this channel's rows only: in
   * production they stay PENDING (and an error is logged); elsewhere they are
   * drained as a no-op SENT — but only when {@link isConfigured} is `false` too.
   */
  isEnabled(): boolean;

  /**
   * Whether the channel is configured at all (SMTP switched on, bot token set),
   * regardless of whether it currently works. Separates "this machine has no
   * transport and never will" — the only case where the dev/CI no-op drain is
   * safe — from "configured, but down or not verified yet", whose rows must stay
   * PENDING everywhere: draining them would report delivery that never happened.
   */
  isConfigured(): boolean;

  /** Render and deliver one row. Resolves on success; throws on failure. */
  send(row: NotificationOutbox): Promise<void>;

  /** Cheap state probe for admin/ops screens — must not deliver anything. */
  healthcheck(): Promise<ChannelHealth>;
}

/**
 * DI token for the list of registered {@link NotificationChannelAdapter}s.
 *
 * Bound in {@link NotificationOutboxModule} through a `useFactory` that collects
 * the adapters into one array. **Extension point:** a new channel is added by
 * making its adapter injectable in that module — provided there, like
 * `EmailAdapter`, or exported by an imported module, like `TelegramAdapter`
 * from `NotificationModule` — and appending it to the factory's `inject` list
 * and returned array. The dispatcher needs no change.
 */
export const NOTIFICATION_CHANNEL_ADAPTERS = Symbol('NOTIFICATION_CHANNEL_ADAPTERS');

/**
 * Thrown by an adapter when retrying cannot help (recipient blocked the bot,
 * chat does not exist, address rejected as malformed). The dispatcher marks the
 * row FAILED immediately instead of scheduling a retry.
 */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}
