/** What a connected chat is — the admin «Сповіщення» screen shows «Особистий чат» vs «Група». */
export const TELEGRAM_CHAT_KINDS = ['PRIVATE', 'GROUP'] as const;
export type TelegramChatKind = (typeof TELEGRAM_CHAT_KINDS)[number];

/**
 * Tell a private chat from a group by its id alone (TASK-676). Telegram gives a
 * private chat the user's own id, which is positive; a basic group's id is
 * negative and a supergroup's is negative with the `-100` prefix. Channels are
 * negative too, but a bot is never connected to one through the start links.
 *
 * Read from the stored string, not `Number()`: supergroup ids exceed 2^53 in
 * principle, and the sign is all that matters.
 */
export function telegramChatKind(chatId: string): TelegramChatKind {
  return chatId.trim().startsWith('-') ? 'GROUP' : 'PRIVATE';
}
