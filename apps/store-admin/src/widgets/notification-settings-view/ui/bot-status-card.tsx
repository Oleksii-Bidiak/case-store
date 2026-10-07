import { BellIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import {
  TelegramChannelStateValue,
  type TelegramChannelStatusDto,
} from "@/entities/notification";
import { dict } from "@/shared/config";
import { cn, type DateInput } from "@/shared/lib";
import { Badge } from "@/shared/ui";
import { checkedWhen } from "../model/chat-labels";

interface BotStatusCardProps {
  channel: TelegramChannelStatusDto;
  /** When the status was fetched — the «сьогодні» reference. */
  fetchedAt: DateInput;
}

/**
 * «Telegram-бот магазину» (ДН-7.1 / 7.10 / 7.11) — the channel's state in
 * words. Plan 187's first constraint is the reason this card exists: a channel
 * that is not configured or not answering must SAY so here, not look like a
 * quiet shop. The failure keeps Telegram's own words in a mono box — they are
 * for the developer, and paraphrasing them would lose the one useful detail.
 */
export function BotStatusCard({ channel, fetchedAt }: BotStatusCardProps) {
  const t = dict.notificationSettings;
  const when = checkedWhen(channel.checkedAt, fetchedAt);

  const view = (() => {
    switch (channel.state) {
      case TelegramChannelStateValue.ok:
        return {
          badge: t.stateOk,
          badgeVariant: "success" as const,
          chip: "bg-success/14 text-success",
          Icon: CircleCheckIcon,
          title: channel.botUsername
            ? t.okTitle(channel.botUsername)
            : t.stateOk,
          text: when ? t.okText(when) : null,
        };
      case TelegramChannelStateValue.failed:
        return {
          badge: t.stateFailed,
          badgeVariant: "destructive" as const,
          chip: "bg-destructive/12 text-destructive",
          Icon: CircleXIcon,
          title: t.failedTitle,
          text: t.failedText(when),
        };
      default:
        return {
          badge: t.stateUnconfigured,
          badgeVariant: "secondary" as const,
          chip: "bg-muted text-muted-foreground",
          Icon: BellIcon,
          title: t.unconfiguredTitle,
          text: t.unconfiguredText,
        };
    }
  })();

  return (
    <section
      aria-labelledby="notification-bot-title"
      data-state={channel.state}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="notification-bot-title"
          className="text-sm font-semibold text-foreground"
        >
          {t.botTitle}
        </h3>
        <Badge variant={view.badgeVariant}>{view.badge}</Badge>
      </div>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
            view.chip,
          )}
        >
          <view.Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-base font-semibold text-foreground">
            {view.title}
          </p>
          {view.text ? (
            <p className="text-sm text-muted-foreground">{view.text}</p>
          ) : null}
          {channel.state === TelegramChannelStateValue.failed &&
          channel.reason ? (
            <p className="mt-1.5 rounded-sm bg-muted px-2 py-1.5 font-mono text-xs break-all text-foreground">
              <span className="sr-only">{t.failedReasonLabel}: </span>
              {channel.reason}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
