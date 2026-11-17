/**
 * Pure «Замовлення #старе замінено на #нове» email template builder (TASK-2048).
 *
 * Sent after «Створити копію» replaced the customer's order: the original is
 * cancelled (now or earlier) and a copy carries the sale on. Without it the
 * buyer sees one number cancelled and has no idea a new one exists — the
 * cancellation itself sends nothing.
 *
 * Same discipline as `order-payment-expired.template.ts`: a plain function from
 * data to `{ subject, html, text }`.
 */

import type { MailTemplate } from './order-shipped.template';

/** Plain data object consumed by {@link buildOrderReplacedEmail}. */
export interface OrderReplacedParams {
  customerName?: string;
  oldOrderId: string;
  newOrderId: string;
  /** The guest's status link of the NEW order; absent → no button. */
  orderStatusUrl?: string;
}

/** The JSON-safe payload stored in a `NotificationOutbox` row: the params plus a recipient. */
export interface OrderReplacedMailPayload extends OrderReplacedParams {
  to: string;
}

const ORDER_NUMBER_LENGTH = 8;

function orderNumber(id: string): string {
  return id.slice(0, ORDER_NUMBER_LENGTH).toUpperCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lead(params: OrderReplacedParams): string {
  return (
    `замовлення #${orderNumber(params.oldOrderId)} замінено на #${orderNumber(params.newOrderId)}. ` +
    'Старе замовлення скасовано — далі стежте за новим.'
  );
}

const MONEY_NOTE =
  'Якщо ви вже оплатили старе замовлення, оплату зараховано в нове; що лишиться понад його суму, ми повернемо.';

function renderHtml(params: OrderReplacedParams): string {
  const heading = params.customerName
    ? `${escapeHtml(params.customerName)}, ваше замовлення замінено`
    : 'Ваше замовлення замінено';
  const button = params.orderStatusUrl
    ? `<p style="margin:24px 0 0;">
  <a href="${escapeHtml(params.orderStatusUrl)}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Переглянути нове замовлення</a>
</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="margin:0 0 8px;font-size:22px;">${heading}</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Ваше ${lead(params).replace(/#([0-9A-F]{8})/g, '<strong>#$1</strong>')}
    </p>
    <p style="margin:0;color:#475569;">${MONEY_NOTE}</p>
    ${button}
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">
      Якщо щось не так, просто дайте відповідь на цей лист — ми розберемося.
    </p>
  </div>
</body>
</html>`;
}

function renderText(params: OrderReplacedParams): string {
  const heading = params.customerName
    ? `${params.customerName}, ваше замовлення замінено`
    : 'Ваше замовлення замінено';
  const sections = [heading, `Ваше ${lead(params)}`, MONEY_NOTE];
  if (params.orderStatusUrl) {
    sections.push('', `Нове замовлення: ${params.orderStatusUrl}`);
  }
  sections.push('', 'Якщо щось не так, просто дайте відповідь на цей лист — ми розберемося.');
  return sections.join('\n');
}

/** Build the «замовлення замінено» email parts (subject, HTML, plain text). */
export function buildOrderReplacedEmail(params: OrderReplacedParams): MailTemplate {
  return {
    subject: `Замовлення #${orderNumber(params.oldOrderId)} замінено на #${orderNumber(params.newOrderId)}`,
    html: renderHtml(params),
    text: renderText(params),
  };
}
