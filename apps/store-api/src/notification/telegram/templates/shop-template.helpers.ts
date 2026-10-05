import type { NotificationOutbox } from '@prisma/client';
import { escapeHtml } from '../telegram-html';
import type { TelegramRenderContext } from '../telegram-renderers';

/**
 * Shared pieces of the shop's Telegram pings (TASK-677).
 *
 * A row's payload is JSON written by an older or newer build than the one
 * rendering it, so every read here is defensive: a missing or mistyped field
 * reads as `null` and the line that needed it is left out, never `undefined`
 * printed into the owner's chat.
 */

/** The payload as a plain object — `{}` for anything else. */
export function payloadOf(row: NotificationOutbox): Record<string, unknown> {
  const payload = row.payload;
  return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

/** A non-blank string field (trimmed), or null. */
export function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A finite number field, or null. */
export function count(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * How the owner reads `PaymentMethod` — lower-case, it sits after «Оплата:».
 * Same meaning as the admin's labels; «післяплата» is the owner's own word.
 */
const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  ON_DELIVERY: 'післяплата',
  ONLINE: 'картка онлайн',
  INSTALLMENTS: 'оплата частинами',
};

/** How the owner reads `DeliveryMethod`, after «Доставка:». */
const DELIVERY_METHOD_LABELS: Readonly<Record<string, string>> = {
  NOVA_POSHTA: 'Нова Пошта',
  PICKUP: 'самовивіз',
  COURIER: 'курʼєр',
  OTHER: 'інший спосіб',
};

/** Escaped label; an enum value this build does not know is shown as is. */
export function paymentMethodLabel(value: string): string {
  return escapeHtml(PAYMENT_METHOD_LABELS[value] ?? value);
}

/** Escaped label; an enum value this build does not know is shown as is. */
export function deliveryMethodLabel(value: string): string {
  return escapeHtml(DELIVERY_METHOD_LABELS[value] ?? value);
}

/**
 * The «Відкрити в адмінці» line, or null when `STORE_ADMIN_URL` is not set —
 * the caller drops the line instead of printing a link to nowhere.
 */
export function adminLinkLine(context: TelegramRenderContext, path: string): string | null {
  const url = context.adminUrl(path);
  return url ? `<a href="${escapeHtml(url)}">Відкрити в адмінці</a>` : null;
}

type Fragment = string | null | undefined | false;

const isPresent = (part: Fragment): part is string => typeof part === 'string' && part !== '';

/** Join the lines that exist; a missing one is skipped. */
export function lines(...parts: Fragment[]): string {
  return parts.filter(isPresent).join('\n');
}

/** Join the fragments of one line with « · », or null when none exists. */
export function joinDot(...parts: Fragment[]): string | null {
  const present = parts.filter(isPresent);
  return present.length > 0 ? present.join(' · ') : null;
}
