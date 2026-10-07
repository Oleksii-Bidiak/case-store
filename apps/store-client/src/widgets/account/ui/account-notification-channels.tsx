"use client";

import { Loader2, Lock, Mail, Send } from "lucide-react";
import {
  TelegramConnectButton,
  TelegramConnectPanel,
  useDisconnectMyTelegram,
  useTelegramConnect,
  type TelegramConnectController,
} from "@/features/telegram-connect";
import { Badge, Button, Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

interface AccountNotificationChannelsProps {
  /** The account's address — the channel the confirmation always goes to. */
  email: string;
  /** Override the poll cadence (tests). */
  pollIntervalMs?: number;
}

/**
 * «Куди надсилати сповіщення про замовлення» (TASK-679, Account.dc.html
 * #settings-telegram*). Two rows, and the order says the rule: the e-mail is
 * always on («Завжди», locked) and Telegram is added to it, never instead of
 * it. Every Telegram state says what it is — a bot the shop has not set up
 * reads «Тимчасово недоступно», a failed read says so — never a silent «off».
 *
 * Below `sm` the status and the actions wrap under the text instead of
 * squeezing it into a sliver beside them (the 390 mockup's defect).
 */
export function AccountNotificationChannels({
  email,
  pollIntervalMs,
}: AccountNotificationChannelsProps) {
  const t = dict.telegramNotifications.account;
  const connect = useTelegramConnect({ kind: "me" }, { pollIntervalMs });

  return (
    <section aria-labelledby="notify-channels-title">
      <h3
        id="notify-channels-title"
        className="text-sm font-semibold text-foreground"
      >
        {t.blockTitle}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t.blockSub}</p>

      <ul className="mt-3">
        <li className="flex items-start gap-3.5 border-t border-border py-3.5">
          <ChannelIcon>
            <Mail className="size-5" aria-hidden />
          </ChannelIcon>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t.mailTitle}
              </p>
              <p className="text-xs break-words text-muted-foreground">
                {t.mailSub(email)}
              </p>
            </div>
            <Badge variant="tint-muted" size="pill">
              <Lock aria-hidden />
              {t.mailAlways}
            </Badge>
          </div>
        </li>

        <li
          className="border-t border-border py-3.5"
          data-testid="telegram-channel-row"
          data-phase={connect.phase}
        >
          <TelegramRow connect={connect} />
          <TelegramConnectPanel connect={connect} className="mt-3" />
        </li>
      </ul>
    </section>
  );
}

function ChannelIcon({
  dimmed = false,
  children,
}: {
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-menu",
        dimmed
          ? "bg-muted text-muted-foreground"
          : "bg-primary/10 text-primary",
      )}
    >
      {children}
    </span>
  );
}

function TelegramRow({ connect }: { connect: TelegramConnectController }) {
  const t = dict.telegramNotifications.account;
  const disconnect = useDisconnectMyTelegram();
  const { phase, status } = connect;
  const dimmed = phase === "na" || phase === "error";

  let sub: React.ReactNode;
  switch (phase) {
    case "loading":
      sub = (
        <>
          <Skeleton className="mt-1 h-3 w-56 max-w-full" />
          <span className="sr-only">{t.checking}</span>
        </>
      );
      break;
    case "error":
      sub = t.statusError;
      break;
    case "na":
      sub = t.na;
      break;
    case "on":
      sub = status?.label ? t.on(status.label) : t.onNoLabel;
      break;
    case "waiting":
      sub = t.waiting;
      break;
    case "off":
      sub = t.off;
      break;
  }

  return (
    <div className="flex items-start gap-3.5">
      <ChannelIcon dimmed={dimmed}>
        <Send className="size-5" aria-hidden />
      </ChannelIcon>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-medium",
              dimmed ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {t.telegramTitle}
          </p>
          {/* Live: «Чекаємо…» → «Підключено як …» is the news a screen-reader
              user is waiting for after pressing «Старт» on the phone. */}
          <div aria-live="polite" className="text-xs text-muted-foreground">
            {sub}
          </div>
          {disconnect.isError ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {t.disconnectError}
            </p>
          ) : null}
        </div>

        {phase === "off" ? (
          <TelegramConnectButton connect={connect} variant="account" />
        ) : null}

        {phase === "error" ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={connect.retryStatus}
          >
            {dict.common.retry}
          </Button>
        ) : null}

        {phase === "on" ? (
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="tint-success" size="pill" dot>
              {t.connectedPill}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="min-h-11 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={disconnect.isPending}
              aria-busy={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              {disconnect.isPending ? (
                <Loader2
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              {t.disconnect}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
