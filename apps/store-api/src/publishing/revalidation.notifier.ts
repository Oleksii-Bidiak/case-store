import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { RevalidateTarget } from './publishing.tokens';

/**
 * RevalidationNotifier — best-effort bridge that tells the Next.js storefront to
 * purge its ISR cache for the given tags/paths (TASK-187).
 *
 * It POSTs to the storefront's `/api/revalidate` route (`STOREFRONT_REVALIDATE_URL`)
 * authenticated with a shared secret (`REVALIDATE_SECRET`). It NEVER throws into
 * the caller: a storefront that is down, slow, or unconfigured must not fail an
 * admin write or crash a cron tick — failures are caught and logged. When either
 * config value is absent (typical in dev/CI) it is a silent no-op.
 */
@Injectable()
export class RevalidationNotifier {
  private readonly url?: string;
  private readonly secret?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RevalidationNotifier.name);
    this.url = this.config.get<string>('STOREFRONT_REVALIDATE_URL');
    this.secret = this.config.get<string>('REVALIDATE_SECRET');
  }

  /**
   * Ask the storefront to revalidate the given cache `tags` (and optional
   * `paths`). Resolves even on failure — the promise never rejects.
   */
  async revalidate(target: RevalidateTarget): Promise<void> {
    if (!this.url || !this.secret) {
      // Unconfigured (dev/CI) — nothing to notify.
      return;
    }

    const body = JSON.stringify({ tags: target.tags, paths: target.paths ?? [] });

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': this.secret,
        },
        body,
      });

      if (!res.ok) {
        this.logger.warn(
          { event: 'revalidate.notify.failed', status: res.status, tags: target.tags },
          `Storefront revalidation returned ${res.status}`,
        );
        return;
      }

      this.logger.info(
        { event: 'revalidate.notify', tags: target.tags, paths: target.paths ?? [] },
        `Storefront revalidation requested (${target.tags.join(', ')})`,
      );
    } catch (err) {
      this.logger.warn(
        { event: 'revalidate.notify.error', err, tags: target.tags },
        'Storefront revalidation request failed (ignored)',
      );
    }
  }
}
