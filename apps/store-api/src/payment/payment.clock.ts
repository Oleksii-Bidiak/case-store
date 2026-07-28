/**
 * Injectable clock for the payment subsystem — same pattern, same reason as
 * {@link MAIL_OUTBOX_CLOCK} (`mail-outbox/mail-outbox.clock.ts`).
 *
 * The reconcile worker's whole job is time arithmetic: "PENDING for longer than
 * the grace period", "reservation deadline already passed". Injecting the clock
 * lets a spec pin an instant and assert exactly which attempts get polled and
 * which orders get cancelled — no fake timers, no wall-clock flakiness, and no
 * test that passes at 23:59 and fails at 00:00.
 */
export interface Clock {
  now(): Date;
}

/** DI token for the {@link Clock} consumed by the payment module. */
export const PAYMENT_CLOCK = Symbol('PAYMENT_CLOCK');

/** Production clock — reads the real wall-clock time. */
export const systemClock: Clock = {
  now: () => new Date(),
};
