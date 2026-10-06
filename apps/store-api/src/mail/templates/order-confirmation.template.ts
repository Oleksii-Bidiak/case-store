/**
 * Pure order-confirmation email template builder.
 *
 * This module has **no NestJS or nodemailer imports** — it is a plain function
 * that maps order data to `{ subject, html, text }`. Keeping it pure makes it
 * trivially unit-testable (no DI container) and free of any transport concern.
 */
import type { DeliveryMethod } from '@prisma/client';

/**
 * Snapshotted shipping address as stored on the order. Mirrors `AddressDto`:
 * only firstName/lastName/address1/city/phone are guaranteed — orders created
 * through the API may lack the optional fields, and pre-TASK-229 outbox rows
 * may lack `country`, so the renderer must tolerate their absence (TASK-229).
 *
 * The delivery snapshot fields (TASK-643, TASK-647) are all optional too: outbox
 * rows written before them carry none, NP orders carry no pickup fields, and
 * pickup orders no `np*` fields.
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
  npCityRef?: string;
  npWarehouseRef?: string;
  npWarehouseName?: string;
  deliveryMethod?: DeliveryMethod;
  carrier?: string | null;
  /** True for OTHER: the booked 0 is a placeholder the operator will replace. */
  shippingCostPending?: boolean;
  pickupPointName?: string | null;
  pickupPointAddress?: string | null;
  pickupPointHours?: string | null;
  pickupPointPhone?: string | null;
  pickupPointMapUrl?: string | null;
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
  /**
   * Absolute link to the storefront's public "check my order" form (TASK-483).
   *
   * Sent to EVERY buyer, guest or account holder, and it is the half of this
   * letter that survives the letter. `orderStatusUrl` above carries a token: it
   * is gone the moment the mail is deleted, filed in spam, or typed to the wrong
   * address. This one is an ordinary page that asks for the order number and the
   * phone — so the letter also teaches the way back that does not depend on the
   * letter (owner's decision B-5).
   */
  orderLookupUrl?: string;
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
    /**
     * The order-level delivery method (TASK-647). Optional so outbox rows queued
     * before it still render — see {@link resolveDeliveryMethod} for the
     * fallback chain.
     */
    deliveryMethod?: DeliveryMethod;
  };
}

/** The rendered email parts handed to the transport. */
export interface MailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Fully-serialized order-confirmation payload as stored in a `NotificationOutbox` row
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
  /** Public "check my order" form (TASK-483); sent to every buyer. */
  orderLookupUrl?: string;
  order: Omit<OrderConfirmationParams['order'], 'createdAt'> & { createdAt: string };
}

const ORDER_NUMBER_LENGTH = 8;

/** Short, human-friendly order number — the first 8 chars of the id, uppercased. */
export function orderNumber(id: string): string {
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
 * Money the way the storefront and the admin panel render it (TASK-801):
 * uk-UA grouping, comma decimals, trailing zeros dropped, a literal "₴" —
 * `1299.00` → "1 299 ₴", `29.99` → "29,99 ₴". The e-mail used to print the raw
 * Decimal string, so a customer read `1 299 ₴` on the site and `1299.00 ₴` in
 * the letter about the same order.
 *
 * Twin of `formatMoney` (store-client) and `formatCurrency` (store-admin) — no
 * shared package between the apps, so the rule is copied and each copy is pinned
 * by an exact-string test. The sign is appended by hand, never
 * `style: "currency"`: ICU renders UAH as «грн» on Node and «₴» in browsers.
 */
const MONEY_FORMAT = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${MONEY_FORMAT.format(amount)} ₴` : `${value} ₴`;
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
  // TASK-647: the shop delivers within Ukraine only and the server defaults the
  // country to UA (TASK-229), so «UA» on its own line says nothing the buyer
  // needs — the approved mockup has no country line. Any other value is kept.
  if (address.country && address.country !== 'UA') lines.push(address.country);
  if (address.phone) lines.push(address.phone);
  return lines;
}

function itemLabel(item: OrderConfirmationItem): string {
  return item.productName;
}

// ─── Delivery (TASK-647) ─────────────────────────────────────────────────────

/**
 * How the order ships, for the letter.
 *
 * 1. `order.deliveryMethod` — the order column, set by `MailService` from the
 *    entity;
 * 2. `shippingAddress.deliveryMethod` — the checkout snapshot (TASK-643), for an
 *    outbox row queued before (1) was put into the payload;
 * 3. inferred — an NP ref in the snapshot means Nova Poshta, anything else is
 *    OTHER. The same rule the TASK-642 migration used to backfill the column,
 *    so a pre-delivery-methods outbox row renders the way its order now reads.
 */
export function resolveDeliveryMethod(order: OrderConfirmationParams['order']): DeliveryMethod {
  const address = order.shippingAddress;
  if (order.deliveryMethod) return order.deliveryMethod;
  if (address?.deliveryMethod) return address.deliveryMethod;
  return address?.npWarehouseRef || address?.npCityRef ? 'NOVA_POSHTA' : 'OTHER';
}

/**
 * The three ways the «Доставка» total can read. It is ALWAYS rendered: when it
 * was skipped at 0, an OTHER order's «Разом» read as final although the
 * operator had yet to add the delivery (B-6 §4).
 *
 * - `amount` — a real, booked cost;
 * - `pending` — the 0 is a placeholder: the snapshot says so, or the order is
 *   OTHER (a backfilled pre-TASK-643 order carries no flag). A non-zero cost
 *   wins over the flag: once there is an amount, it has been quoted;
 * - `free` — 0 and final (pickup, courier over the free threshold).
 */
type ShippingCostKind = 'amount' | 'pending' | 'free';

function shippingCostKind(
  order: OrderConfirmationParams['order'],
  method: DeliveryMethod,
): ShippingCostKind {
  if (parseFloat(order.shippingCost) > 0) return 'amount';
  if (order.shippingAddress?.shippingCostPending === true || method === 'OTHER') return 'pending';
  return 'free';
}

const PENDING_TOTAL_NOTE = 'Без доставки — її вартість уточнить оператор, коли зателефонує.';
const PICKUP_NOTE =
  'Зателефонуємо, коли замовлення буде готове до видачі. Візьміть із собою номер замовлення.';
const OTHER_NOTE =
  'Вартість доставки уточнить оператор, коли зателефонує підтвердити замовлення. Її додадуть до суми при отриманні.';

/** The «Доставка» block, as plain strings — escaped by the HTML renderer. */
interface DeliveryBlock {
  /** Static part of the bold method line. */
  method: string;
  /** Dynamic part after « · » (the pickup point name), if any. */
  methodDetail?: string;
  lines: string[];
  mapUrl?: string;
  note?: string;
}

/**
 * Only an http(s) link becomes an `href` / a «Мапа:» line. The URL is typed by
 * the shop owner, not the buyer, but `javascript:` in a mail link is not a risk
 * worth reasoning about.
 */
function safeMapUrl(url: string | null | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

function deliveryBlock(address: OrderConfirmationAddress, method: DeliveryMethod): DeliveryBlock {
  switch (method) {
    case 'NOVA_POSHTA': {
      const lines = [fullName(address), address.npWarehouseName || address.address1, address.city];
      if (address.phone) lines.push(address.phone);
      return { method: 'Нова Пошта', lines: lines.filter(Boolean) };
    }
    case 'PICKUP': {
      // The point's own address. `city` already carries the point's city
      // (TASK-643 overwrites it), so prefix it unless the address already
      // starts with it — «Київ, вул. Хрещатик, 22».
      const street = address.pickupPointAddress || address.address1;
      const where =
        address.city && !street.startsWith(address.city) ? `${address.city}, ${street}` : street;
      const recipient = [fullName(address), address.phone].filter(Boolean).join(', ');
      const lines = [where, address.pickupPointHours, address.pickupPointPhone].filter(
        (line): line is string => Boolean(line),
      );
      lines.push(`Отримувач: ${recipient}`);
      return {
        method: 'Самовивіз',
        methodDetail: address.pickupPointName || undefined,
        lines,
        mapUrl: safeMapUrl(address.pickupPointMapUrl),
        note: PICKUP_NOTE,
      };
    }
    case 'COURIER':
      // The mockup reads «Кур'єр по Києву» — the city in the locative case.
      // Declining arbitrary Ukrainian city names is not something to do with a
      // suffix rule, so the line is just «Кур'єр» and the city follows below.
      return { method: "Кур'єр", lines: addressLines(address) };
    case 'OTHER':
    default:
      return { method: 'Інша доставка', lines: addressLines(address), note: OTHER_NOTE };
  }
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
  const cell = (valueHtml: string, style = ''): string =>
    `<td style="padding:4px 8px;text-align:right;${style}">${valueHtml}</td>`;
  const row = (label: string, valueHtml: string, style = ''): string =>
    `<tr>
  <td style="padding:4px 8px;text-align:right;color:#475569;">${label}</td>
  ${cell(valueHtml, style)}
</tr>`;

  const kind = shippingCostKind(order, resolveDeliveryMethod(order));
  const shipping =
    kind === 'amount'
      ? row('Доставка', formatMoney(order.shippingCost))
      : kind === 'free'
        ? row('Доставка', 'Безкоштовно', 'color:#15803d;font-weight:bold;')
        : row('Доставка', 'уточнить оператор', 'color:#64748b;font-style:italic;');

  const rows = [row('Сума', formatMoney(order.subtotal))];
  if (parseFloat(order.discount) > 0) rows.push(row('Знижка', formatMoney(`-${order.discount}`)));
  rows.push(shipping);
  if (parseFloat(order.tax) > 0) rows.push(row('Податок', formatMoney(order.tax)));
  rows.push(row('Разом', formatMoney(order.total), 'font-weight:bold;font-size:16px;'));
  if (kind === 'pending') {
    rows.push(`<tr>
  <td colspan="2" style="padding:4px 8px;text-align:right;color:#64748b;font-size:13px;">${PENDING_TOTAL_NOTE}</td>
</tr>`);
  }
  return rows.join('\n');
}

/** The «Доставка» block (TASK-647) — replaces the old «Адреса доставки». */
function renderDeliveryHtml(order: OrderConfirmationParams['order']): string {
  const address = order.shippingAddress;
  if (!address) return '';
  const block = deliveryBlock(address, resolveDeliveryMethod(order));

  const methodHtml = block.methodDetail
    ? `${block.method} · ${escapeHtml(block.methodDetail)}`
    : block.method;
  const lines = block.lines.map((line) => escapeHtml(line)).join('<br />');
  const map = block.mapUrl
    ? `
  <p style="margin:6px 0 0;"><a href="${escapeHtml(block.mapUrl)}" style="color:#0f172a;">Як дістатися — відкрити на мапі</a></p>`
    : '';
  const note = block.note
    ? `
  <p style="margin:12px 0 0;padding:12px;border-radius:8px;background:#f1f5f9;color:#334155;font-size:14px;line-height:1.5;">${block.note}</p>`
    : '';

  return `<div style="margin-top:24px;">
  <h3 style="margin:0 0 8px;font-size:16px;">Доставка</h3>
  <p style="margin:0 0 4px;font-weight:bold;">${methodHtml}</p>
  <p style="margin:0;color:#334155;line-height:1.5;">${lines}</p>${map}${note}
</div>`;
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
function renderStatusLinkHtml(orderStatusUrl?: string, orderLookupUrl?: string): string {
  if (!orderStatusUrl) return '';
  const href = escapeHtml(orderStatusUrl);
  // TASK-483: the old line under the button read "це ЄДИНИЙ спосіб відкрити ваше
  // замовлення без реєстрації". That stopped being true the moment the public
  // lookup form shipped, and a letter that tells a worried customer their only
  // way in is gone — when it is not — is the most expensive kind of stale copy.
  const keepNote = orderLookupUrl
    ? 'Збережіть цей лист — за посиланням замовлення відкривається одразу, без номера й телефону.'
    : 'Збережіть цей лист — це єдиний спосіб відкрити ваше замовлення без реєстрації.';
  return `<p style="margin:24px 0 0;text-align:center;">
  <a href="${href}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Переглянути статус замовлення</a>
</p>
<p style="margin:12px 0 0;color:#94a3b8;font-size:13px;text-align:center;">
  ${keepNote}
</p>`;
}

/**
 * The way back that does not depend on this letter (TASK-483).
 *
 * Rendered for EVERY buyer, including account holders: the number + phone form
 * is also what someone reaches for when they cannot remember which address they
 * registered with. Deliberately a text link rather than a second button — the
 * token link above is the fast path, this is the fallback, and two equally loud
 * buttons would make the fast path slower for everybody.
 */
function renderLookupLinkHtml(orderLookupUrl?: string): string {
  if (!orderLookupUrl) return '';
  const href = escapeHtml(orderLookupUrl);
  return `<p style="margin:16px 0 0;color:#64748b;font-size:13px;text-align:center;">
  Загубили цей лист? Статус завжди можна перевірити за номером замовлення й телефоном:
  <a href="${href}" style="color:#0f172a;">${href}</a>
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
    ${renderDeliveryHtml(order)}
    ${renderStatusLinkHtml(params.orderStatusUrl, params.orderLookupUrl)}
    ${renderLookupLinkHtml(params.orderLookupUrl)}
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
  const kind = shippingCostKind(order, resolveDeliveryMethod(order));
  const shipping =
    kind === 'amount'
      ? formatMoney(order.shippingCost)
      : kind === 'free'
        ? 'Безкоштовно'
        : 'уточнить оператор';

  const lines = [`Сума: ${formatMoney(order.subtotal)}`];
  if (parseFloat(order.discount) > 0) lines.push(`Знижка: -${formatMoney(order.discount)}`);
  lines.push(`Доставка: ${shipping}`);
  if (parseFloat(order.tax) > 0) lines.push(`Податок: ${formatMoney(order.tax)}`);
  lines.push(`Разом: ${formatMoney(order.total)}`);
  if (kind === 'pending') lines.push(PENDING_TOTAL_NOTE);
  return lines.join('\n');
}

/** The «Доставка:» section of the plain-text part (TASK-647), mirroring the HTML. */
function renderDeliveryText(order: OrderConfirmationParams['order']): string[] {
  const address = order.shippingAddress;
  if (!address) return [];
  const block = deliveryBlock(address, resolveDeliveryMethod(order));
  const lines = [
    '',
    'Доставка:',
    block.methodDetail ? `${block.method} · ${block.methodDetail}` : block.method,
    ...block.lines,
  ];
  if (block.mapUrl) lines.push(`Мапа: ${block.mapUrl}`);
  if (block.note) lines.push(block.note);
  return lines;
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

  sections.push(...renderDeliveryText(order));

  // TASK-338: the guest's only route back. Present in the plain-text part too —
  // a buyer whose client strips HTML must not be the one person who loses it.
  if (params.orderStatusUrl) {
    sections.push(
      '',
      'Статус замовлення:',
      params.orderStatusUrl,
      params.orderLookupUrl
        ? 'Збережіть цей лист — за посиланням замовлення відкривається одразу, без номера й телефону.'
        : 'Збережіть цей лист — це єдиний спосіб відкрити ваше замовлення без реєстрації.',
    );
  }

  // TASK-483: the letter-independent route, in the plain-text part too — the
  // buyer whose client strips HTML is exactly the buyer most likely to lose the
  // link.
  if (params.orderLookupUrl) {
    sections.push(
      '',
      'Загубили цей лист? Статус завжди можна перевірити за номером замовлення й телефоном:',
      params.orderLookupUrl,
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
