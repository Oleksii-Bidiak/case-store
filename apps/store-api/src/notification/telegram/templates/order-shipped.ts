import type { NotificationOutbox } from '@prisma/client';
import { orderNumber } from '../../../mail';
import { escapeHtml } from '../telegram-html';
import type { TelegramRenderContext } from '../telegram-renderers';
import { deliveryMethodLabel, joinDot, lines, payloadOf, text } from './shop-template.helpers';
import { orderStatusLinkLine } from './customer-template.helpers';

/**
 * `order-shipped` on TELEGRAM (TASK-680) — «замовлення відправлено», next to
 * the letter of TASK-335.
 *
 *   🚚 <b>Замовлення #AB12CD34 відправлено</b>
 *   Доставка: Нова Пошта · ТТН: <code>20450000000000</code>
 *   <a href="https://novaposhta.ua/tracking/?cargo_number=…">Відстежити посилку</a>
 *   <a href="…/orders/status">Статус замовлення</a>
 *
 * The waybill is `<code>` so a tap copies it. The tracking link is printed only
 * for a Nova Poshta parcel — NP's page knows nothing about another carrier's
 * number. A notice without a waybill (the operator enters it later; the
 * follow-up comes as a second message) simply has no ТТН line.
 */
export function renderOrderShipped(
  row: NotificationOutbox,
  context: TelegramRenderContext,
): string {
  const payload = payloadOf(row);
  const orderId = text(payload, 'orderId');
  const number = text(payload, 'orderNumber') ?? (orderId ? orderNumber(orderId) : null);
  const trackingNumber = text(payload, 'trackingNumber');
  const deliveryMethod = text(payload, 'deliveryMethod');

  const trackingLink =
    trackingNumber && deliveryMethod === 'NOVA_POSHTA'
      ? `<a href="${escapeHtml(
          `https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(trackingNumber)}`,
        )}">Відстежити посилку</a>`
      : null;

  return lines(
    number
      ? `🚚 <b>Замовлення #${escapeHtml(number)} відправлено</b>`
      : '🚚 <b>Замовлення відправлено</b>',
    joinDot(
      deliveryMethod && `Доставка: ${deliveryMethodLabel(deliveryMethod)}`,
      trackingNumber && `ТТН: <code>${escapeHtml(trackingNumber)}</code>`,
    ),
    trackingLink,
    orderStatusLinkLine(context),
  );
}
