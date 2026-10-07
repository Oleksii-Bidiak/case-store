import type { NotificationOutbox } from '@prisma/client';
import { formatMoney, orderNumber } from '../../../mail';
import { escapeHtml } from '../telegram-html';
import type { TelegramRenderContext } from '../telegram-renderers';
import { count, joinDot, lines, payloadOf, text } from './shop-template.helpers';
import { orderStatusLinkLine } from './customer-template.helpers';

/**
 * `order-confirmation` on TELEGRAM (TASK-680) — the buyer's «замовлення
 * прийнято», sent next to the confirmation letter, never instead of it.
 *
 *   ✅ <b>Замовлення #AB12CD34 прийнято</b>
 *   Сума: 1 299 ₴ · 2 шт.
 *   Ми повідомимо, коли посилка вирушить.
 *   <a href="…/orders/status">Статус замовлення</a>
 *
 * A short text and a link, not a retelling of the letter (plan 187): the items,
 * the address and the guest's status-link token stay in the mailbox. The link
 * opens the public number + phone lookup, which needs no token at all.
 */
export function renderOrderConfirmation(
  row: NotificationOutbox,
  context: TelegramRenderContext,
): string {
  const payload = payloadOf(row);
  const orderId = text(payload, 'orderId');
  const number = text(payload, 'orderNumber') ?? (orderId ? orderNumber(orderId) : null);
  const total = text(payload, 'total');
  const itemsCount = count(payload, 'itemsCount');

  return lines(
    number
      ? `✅ <b>Замовлення #${escapeHtml(number)} прийнято</b>`
      : '✅ <b>Замовлення прийнято</b>',
    joinDot(
      total && `Сума: ${escapeHtml(formatMoney(total))}`,
      itemsCount !== null && `${itemsCount} шт.`,
    ),
    'Ми повідомимо, коли посилка вирушить.',
    orderStatusLinkLine(context),
  );
}
