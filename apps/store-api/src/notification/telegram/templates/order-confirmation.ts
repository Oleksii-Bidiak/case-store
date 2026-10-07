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
 *
 * The third line is the next step, and it depends on the order:
 * - a PICKUP order is not a parcel — the shop calls when it is ready, the same
 *   promise as the letter's pickup note;
 * - the guest summary (owner decision 3) is queued when the chat connects, which
 *   may be after the order went out — then it says so instead of promising news
 *   that already happened, and a SHIPPED parcel's summary adds its ТТН (the
 *   «відправлено» notice went out before the chat). A cancelled order gets no summary at all
 *   (`CustomerNotifier.onBindingCreated`).
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
    nextStepLine(text(payload, 'deliveryMethod'), text(payload, 'status')),
    waybillLine(text(payload, 'trackingNumber')),
    orderStatusLinkLine(context),
  );
}

/**
 * The guest summary of an order already SHIPPED carries the waybill (as
 * `<code>`, so a tap copies it): the «відправлено» notice was queued before the
 * guest's chat existed.
 */
function waybillLine(trackingNumber: string | null): string | null {
  return trackingNumber ? `ТТН: <code>${escapeHtml(trackingNumber)}</code>` : null;
}

/** What happens next, worded by how the order is delivered and where it stands. */
function nextStepLine(deliveryMethod: string | null, status: string | null): string {
  const pickup = deliveryMethod === 'PICKUP';
  if (status === 'DELIVERED') {
    return pickup ? 'Замовлення вже видано.' : 'Замовлення вже доставлено.';
  }
  if (status === 'SHIPPED') {
    return pickup ? 'Замовлення вже готове до видачі.' : 'Посилка вже вирушила.';
  }
  return pickup
    ? 'Зателефонуємо, коли замовлення буде готове до видачі.'
    : 'Ми повідомимо, коли посилка вирушить.';
}
