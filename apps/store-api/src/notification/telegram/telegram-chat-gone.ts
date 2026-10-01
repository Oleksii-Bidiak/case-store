import { NotificationChannel } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import type { NotificationBindingService } from '../notification-binding.service';
import { TelegramApiError } from './telegram.client';

/**
 * Descriptions of a 400 that mean the CHAT is gone for good, not that this one
 * message was wrong. "message is too long" is also a 400 — it fails the row, but
 * the chat is fine and must stay bound.
 *
 * - "chat not found" — deleted chat, or a group the bot was never in;
 * - "group chat was upgraded to a supergroup chat" — the old id is dead for ever
 *   (the new one has a different id, and only a fresh `/start` can bind it).
 */
const CHAT_GONE_400 = /chat not found|group chat was upgraded/i;

/**
 * Does this Telegram error mean the recipient chat can never be delivered to
 * again? 403 (the bot was blocked by the user, or kicked from the group) always
 * does; a 400 only with one of the descriptions above. 401/404 are about the
 * TOKEN, not the chat, and are not matched here.
 */
export function isTelegramChatGone(err: unknown): err is TelegramApiError {
  if (!(err instanceof TelegramApiError) || err.kind !== 'permanent') return false;
  if (err.errorCode === 403) return true;
  return err.errorCode === 400 && CHAT_GONE_400.test(err.message);
}

/**
 * Revoke every binding of a chat Telegram says is gone, and say so at `error`
 * level — a revoked SHOP chat is an owner who has silently stopped getting
 * pings. Never throws: the caller's own failure handling (a FAILED outbox row, a
 * test-send result) must still happen if the database write does not.
 */
export async function revokeGoneTelegramChat(
  bindings: NotificationBindingService,
  logger: PinoLogger,
  chatId: string,
  err: TelegramApiError,
): Promise<boolean> {
  try {
    const revoked = await bindings.revokeByExternalId(NotificationChannel.TELEGRAM, chatId);
    logger.error(
      { event: 'telegram.binding.revoked', chatId, revoked, errorCode: err.errorCode },
      `Telegram chat ${chatId} is unreachable for good — its notification bindings were revoked: ${err.message}`,
    );
    return revoked > 0;
  } catch (revokeErr) {
    logger.error(
      { event: 'telegram.binding.revokeFailed', chatId, err: revokeErr },
      `Telegram chat ${chatId} is unreachable, but revoking its bindings failed`,
    );
    return false;
  }
}
