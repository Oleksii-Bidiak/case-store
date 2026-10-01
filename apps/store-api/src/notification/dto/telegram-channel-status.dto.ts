import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Channel states, as {@link TelegramChannelState} names them. */
export const TELEGRAM_CHANNEL_STATES = ['unconfigured', 'failed', 'ok'] as const;
export type TelegramChannelStateValue = (typeof TELEGRAM_CHANNEL_STATES)[number];

/**
 * State of the owner-notification Telegram channel (TASK-674).
 *
 * Extension point: TASK-675 adds the list of bound chats to this DTO (the
 * admin «Сповіщення» screen of TASK-676 shows both from one request).
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
}

export class TelegramChannelStatusResponse {
  @ApiProperty({ type: TelegramChannelStatusDto })
  data!: TelegramChannelStatusDto;
}
