import type { PinoLogger } from 'nestjs-pino';
import { ThrottlerRedisHealth } from './throttler-redis-health';

function build() {
  const logger = {
    setContext: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  return {
    logger,
    health: new ThrottlerRedisHealth(logger as unknown as PinoLogger),
  };
}

describe('ThrottlerRedisHealth', () => {
  it('starts as `disabled` — the in-memory store is a choice, not an outage', () => {
    const { health } = build();

    expect(health.status).toBe('disabled');
    expect(health.isDegraded).toBe(false);
  });

  it('reports a configured-but-unreachable store as degraded', () => {
    const { health } = build();

    health.markUnreachable('ECONNREFUSED');

    expect(health.status).toBe('down');
    expect(health.isDegraded).toBe(true);
  });

  // The event name is the contract: it is what `docker compose logs store-api |
  // grep throttler` has to surface during an incident, and what an alert rule
  // keys off. Renaming it silently would leave both looking clean.
  it('logs `throttler.redis.unreachable` at error level, with the reason', () => {
    const { health, logger } = build();

    health.markUnreachable('NOAUTH Authentication required');

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toEqual({
      event: 'throttler.redis.unreachable',
      reason: 'NOAUTH Authentication required',
    });
  });

  // An outage means every request fails to reach the counter. One line per
  // request would bury the incident (and, in production, the log budget).
  it('logs the outage once, not once per failed request', () => {
    const { health, logger } = build();

    health.markUnreachable('ECONNREFUSED');
    health.markUnreachable('ECONNREFUSED');
    health.markUnreachable('ECONNREFUSED');

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(health.status).toBe('down');
  });

  it('announces recovery once, so an incident has a visible end', () => {
    const { health, logger } = build();

    health.markUnreachable('ECONNREFUSED');
    health.markReachable();
    health.markReachable();

    expect(health.status).toBe('up');
    expect(health.isDegraded).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toEqual({ event: 'throttler.redis.recovered' });
  });

  it('says nothing when a healthy store simply keeps working', () => {
    const { health, logger } = build();

    health.markReachable();
    health.markReachable();

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
