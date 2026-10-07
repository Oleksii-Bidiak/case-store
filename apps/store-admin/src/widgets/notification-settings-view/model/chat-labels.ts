import {
  TelegramChatKind,
  type NotificationBindingUserDto,
  type TelegramShopBindingDto,
  type TelegramTestResultDto,
} from "@/entities/notification";
import { dict } from "@/shared/config";
import { formatDate, formatTime, type DateInput } from "@/shared/lib";

const t = dict.notificationSettings;

/** The chat's own name, or what kind of chat it is when Telegram gave none. */
export function chatLabel(binding: TelegramShopBindingDto): string {
  const label = binding.label?.trim();
  if (label) return label;
  return binding.kind === TelegramChatKind.GROUP ? t.kindGroup : t.kindPrivate;
}

/** «Особистий чат» / «Група». */
export function chatKindLabel(binding: TelegramShopBindingDto): string {
  return binding.kind === TelegramChatKind.GROUP ? t.kindGroup : t.kindPrivate;
}

/**
 * «Олексій Б.» — first name and the initial of the last, the way the artboards
 * name a colleague. Falls back to whatever exists, then to the e-mail.
 */
export function personShortName(user: NotificationBindingUserDto): string {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first && last) return `${first} ${last.charAt(0)}.`;
  return first || last || user.email;
}

/** «Особистий чат · підключено: Олексій Б., 01.10.2026». */
export function chatMeta(binding: TelegramShopBindingDto): string {
  return t.chatMeta(
    chatKindLabel(binding),
    formatDate(binding.createdAt),
    binding.connectedBy ? personShortName(binding.connectedBy) : null,
  );
}

/**
 * «сьогодні о 09:40» / «05.10.2026 о 09:40», in Kyiv time. `now` is the
 * moment the status was fetched, so the render stays pure. `null` for a check
 * that never ran — the API reports that as the epoch.
 */
export function checkedWhen(
  checkedAt: string | undefined,
  now: DateInput,
): string | null {
  if (!checkedAt) return null;
  const at = new Date(checkedAt);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= 0) return null;
  const time = formatTime(at);
  return formatDate(at) === formatDate(now)
    ? t.checkedToday(time)
    : t.checkedOn(formatDate(at), time);
}

/** One delivered/failed line under a chat after «Надіслати тестове». */
export function testResultText(result: TelegramTestResultDto): string {
  if (result.ok) return t.testDelivered;
  const reason = result.error?.trim() || t.testUnknownReason;
  return result.revoked ? t.testRevoked(reason) : t.testFailed(reason);
}

/** What to do about one chat the test did not reach (ДН-7.7 summary box). */
export function testAdvice(
  result: TelegramTestResultDto,
  binding: Pick<TelegramShopBindingDto, "kind" | "label">,
  label: string,
): string {
  const reason = result.error?.trim() || t.testUnknownReason;
  if (result.revoked) return t.testRevokedHint(label, reason);
  return binding.kind === TelegramChatKind.GROUP
    ? t.testFailedGroupHint(label, reason)
    : t.testFailedPrivateHint(label, reason);
}
