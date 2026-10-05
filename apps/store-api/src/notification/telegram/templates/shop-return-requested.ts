import type { NotificationOutbox } from '@prisma/client';
import { orderNumber } from '../../../mail/templates/order-confirmation.template';
import { escapeHtml } from '../telegram-html';
import type { TelegramRenderContext } from '../telegram-renderers';
import { adminLinkLine, count, lines, payloadOf, text } from './shop-template.helpers';

/**
 * `shop-return-requested` (TASK-677) — «a customer asked to return goods».
 *
 *   ↩️ <b>Заявка на повернення</b> до замовлення #AB12CD34
 *   Повертають: 1 шт.
 *   Причина: «Не підійшов розмір»
 *   <a href="…/returns/<id>">Відкрити в адмінці</a>
 */
export function renderShopReturnRequested(
  row: NotificationOutbox,
  context: TelegramRenderContext,
): string {
  const payload = payloadOf(row);
  const returnId = text(payload, 'returnId');
  const orderId = text(payload, 'orderId');
  const itemsCount = count(payload, 'itemsCount');
  const reason = text(payload, 'reason');

  return lines(
    orderId
      ? `↩️ <b>Заявка на повернення</b> до замовлення #${escapeHtml(orderNumber(orderId))}`
      : '↩️ <b>Заявка на повернення</b>',
    itemsCount !== null && `Повертають: ${itemsCount} шт.`,
    reason && `Причина: «${escapeHtml(reason)}»`,
    returnId && adminLinkLine(context, `/returns/${encodeURIComponent(returnId)}`),
  );
}
