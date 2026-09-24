/**
 * Pure «оплату не отримано» email template builder (TASK-352 (b), decision
 * B-11 №2).
 *
 * The one letter a customer gets when an online-paid order's reservation lapsed
 * unpaid and the reconcile worker cancelled it: the payment did not arrive, the
 * order is cancelled, the goods are back on sale — and here is the way back.
 * `docs/payments-liqpay.md` §8 promised this letter long before it existed.
 * There is deliberately no reminder before the deadline (a second scheduled
 * step and a "sent" flag for five minutes of reaction time).
 *
 * Same discipline as `order-shipped.template.ts`: no NestJS, no nodemailer, no
 * config — a plain function from data to `{ subject, html, text }`.
 */

import type { MailTemplate } from './order-shipped.template';

/** Plain data object consumed by {@link buildOrderPaymentExpiredEmail}. */
export interface OrderPaymentExpiredParams {
  customerName?: string;
  order: {
    id: string;
    /** What was in the order; `url` is the storefront product page when known. */
    items: Array<{ name: string; quantity: number; url?: string }>;
  };
  /** Absolute storefront link behind «Оформити знову»; absent → no button. */
  reorderUrl?: string;
}

/** The JSON-safe payload stored in a `MailOutbox` row: the params plus a recipient. */
export interface OrderPaymentExpiredMailPayload extends OrderPaymentExpiredParams {
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

const LEAD = 'оплату не отримано, тому замовлення скасовано, а товар повернуто в продаж.';

function renderItemsHtml(items: OrderPaymentExpiredParams['order']['items']): string {
  if (items.length === 0) return '';
  const rows = items
    .map((item) => {
      const name = escapeHtml(item.name);
      const label = item.url
        ? `<a href="${escapeHtml(item.url)}" style="color:#0f172a;">${name}</a>`
        : name;
      return `<li style="margin:4px 0;">${label} × ${item.quantity}</li>`;
    })
    .join('\n');
  return `<ul style="margin:16px 0 0;padding-left:20px;color:#334155;">\n${rows}\n</ul>`;
}

function renderHtml(params: OrderPaymentExpiredParams): string {
  const greetingName = params.customerName ? `, ${escapeHtml(params.customerName)}` : '';
  const button = params.reorderUrl
    ? `<p style="margin:24px 0 0;">
  <a href="${escapeHtml(params.reorderUrl)}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Оформити знову</a>
</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="margin:0 0 8px;font-size:22px;">Оплату не отримано${greetingName}</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Замовлення <strong>#${orderNumber(params.order.id)}</strong>: ${LEAD}
    </p>
    ${renderItemsHtml(params.order.items)}
    ${button}
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">
      Якщо ви вже оплатили, просто дайте відповідь на цей лист — ми розберемося.
    </p>
  </div>
</body>
</html>`;
}

function renderText(params: OrderPaymentExpiredParams): string {
  const greetingName = params.customerName ? `, ${params.customerName}` : '';
  const sections = [
    `Оплату не отримано${greetingName}`,
    `Замовлення #${orderNumber(params.order.id)}: ${LEAD}`,
  ];

  if (params.order.items.length > 0) {
    sections.push('', ...params.order.items.map((item) => `${item.name} × ${item.quantity}`));
  }
  if (params.reorderUrl) {
    sections.push('', `Оформити знову: ${params.reorderUrl}`);
  }

  sections.push('', 'Якщо ви вже оплатили, просто дайте відповідь на цей лист — ми розберемося.');
  return sections.join('\n');
}

/** Build the «оплату не отримано» email parts (subject, HTML, plain text). */
export function buildOrderPaymentExpiredEmail(params: OrderPaymentExpiredParams): MailTemplate {
  return {
    subject: `Замовлення #${orderNumber(params.order.id)} скасовано: оплату не отримано`,
    html: renderHtml(params),
    text: renderText(params),
  };
}
