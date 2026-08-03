import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { RevalidateTarget } from './publishing.tokens';

/** Hard deadline for the storefront round-trip, in milliseconds. */
const REVALIDATE_TIMEOUT_MS = 3000;

/**
 * RevalidationNotifier — best-effort bridge that tells the Next.js storefront to
 * purge its ISR cache for the given tags/paths (TASK-187).
 *
 * It POSTs to the storefront's `/api/revalidate` route (`STOREFRONT_REVALIDATE_URL`)
 * authenticated with a shared secret (`REVALIDATE_SECRET`). It NEVER throws into
 * the caller: a storefront that is down, slow, or unconfigured must not fail an
 * admin write or crash a cron tick — failures are caught and logged.
 *
 * ## Why it announces itself at boot (TASK-383)
 *
 * When either config value is absent the notifier degrades to a no-op, which is
 * correct in dev/CI and catastrophic in production: the storefront then only
 * refreshes on its ISR timer, so an admin edit surfaces after a random 0–60
 * minutes. That state used to be COMPLETELY SILENT on both sides — this class
 * returned early without a word, and the storefront route answers 401/503 with
 * no log either. It shipped to a demo server that way and read as "the feature
 * does not work". So the disabled state is now announced once at boot, loudly in
 * production; per-call logging is deliberately avoided so a dev machine does not
 * drown in warnings.
 */
@Injectable()
export class RevalidationNotifier implements OnModuleInit {
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

  onModuleInit(): void {
    if (this.url && this.secret) {
      return;
    }

    const missing = [
      this.url ? undefined : 'STOREFRONT_REVALIDATE_URL',
      this.secret ? undefined : 'REVALIDATE_SECRET',
    ].filter(Boolean);

    const payload = { event: 'revalidate.notify.disabled', missing };
    const message =
      `Storefront revalidation is DISABLED (${missing.join(', ')} unset) — ` +
      'admin edits will only reach the storefront when its ISR timer expires';

    // In production this is a defect, not a configuration choice: env validation
    // rejects the missing values before boot, so reaching this branch means the
    // check itself was bypassed. Everywhere else it is the expected dev default.
    if (this.config.get<string>('NODE_ENV') === 'production') {
      this.logger.error(payload, message);
    } else {
      this.logger.debug(payload, message);
    }
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
        // This call is awaited inside the admin's write request. Without a
        // deadline, a storefront that accepts the connection and then hangs
        // holds the admin's "Save" open indefinitely.
        signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
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
