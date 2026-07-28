/**
 * Pure order-confirmation email template builder.
 *
 * This module has **no NestJS or nodemailer imports** — it is a plain function
 * that maps order data to `{ subject, html, text }`. Keeping it pure makes it
 * trivially unit-testable (no DI container) and free of any transport concern.
 */

/**
 * Snapshotted shipping address as stored on the order. Mirrors `AddressDto`:
 * only firstName/lastName/address1/city/phone are guaranteed — orders created
 * through the API may lack the optional fields, and pre-TASK-229 outbox rows
 * may lack `country`, so the renderer must tolerate their absence (TASK-229).
 */
export interface OrderConfirmationAddress {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}

/** A single line of the confirmed order (prices already stringified). */
export interface OrderConfirmationItem {
  productName: string;
  quantity: number;
  price: string;
  lineTotal: string;
}

/** Plain data object consumed by {@link buildOrderConfirmationEmail}. */
export interface OrderConfirmationParams {
  customerName?: string;
  /**
   * Absolute link to the order's status page (TASK-338).
   *
   * Sent to GUEST buyers, for whom it is the only way back to their own order.
   * Rendered as a prominent button — a guest who loses this email has no other
   * route, so burying it in body text would be a support burden by design.
   */
  orderStatusUrl?: string;
  order: {
    id: string;
    createdAt: Date;
    items: OrderConfirmationItem[];
    subtotal: string;
    discount: string;
    shippingCost: string;
    tax: string;
    total: string;
    shippingAddress: OrderConfirmationAddress | null;
  };
}

/** The rendered email parts handed to the transport. */
export interface MailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Fully-serialized order-confirmation payload as stored in a `MailOutbox` row
 * (TASK-103). It is the same data {@link buildOrderConfirmationEmail} needs, but
 * JSON-safe: `createdAt` is an ISO string (not a `Date`) because the row is
 * persisted as a `Json` column and rendered later by the retry worker. The
 * recipient travels with the payload so the worker can dispatch without a
 * second lookup.
 */
export interface OrderConfirmationMailPayload {
  to: string;
  customerName?: string;
  /** Guest order-status link (TASK-338); absent on account orders. */
  orderStatusUrl?: string;
  order: Omit<OrderConfirmationParams['order'], 'createdAt'> & { createdAt: string };
}

const ORDER_NUMBER_LENGTH = 8;

/** Short, human-friendly order number — the first 8 chars of the id, uppercased. */
function orderNumber(id: string): string {
  return id.slice(0, ORDER_NUMBER_LENGTH).toUpperCase();
}

/** Escape the few characters that are unsafe in interpolated HTML text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value: string): string {
  return `${value} ₴`;
}

function fullName(address: OrderConfirmationAddress): string {
  return `${address.firstName} ${address.lastName}`.trim();
}

/** Multi-line plain-text rendering of an address. */
function addressLines(address: OrderConfirmationAddress): string[] {
  const lines = [fullName(address)];
  if (address.company) lines.push(address.company);
  lines.push(address.address1);
  if (address.address2) lines.push(address.address2);
  const cityLine = [address.city, address.state, address.postalCode].filter(Boolean).join(', ');
  lines.push(cityLine);
  // TASK-229: `country` is optional on the DTO — an unguarded push fed
  // `undefined` into escapeHtml and crashed the render (outbox row → FAILED).
  if (address.country) lines.push(address.country);
  if (address.phone) lines.push(address.phone);
  return lines;
}

function itemLabel(item: OrderConfirmationItem): string {
  return item.productName;
}

// ─── HTML rendering ──────────────────────────────────────────────────────────

function renderItemsHtml(items: OrderConfirmationItem[]): string {
  if (items.length === 0) {
    return '<tr><td colspan="3" style="padding:8px;color:#64748b;">Немає товарів.</td></tr>';
  }
  return items
    .map((item) => {
      const label = escapeHtml(itemLabel(item));
      return `<tr>
  <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${label}</td>
  <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
  <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatMoney(item.lineTotal)}</td>
</tr>`;
    })
    .join('\n');
}

function renderTotalsHtml(order: OrderConfirmationParams['order']): string {
  const row = (label: string, value: string, strong = false): string =>
    `<tr>
  <td style="padding:4px 8px;text-align:right;color:#475569;">${label}</td>
  <td style="padding:4px 8px;text-align:right;${strong ? 'font-weight:bold;font-size:16px;' : ''}">${formatMoney(value)}</td>
</tr>`;

  const rows = [row('Сума', order.subtotal)];
  if (parseFloat(order.discount) > 0) rows.push(row('Знижка', `-${order.discount}`));
  if (parseFloat(order.shippingCost) > 0) rows.push(row('Доставка', order.shippingCost));
  if (parseFloat(order.tax) > 0) rows.push(row('Податок', order.tax));
  rows.push(row('Разом', order.total, true));
  return rows.join('\n');
}

function renderAddressHtml(address: OrderConfirmationAddress | null): string {
  if (!address) return '';
  const lines = addressLines(address)
    .map((l) => escapeHtml(l))
    .join('<br />');
  return `<h3 style="margin:24px 0 8px;font-size:16px;">Адреса доставки</h3>
<p style="margin:0;color:#334155;line-height:1.5;">${lines}</p>`;
}

/**
 * The guest's way back to their own order (TASK-338).
 *
 * Rendered as a button rather than a line of body text because for a guest this
 * link is not a convenience — it is the only route that exists. `escapeHtml` is
 * applied to the URL for the same reason it is applied to everything else here:
 * the token is opaque and machine-generated, but "it can't contain a quote" is
 * exactly the assumption that ages badly.
 */
function renderStatusLinkHtml(orderStatusUrl?: string): string {
  if (!orderStatusUrl) return '';
  const href = escapeHtml(orderStatusUrl);
  return `<p style="margin:24px 0 0;text-align:center;">
  <a href="${href}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Переглянути статус замовлення</a>
</p>
<p style="margin:12px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
  Збережіть цей лист — це єдиний спосіб відкрити ваше замовлення без реєстрації.
</p>`;
}

function renderHtml(params: OrderConfirmationParams): string {
  const { order } = params;
  const greetingName = params.customerName ? ` ${escapeHtml(params.customerName)}` : '';

  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="margin:0 0 8px;font-size:22px;">Дякуємо за ваше замовлення${greetingName}!</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Ваше замовлення <strong>#${orderNumber(order.id)}</strong> отримано та обробляється.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead>
        <tr>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #cbd5e1;">Товар</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #cbd5e1;">Кіл.</th>
          <th style="padding:8px;text-align:right;border-bottom:2px solid #cbd5e1;">Разом</th>
        </tr>
      </thead>
      <tbody>
${renderItemsHtml(order.items)}
      </tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <tbody>
${renderTotalsHtml(order)}
      </tbody>
    </table>
    ${renderAddressHtml(order.shippingAddress)}
    ${renderStatusLinkHtml(params.orderStatusUrl)}
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">
      Якщо у вас є запитання щодо замовлення, просто дайте відповідь на цей лист.
    </p>
  </div>
</body>
</html>`;
}

// ─── Plain-text rendering ────────────────────────────────────────────────────

function renderItemsText(items: OrderConfirmationItem[]): string {
  if (items.length === 0) return 'Немає товарів.';
  return items
    .map((item) => `- ${itemLabel(item)} x${item.quantity} — ${formatMoney(item.lineTotal)}`)
    .join('\n');
}

function renderTotalsText(order: OrderConfirmationParams['order']): string {
  const lines = [`Сума: ${formatMoney(order.subtotal)}`];
  if (parseFloat(order.discount) > 0) lines.push(`Знижка: -${formatMoney(order.discount)}`);
  if (parseFloat(order.shippingCost) > 0)
    lines.push(`Доставка: ${formatMoney(order.shippingCost)}`);
  if (parseFloat(order.tax) > 0) lines.push(`Податок: ${formatMoney(order.tax)}`);
  lines.push(`Разом: ${formatMoney(order.total)}`);
  return lines.join('\n');
}

function renderText(params: OrderConfirmationParams): string {
  const { order } = params;
  const greetingName = params.customerName ? ` ${params.customerName}` : '';

  const sections = [
    `Дякуємо за ваше замовлення${greetingName}!`,
    `Ваше замовлення #${orderNumber(order.id)} отримано та обробляється.`,
    '',
    'Товари:',
    renderItemsText(order.items),
    '',
    renderTotalsText(order),
  ];

  if (order.shippingAddress) {
    sections.push('', 'Адреса доставки:', addressLines(order.shippingAddress).join('\n'));
  }

  // TASK-338: the guest's only route back. Present in the plain-text part too —
  // a buyer whose client strips HTML must not be the one person who loses it.
  if (params.orderStatusUrl) {
    sections.push(
      '',
      'Статус замовлення:',
      params.orderStatusUrl,
      'Збережіть цей лист — це єдиний спосіб відкрити ваше замовлення без реєстрації.',
    );
  }

  sections.push('', 'Якщо у вас є запитання щодо замовлення, просто дайте відповідь на цей лист.');
  return sections.join('\n');
}

/**
 * Build the order-confirmation email parts (subject, HTML, plain text) from a
 * plain order data object.
 */
export function buildOrderConfirmationEmail(params: OrderConfirmationParams): MailTemplate {
  return {
    subject: `Замовлення #${orderNumber(params.order.id)} підтверджено`,
    html: renderHtml(params),
    text: renderText(params),
  };
}
