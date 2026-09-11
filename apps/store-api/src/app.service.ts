import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ThrottlerRedisHealth, type ThrottlerStoreStatus } from './throttler';

/**
 * How long the database ping may take before we call the database down.
 *
 * Must stay comfortably under the Docker HEALTHCHECK timeout (5s, see the
 * store-api Dockerfile) — a saturated or wedged connection pool would otherwise
 * leave the request hanging until the probe itself times out, which reports the
 * container as *unhealthy* without ever telling us why.
 */
const DB_PING_TIMEOUT_MS = 3_000;

export type HealthCheckResult = {
  status: 'ok' | 'error';
  /**
   * Something non-fatal is broken: the service still answers, but not with all
   * of its guarantees. Today that means the rate-limit store is unreachable
   * (TASK-401). `status` stays `ok` and the probe stays 200 — see below.
   */
  degraded: boolean;
  timestamp: string;
  uptime: number;
  checks: {
    database: 'up' | 'down';
    rateLimitStore: ThrottlerStoreStatus;
  };
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly throttlerRedis: ThrottlerRedisHealth,
  ) {}

  /**
   * Liveness + readiness in one endpoint.
   *
   * This used to return a static `{ status: 'ok' }`, which made every layer that
   * depends on it lie in unison: the Docker healthcheck, Caddy, the CI smoke
   * check, and any uptime monitor all reported a healthy store while Postgres was
   * unreachable and every request 500'd. The database is not optional — if it is
   * down, this service is down, and `/health` has to say so.
   *
   * ## Why the rate-limit store does NOT turn the probe red (TASK-401)
   *
   * Redis holds the rate-limit counters, and its outage is real — public writes
   * are refused while it lasts. But `status: 'error'` here means 503, which
   * Docker reads as *unhealthy* and Caddy as "take this container out": a Redis
   * blip would then stop the shop from serving pages it can serve perfectly
   * well, and a restart cannot fix a dependency the container does not own. So
   * it is reported as `degraded` with `checks.rateLimitStore`, which an uptime
   * monitor can alert on without anything killing the container.
   */
  async health(): Promise<HealthCheckResult> {
    const database = (await this.isDatabaseUp()) ? 'up' : 'down';
    const rateLimitStore = this.throttlerRedis.status;

    return {
      status: database === 'up' ? 'ok' : 'error',
      degraded: this.throttlerRedis.isDegraded,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: { database, rateLimitStore },
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`database ping exceeded ${DB_PING_TIMEOUT_MS}ms`)),
            DB_PING_TIMEOUT_MS,
          );
        }),
      ]);

      return true;
    } catch (error) {
      // Logged, never rethrown: the controller turns this into a 503 itself. An
      // exception here would reach the global HttpExceptionFilter, which reports
      // 5xx to Sentry — and with a probe running every 30s a database outage
      // would bury the Sentry quota under thousands of identical events.
      this.logger.error(
        `Health check: database unreachable — ${error instanceof Error ? error.message : String(error)}`,
      );

      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
