/**
 * Injectable clock abstraction for the notification-outbox subsystem.
 *
 * The dispatch state machine ({@link NotificationOutboxService.dispatchDue}) computes
 * retry backoff windows from "now". Injecting the clock — rather than calling
 * `new Date()` inline — keeps that branch logic deterministic under test: a spec
 * pins a fixed instant and asserts exact `nextAttemptAt` values without fake
 * timers or wall-clock flakiness (see the Risks table in plan 092).
 */
export interface Clock {
  now(): Date;
}

/** DI token for the {@link Clock} consumed by the notification-outbox service. */
export const NOTIFICATION_OUTBOX_CLOCK = Symbol('NOTIFICATION_OUTBOX_CLOCK');

/** Production clock — reads the real wall-clock time. */
export const systemClock: Clock = {
  now: () => new Date(),
};
