import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

/**
 * A metric as Umami reports it: the value for the requested window plus the
 * value for the window immediately before it, which is what makes a
 * "+12% vs last week" comparison possible without a second request.
 */
export interface UmamiMetric {
  value: number;
  prev?: number;
}

/** Raw shape of `GET /api/websites/:id/stats` (Umami v2). */
export interface UmamiStatsRaw {
  pageviews: UmamiMetric;
  visitors: UmamiMetric;
  visits: UmamiMetric;
  bounces: UmamiMetric;
  /** Total time on site, in SECONDS, across all visits in the window. */
  totaltime: UmamiMetric;
}

/** How long a login token is reused before we authenticate again. */
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

/** Bound on every Umami call — a dashboard tile must never hang the request. */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * UmamiClient — thin wrapper around the self-hosted Umami v2 HTTP API
 * (TASK-380).
 *
 * ## Why the API key never leaves the server
 *
 * Umami's own dashboard is a separate app behind its own login. To show traffic
 * numbers INSIDE the admin panel, something has to hold a credential — and the
 * one place it must not be is the browser bundle, where `NEXT_PUBLIC_*` values
 * end up. So the admin calls our API, our API calls Umami, and the service
 * account lives only in the store-api container's environment.
 *
 * ## Gated by configuration, like every other integration here
 *
 * With any of `UMAMI_API_URL` / `UMAMI_API_USERNAME` / `UMAMI_API_PASSWORD` /
 * `UMAMI_WEBSITE_ID` missing, {@link isConfigured} is false and no request is
 * ever attempted — the admin card then shows the plain link it has always shown.
 * Mirrors `NovaPoshtaClient` and the LiqPay adapter: an unfinished integration
 * degrades, it does not break the page.
 *
 * ## Failures are "unknown", never zero
 *
 * Every call resolves to `null` on failure rather than throwing or returning
 * empty metrics. Zero visitors and "we could not reach the analytics service"
 * look identical on a dashboard tile and mean completely different things — the
 * first would have the owner wondering why the shop died overnight.
 */
@Injectable()
export class UmamiClient {
  private readonly baseUrl: string | null;
  private readonly username: string | null;
  private readonly password: string | null;
  private readonly websiteId: string | null;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    config: ConfigService,
    private readonly logger: PinoLogger,
    /** Overridable so specs can point at a mock server. */
    @Optional() private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.logger.setContext(UmamiClient.name);
    // Trailing slashes are the classic source of `//api/auth/login` 404s.
    this.baseUrl = (config.get<string>('UMAMI_API_URL') || '').replace(/\/+$/, '') || null;
    this.username = config.get<string>('UMAMI_API_USERNAME') || null;
    this.password = config.get<string>('UMAMI_API_PASSWORD') || null;
    this.websiteId = config.get<string>('UMAMI_WEBSITE_ID') || null;
  }

  /** True when all four settings are present — otherwise nothing is attempted. */
  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.username && this.password && this.websiteId);
  }

  /** Traffic metrics for `[startAt, endAt]` (epoch ms), or `null` when unconfigured or unreachable. */
  async getStats(startAt: number, endAt: number): Promise<UmamiStatsRaw | null> {
    return this.get<UmamiStatsRaw>('stats', `stats?startAt=${startAt}&endAt=${endAt}`);
  }

  /**
   * How many times each custom event fired in `[startAt, endAt]` (epoch ms),
   * keyed by event name — `GET /api/websites/:id/metrics?type=event` (TASK-689).
   * `null` when unconfigured or unreachable, exactly like {@link getStats}: an
   * event absent from a successful answer is a real 0, an unanswered request is
   * not.
   *
   * These are event COUNTS, not distinct visitors — two "add to cart" clicks by
   * one person are two. The funnel report says so rather than calling it people.
   *
   * Umami v2 answers `[{ x: name, y: count }]`; the `{ name, value }` spelling of
   * its newer API client is accepted too, so a server upgrade does not silently
   * turn every step into 0.
   */
  async getEventCounts(startAt: number, endAt: number): Promise<Record<string, number> | null> {
    const rows = await this.get<unknown>(
      'event metrics',
      `metrics?type=event&startAt=${startAt}&endAt=${endAt}`,
    );
    if (rows === null) return null;
    if (!Array.isArray(rows)) {
      this.logger.warn('Umami event metrics answered with something other than a list');
      return null;
    }

    const counts: Record<string, number> = {};
    for (const row of rows as Array<Record<string, unknown>>) {
      const name = row?.x ?? row?.name;
      const count = Number(row?.y ?? row?.value);
      if (typeof name === 'string' && Number.isFinite(count)) {
        counts[name] = (counts[name] ?? 0) + count;
      }
    }
    return counts;
  }

  /**
   * GET a website-scoped Umami resource, or `null` when unconfigured or
   * unreachable. A 401 drops the cached token and retries once, so a token that
   * expired early self-heals instead of muting the card until the next deploy.
   */
  private async get<T>(label: string, resource: string): Promise<T | null> {
    if (!this.isConfigured()) return null;

    const first = await this.request<T>(label, resource);
    if (first !== 'unauthorized') return first;

    this.token = null;
    const retried = await this.request<T>(label, resource);
    return retried === 'unauthorized' ? null : retried;
  }

  /** One attempt. `'unauthorized'` is distinct so the caller can retry. */
  private async request<T>(label: string, resource: string): Promise<T | null | 'unauthorized'> {
    const token = await this.authenticate();
    if (!token) return null;

    const url = `${this.baseUrl}/api/websites/${this.websiteId}/${resource}`;
    try {
      const response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 401) return 'unauthorized';
      if (!response.ok) {
        this.logger.warn(
          { status: response.status },
          `Umami ${label} request returned a non-OK status`,
        );
        return null;
      }
      return (await response.json()) as T;
    } catch (err) {
      this.logger.warn({ err }, `Umami ${label} request failed`);
      return null;
    }
  }

  /** Return a usable bearer token, logging in when the cached one is stale. */
  private async authenticate(): Promise<string | null> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn({ status: response.status }, 'Umami login failed');
        return null;
      }
      const body = (await response.json()) as { token?: string };
      if (!body?.token) {
        this.logger.warn('Umami login returned no token');
        return null;
      }
      this.token = { value: body.token, expiresAt: Date.now() + TOKEN_TTL_MS };
      return body.token;
    } catch (err) {
      this.logger.warn({ err }, 'Umami login request failed');
      return null;
    }
  }
}
