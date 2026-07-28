/**
 * Pure "your order has shipped" email template builder (TASK-335).
 *
 * Same shape and same discipline as `order-confirmation.template.ts`: no NestJS,
 * no nodemailer, no config — a plain function from data to
 * `{ subject, html, text }`, so it is unit-testable without a DI container.
 *
 * Why this letter exists at all: until now a parcel left the warehouse and the
 * customer learned about it by refreshing the site, if they thought to. The
 * waybill number (ТТН) is typed in by the operator — Nova Poshta's
 * `InternetDocument/save` needs a counterparty in the client's own NP account, so
 * the system does not create waybills — but the number still belongs in the
 * customer's hands the moment it exists.
 */

/** The rendered email parts handed to the transport. */
export interface MailTemplate {
  subject: string;
  html: string;
  text: string;
}

/** Plain data object consumed by {@link buildOrderShippedEmail}. */
export interface OrderShippedParams {
  customerName?: string;
  order: {
    id: string;
    /**
     * Nova Poshta waybill. Optional because a parcel can ship by other means, or
     * be marked shipped before the courier hands the number over — and a customer
     * told "your order is on its way" with no number is still better served than
     * one told nothing.
     */
    trackingNumber?: string | null;
  };
  /** Absolute link to the order's status page; present for guest orders. */
  orderStatusUrl?: string;
}

/**
 * Fully-serialized shipped-notice payload as stored in a `MailOutbox` row. Already
 * JSON-safe (no `Date` fields), so it is the params object plus a recipient.
 */
export interface OrderShippedMailPayload extends OrderShippedParams {
  to: string;
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

/**
 * Public Nova Poshta tracking page for a waybill.
 *
 * A bare number is something the customer has to copy, find the right site for,
 * and paste. A link is one tap. NP's public tracking page takes the number as a
 * query parameter and needs no API key — which is also true of the
 * `TrackingDocument/getStatusDocuments` API, should in-app tracking follow later.
 */
function trackingUrl(trackingNumber: string): string {
  return `https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(trackingNumber)}`;
}

function renderTrackingHtml(trackingNumber?: string | null): string {
  if (!trackingNumber) return '';
  const safe = escapeHtml(trackingNumber);
  return `<p style="margin:16px 0 0;color:#334155;">
  Номер накладної: <strong>${safe}</strong>
</p>
<p style="margin:16px 0 0;">
  <a href="${escapeHtml(trackingUrl(trackingNumber))}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Відстежити посилку</a>
</p>`;
}

function renderStatusLinkHtml(orderStatusUrl?: string): string {
  if (!orderStatusUrl) return '';
  return `<p style="margin:16px 0 0;">
  <a href="${escapeHtml(orderStatusUrl)}" style="color:#0f172a;">Переглянути замовлення</a>
</p>`;
}

function renderHtml(params: OrderShippedParams): string {
  const greetingName = params.customerName ? ` ${escapeHtml(params.customerName)}` : '';

  return `<!DOCTYPE html>
<html lang="uk">
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="margin:0 0 8px;font-size:22px;">Ваше замовлення відправлено${greetingName}!</h1>
    <p style="margin:0 0 16px;color:#475569;">
      Замовлення <strong>#${orderNumber(params.order.id)}</strong> передано перевізнику.
    </p>
    ${renderTrackingHtml(params.order.trackingNumber)}
    ${renderStatusLinkHtml(params.orderStatusUrl)}
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">
      Якщо у вас є запитання щодо доставки, просто дайте відповідь на цей лист.
    </p>
  </div>
</body>
</html>`;
}

function renderText(params: OrderShippedParams): string {
  const greetingName = params.customerName ? ` ${params.customerName}` : '';

  const sections = [
    `Ваше замовлення відправлено${greetingName}!`,
    `Замовлення #${orderNumber(params.order.id)} передано перевізнику.`,
  ];

  if (params.order.trackingNumber) {
    sections.push(
      '',
      `Номер накладної: ${params.order.trackingNumber}`,
      `Відстежити: ${trackingUrl(params.order.trackingNumber)}`,
    );
  }

  if (params.orderStatusUrl) {
    sections.push('', `Переглянути замовлення: ${params.orderStatusUrl}`);
  }

  sections.push('', 'Якщо у вас є запитання щодо доставки, просто дайте відповідь на цей лист.');
  return sections.join('\n');
}

/**
 * Build the shipped-notice email parts (subject, HTML, plain text).
 */
export function buildOrderShippedEmail(params: OrderShippedParams): MailTemplate {
  return {
    subject: `Замовлення #${orderNumber(params.order.id)} відправлено`,
    html: renderHtml(params),
    text: renderText(params),
  };
}
