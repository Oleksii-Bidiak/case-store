import { telegramChatKind } from './telegram-chat-kind';

describe('telegramChatKind', () => {
  it.each([
    ['42', 'PRIVATE'],
    ['7012345678', 'PRIVATE'],
    ['-4567', 'GROUP'],
    ['-1001234567890', 'GROUP'],
    ['-1009999999999999999', 'GROUP'],
  ])('%s → %s', (chatId, kind) => {
    expect(telegramChatKind(chatId)).toBe(kind);
  });
});
