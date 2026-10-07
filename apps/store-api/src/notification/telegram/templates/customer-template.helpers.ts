import { escapeHtml } from '../telegram-html';
import type { TelegramRenderContext } from '../telegram-renderers';

/** The public «check my order» page (TASK-483): number + phone, no token. */
export const ORDER_STATUS_PATH = '/orders/status';

/**
 * The «Статус замовлення» line of a customer message (TASK-680), or null when
 * `STORE_CLIENT_URL` is not set — the line is dropped rather than pointing at
 * nowhere.
 */
export function orderStatusLinkLine(context: TelegramRenderContext): string | null {
  const url = context.storeUrl(ORDER_STATUS_PATH);
  return url ? `<a href="${escapeHtml(url)}">Статус замовлення</a>` : null;
}
