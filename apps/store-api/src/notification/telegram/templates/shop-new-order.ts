import type { NotificationOutbox } from '@prisma/client';
import { formatMoney, orderNumber } from '../../../mail';
import { escapeHtml } from '../telegram-html';
import type { TelegramRenderContext } from '../telegram-renderers';
import {
  adminLinkLine,
  count,
  deliveryMethodLabel,
  joinDot,
  lines,
  paymentMethodLabel,
  payloadOf,
  text,
} from './shop-template.helpers';

/**
 * `shop-new-order` (TASK-677) — «a customer placed an order».
 *
 *   🛒 <b>Нове замовлення #AB12CD34</b>
 *   Сума: 1 299 ₴ · 2 шт.
 *   Оплата: післяплата · Доставка: Нова Пошта
 *   Покупець: Іван · Київ
 *   <a href="…/orders/<id>">Відкрити в адмінці</a>
 *
 * The number is the one the customer sees in their letter (the first 8
 * characters of the id), and the sum is formatted exactly as the letter does.
 */
export function renderShopNewOrder(
  row: NotificationOutbox,
  context: TelegramRenderContext,
): string {
  const payload = payloadOf(row);
  const orderId = text(payload, 'orderId');
  const total = text(payload, 'total');
  const itemsCount = count(payload, 'itemsCount');
  const paymentMethod = text(payload, 'paymentMethod');
  const deliveryMethod = text(payload, 'deliveryMethod');
  const customerName = text(payload, 'customerName');
  const city = text(payload, 'city');

  const customer = joinDot(customerName && escapeHtml(customerName), city && escapeHtml(city));

  return lines(
    orderId
      ? `🛒 <b>Нове замовлення #${escapeHtml(orderNumber(orderId))}</b>`
      : '🛒 <b>Нове замовлення</b>',
    joinDot(
      total && `Сума: ${escapeHtml(formatMoney(total))}`,
      itemsCount !== null && `${itemsCount} шт.`,
    ),
    joinDot(
      paymentMethod && `Оплата: ${paymentMethodLabel(paymentMethod)}`,
      deliveryMethod && `Доставка: ${deliveryMethodLabel(deliveryMethod)}`,
    ),
    customer && `Покупець: ${customer}`,
    orderId && adminLinkLine(context, `/orders/${encodeURIComponent(orderId)}`),
  );
}
