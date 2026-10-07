import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationOutbox } from '@prisma/client';
import { adminUrl, storeUrl } from '../notification-links';
import {
  SHOP_CONTACT_MESSAGE_TYPE,
  SHOP_NEW_ORDER_TYPE,
  SHOP_RETURN_REQUESTED_TYPE,
} from '../shop-notification.types';
import {
  CUSTOMER_ORDER_CONFIRMATION_TYPE,
  CUSTOMER_ORDER_SHIPPED_TYPE,
} from '../customer-notification.types';
import { renderShopNewOrder } from './templates/shop-new-order';
import { renderShopContactMessage } from './templates/shop-contact-message';
import { renderShopReturnRequested } from './templates/shop-return-requested';
import { renderOrderConfirmation } from './templates/order-confirmation';
import { renderOrderShipped } from './templates/order-shipped';

/**
 * What a renderer may ask of the running app at RENDER time (TASK-677).
 *
 * `adminUrl` is resolved when the row is sent, not when it is queued, so a row
 * written before `STORE_ADMIN_URL` was set still gets a working link once it
 * is. `null` → no origin configured: the renderer drops the link line rather
 * than print a link to nowhere.
 *
 * `storeUrl` is the same for the storefront (`STORE_CLIENT_URL`, TASK-680) — the
 * customer's messages link to the public order-status page.
 */
export interface TelegramRenderContext {
  adminUrl(path: string): string | null;
  storeUrl(path: string): string | null;
}

/**
 * Turns one outbox row into the text of a Telegram message (HTML parse mode).
 *
 * Interpolate every person-supplied value through `escapeHtml`
 * (`./telegram-html`), and keep the result short — Telegram rejects a message
 * over 4096 characters with a 400, which the outbox treats as permanent.
 */
export type TelegramRenderer = (row: NotificationOutbox, context: TelegramRenderContext) => string;

/**
 * The renderers shipped with the code, keyed by `NotificationOutbox.type` — one
 * entry per `type`, the same `type` strings the email side uses where an event
 * exists on both channels (`type` says what happened, `channel` says where;
 * plan 187, TASK-672). TASK-677: the shop's three pings. TASK-680: the buyer's
 * confirmation and «відправлено», under the e-mail's own type strings.
 */
export const DEFAULT_TELEGRAM_RENDERERS: Readonly<Record<string, TelegramRenderer>> = {
  [SHOP_NEW_ORDER_TYPE]: renderShopNewOrder,
  [SHOP_CONTACT_MESSAGE_TYPE]: renderShopContactMessage,
  [SHOP_RETURN_REQUESTED_TYPE]: renderShopReturnRequested,
  [CUSTOMER_ORDER_CONFIRMATION_TYPE]: renderOrderConfirmation,
  [CUSTOMER_ORDER_SHIPPED_TYPE]: renderOrderShipped,
};

/**
 * TelegramRendererRegistry — `type` → renderer for the TELEGRAM channel (TASK-674).
 *
 * Seeded from {@link DEFAULT_TELEGRAM_RENDERERS}; {@link register} exists for
 * specs (and for a module that wants to own its renderer). An unknown `type`
 * throws a plain `Error` — the dispatcher treats that as transient, so the row
 * is retried and visible via `lastError` rather than silently lost, exactly
 * like the email adapter's `default:` branch.
 */
@Injectable()
export class TelegramRendererRegistry {
  private readonly renderers = new Map<string, TelegramRenderer>(
    Object.entries(DEFAULT_TELEGRAM_RENDERERS),
  );

  private readonly context: TelegramRenderContext;

  constructor(config: ConfigService) {
    this.context = {
      adminUrl: (path) => adminUrl(config, path),
      storeUrl: (path) => storeUrl(config, path),
    };
  }

  register(type: string, renderer: TelegramRenderer): void {
    if (this.renderers.has(type)) {
      // Two renderers for one type would make the message depend on module order.
      throw new Error(`Duplicate Telegram renderer for type: ${type}`);
    }
    this.renderers.set(type, renderer);
  }

  has(type: string): boolean {
    return this.renderers.has(type);
  }

  render(row: NotificationOutbox): string {
    const renderer = this.renderers.get(row.type);
    if (!renderer) {
      throw new Error(`Unknown Telegram outbox type: ${row.type}`);
    }
    return renderer(row, this.context);
  }
}
