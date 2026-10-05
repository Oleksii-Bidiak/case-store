import type { ConfigService } from '@nestjs/config';

/**
 * Absolute link into the ADMIN panel for a notification (TASK-674; first used by
 * the owner pings of TASK-677 — "нове замовлення №…" opens the order in the admin).
 *
 * `STORE_ADMIN_URL` is required in production (env.validation.ts) and compose
 * feeds it from `NEXT_PUBLIC_ADMIN_URL`, the same origin the admin bundle is built
 * for. Returns `null` when it is unset — a dev box — so the caller sends the
 * message without a link rather than one pointing at a machine that does not
 * exist. Deliberately no `http://localhost:3002` default: a default is what makes
 * a missing origin invisible (the STORE_CLIENT_URL lesson, TASK-324).
 *
 * `path` must start with `/` (e.g. `/orders/123`).
 */
export function adminUrl(config: ConfigService, path: string): string | null {
  const origin = config.get<string>('STORE_ADMIN_URL')?.replace(/\/+$/, '');
  return origin ? `${origin}${path}` : null;
}
