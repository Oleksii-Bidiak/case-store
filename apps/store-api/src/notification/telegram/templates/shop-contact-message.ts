import type { NotificationOutbox } from '@prisma/client';
import { escapeHtml } from '../telegram-html';
import type { TelegramRenderContext } from '../telegram-renderers';
import { adminLinkLine, joinDot, lines, payloadOf, text } from './shop-template.helpers';

/**
 * `shop-contact-message` (TASK-677) — «the contact form was submitted».
 *
 *   ✉️ <b>Нове повідомлення</b> від Олена
 *   Телефон: +380… · olena@example.com
 *   Тема: order · Замовлення: ORD-1
 *   «Доброго дня! …»
 *   <a href="…/messages?status=NEW">Відкрити в адмінці</a>
 *
 * The link opens the inbox filtered to unread: the admin has no page for a
 * single message, and the new one is at the top of that list.
 */
export function renderShopContactMessage(
  row: NotificationOutbox,
  context: TelegramRenderContext,
): string {
  const payload = payloadOf(row);
  const name = text(payload, 'name');
  const phone = text(payload, 'phone');
  const email = text(payload, 'email');
  const topic = text(payload, 'topic');
  const orderRef = text(payload, 'orderRef');
  const messageExcerpt = text(payload, 'excerpt');

  return lines(
    name ? `✉️ <b>Нове повідомлення</b> від ${escapeHtml(name)}` : '✉️ <b>Нове повідомлення</b>',
    joinDot(phone && `Телефон: ${escapeHtml(phone)}`, email && escapeHtml(email)),
    joinDot(
      topic && `Тема: ${escapeHtml(topic)}`,
      orderRef && `Замовлення: ${escapeHtml(orderRef)}`,
    ),
    messageExcerpt && `«${escapeHtml(messageExcerpt)}»`,
    adminLinkLine(context, '/messages?status=NEW'),
  );
}
