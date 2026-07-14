import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

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
  timestamp: string;
  uptime: number;
  checks: {
    database: 'up' | 'down';
  };
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness + readiness in one endpoint.
   *
   * This used to return a static `{ status: 'ok' }`, which made every layer that
   * depends on it lie in unison: the Docker healthcheck, Caddy, the CI smoke
   * check, and any uptime monitor all reported a healthy store while Postgres was
   * unreachable and every request 500'd. The database is not optional — if it is
   * down, this service is down, and `/health` has to say so.
   */
  async health(): Promise<HealthCheckResult> {
    const database = (await this.isDatabaseUp()) ? 'up' : 'down';

    return {
      status: database === 'up' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: { database },
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
