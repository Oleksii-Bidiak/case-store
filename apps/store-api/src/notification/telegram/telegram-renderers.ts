import { Injectable } from '@nestjs/common';
import type { NotificationOutbox } from '@prisma/client';

/**
 * Turns one outbox row into the text of a Telegram message (HTML parse mode).
 *
 * Interpolate every person-supplied value through `escapeHtml`
 * (`./telegram-html`), and keep the result short — Telegram rejects a message
 * over 4096 characters with a 400, which the outbox treats as permanent.
 */
export type TelegramRenderer = (row: NotificationOutbox) => string;

/**
 * The renderers shipped with the code, keyed by `NotificationOutbox.type`.
 *
 * Empty on purpose in TASK-674: the client, the channel state and the adapter
 * land first, and no code path enqueues a TELEGRAM row yet. TASK-677 adds the
 * three shop events here — one entry per `type`, the same `type` strings the
 * email side uses where an event exists on both channels (`type` says what
 * happened, `channel` says where; plan 187, TASK-672).
 */
export const DEFAULT_TELEGRAM_RENDERERS: Readonly<Record<string, TelegramRenderer>> = {};

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
    return renderer(row);
  }
}
