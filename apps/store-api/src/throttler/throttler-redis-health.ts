import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

/**
 * State of the store that holds the rate-limit counters.
 *
 * - `disabled` — `REDIS_HOST` is unset, so the in-memory store is in use. Fine
 *   in dev and for a single instance; NOT a degraded state.
 * - `up` — Redis answered the last time we asked.
 * - `down` — Redis did not. Limits are not being counted.
 */
export type ThrottlerStoreStatus = 'disabled' | 'up' | 'down';

/**
 * The rate limiter's health, in one place (TASK-401).
 *
 * ## Why this exists
 *
 * On the demo stand the rate limiter was silently OFF for the whole run: the
 * storage caught every Redis error and returned "0 hits so far", so seven
 * contact-form submissions went through a 5/min limit, and `/auth/login` took
 * unlimited password attempts. Nothing failed, nothing alerted, `/health` said
 * `ok`. A misconfigured `REDIS_PASSWORD` looked exactly like a healthy shop.
 *
 * So the state is now (a) established at boot with a PING, (b) kept current by
 * every counter write, (c) reported by `/health` as `degraded`, and (d) logged
 * as `throttler.redis.unreachable` — the event name to grep for in the API logs.
 *
 * ## Why it logs on transitions only
 *
 * An outage means EVERY request fails to touch the counter. Logging per request
 * would bury the incident under thousands of identical lines (and, in
 * production, the Sentry quota with it). One line when it breaks, one when it
 * comes back.
 */
@Injectable()
export class ThrottlerRedisHealth {
  private state: ThrottlerStoreStatus = 'disabled';

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ThrottlerRedisHealth.name);
  }

  get status(): ThrottlerStoreStatus {
    return this.state;
  }

  /** True only for a configured store we cannot reach — the state worth alerting on. */
  get isDegraded(): boolean {
    return this.state === 'down';
  }

  /** `REDIS_HOST` unset: the in-memory store counts, per instance. Not degraded. */
  markDisabled(): void {
    this.state = 'disabled';
  }

  /** Redis answered — at boot or on a counter write. */
  markReachable(): void {
    const wasDown = this.state === 'down';
    this.state = 'up';

    if (wasDown) {
      this.logger.warn(
        { event: 'throttler.redis.recovered' },
        'Rate-limit store reachable again — limits are being enforced',
      );
    }
  }

  /** Redis did not answer. Logged once per outage, at error level. */
  markUnreachable(reason: string): void {
    if (this.state === 'down') {
      return;
    }

    this.state = 'down';
    this.logger.error(
      { event: 'throttler.redis.unreachable', reason },
      'Rate-limit store is UNREACHABLE — public writes are refused (503) and every other ' +
        'route is served without a rate limit until it recovers',
    );
  }
}
