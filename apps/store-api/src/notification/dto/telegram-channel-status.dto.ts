import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Channel states, as {@link TelegramChannelState} names them. */
export const TELEGRAM_CHANNEL_STATES = ['unconfigured', 'failed', 'ok'] as const;
export type TelegramChannelStateValue = (typeof TELEGRAM_CHANNEL_STATES)[number];

/** The account that connected a chat (TASK-675). */
export class NotificationBindingUserDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'owner@example.com' })
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Олена' })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Коваль' })
  lastName!: string | null;
}

/** One connected shop chat (TASK-675). */
export class TelegramShopBindingDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiPropertyOptional({
    description:
      'Chat title, or @username / first name for a private chat, as it was when connected',
    example: 'Магазин — замовлення',
  })
  label?: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-01T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({
    type: NotificationBindingUserDto,
    description: 'Who connected the chat (audit only); absent when that account no longer exists',
  })
  connectedBy?: NotificationBindingUserDto;
}

/**
 * State of the owner-notification Telegram channel (TASK-674) and the shop chats
 * connected to it (TASK-675) — the admin «Сповіщення» screen of TASK-676 shows
 * both from one request.
 */
export class TelegramChannelStatusDto {
  @ApiProperty({
    enum: TELEGRAM_CHANNEL_STATES,
    enumName: 'TelegramChannelStateValue',
    description:
      '`unconfigured` — TELEGRAM_BOT_TOKEN is not set; `failed` — a token is set but the last ' +
      'getMe did not succeed (see `reason`); `ok` — the bot answered (see `botUsername`)',
    example: 'ok',
  })
  state!: TelegramChannelStateValue;

  @ApiPropertyOptional({
    description: 'Bot username without the @, present when `state` is `ok`',
    example: 'casestore_bot',
  })
  botUsername?: string;

  @ApiPropertyOptional({
    description: "Telegram's own failure description, present when `state` is `failed`",
    example: 'Telegram getMe failed (401): Unauthorized',
  })
  reason?: string;

  @ApiPropertyOptional({
    description: 'When the state was last established by a getMe call (absent for `unconfigured`)',
    example: '2026-10-01T12:00:00.000Z',
    format: 'date-time',
  })
  checkedAt?: string;

  @ApiProperty({
    type: [TelegramShopBindingDto],
    description:
      'Active shop chats, oldest first. Every one of them receives every shop notification. ' +
      'Listed whatever the channel state — a chat stays connected while the bot is down.',
  })
  bindings!: TelegramShopBindingDto[];
}

export class TelegramChannelStatusResponse {
  @ApiProperty({ type: TelegramChannelStatusDto })
  data!: TelegramChannelStatusDto;
}

/** A fresh one-time connect link (TASK-675). */
export class TelegramConnectLinkDto {
  @ApiProperty({
    description:
      'Open on the phone and press «Старт»: the PRIVATE chat with the bot is connected. ' +
      'One-time; expires at `expiresAt`.',
    example: 'https://t.me/casestore_bot?start=Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4cXV1eHF1dXg',
  })
  deepLink!: string;

  @ApiProperty({
    description:
      'Same token, but Telegram asks which GROUP to add the bot to, and that group is connected ' +
      'instead. Use one link or the other — the token works once.',
    example: 'https://t.me/casestore_bot?startgroup=Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4cXV1eHF1dXg',
  })
  groupDeepLink!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-01T12:15:00.000Z' })
  expiresAt!: string;
}

export class TelegramConnectLinkResponse {
  @ApiProperty({ type: TelegramConnectLinkDto })
  data!: TelegramConnectLinkDto;
}

/** Outcome of the test message for one connected chat (TASK-675). */
export class TelegramTestResultDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  bindingId!: string;

  @ApiProperty({ description: 'Telegram accepted the message', example: true })
  ok!: boolean;

  @ApiPropertyOptional({
    description: "Telegram's own description of the failure, when `ok` is false",
    example: 'Telegram sendMessage failed (403): Forbidden: bot was blocked by the user',
  })
  error?: string;

  @ApiPropertyOptional({
    description:
      'True when Telegram said the chat is gone for good (bot blocked or removed, chat deleted) ' +
      'and the chat was disconnected',
    example: false,
  })
  revoked?: boolean;
}

export class TelegramTestResultsDto {
  @ApiProperty({ type: [TelegramTestResultDto] })
  results!: TelegramTestResultDto[];
}

export class TelegramTestResponse {
  @ApiProperty({ type: TelegramTestResultsDto })
  data!: TelegramTestResultsDto;
}
