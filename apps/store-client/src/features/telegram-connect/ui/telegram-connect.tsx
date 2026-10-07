"use client";

import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button, Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import type { TelegramConnectController } from "../model/use-telegram-connect";

/** Which host draws the flow — decides the weight of the connect button. */
export type TelegramConnectVariant = "account" | "guest";

interface TelegramConnectPartProps {
  connect: TelegramConnectController;
  className?: string;
}

/**
 * «Підключити» / «Підключити Telegram». Rendered only while the flow is `off`.
 *
 * In the account Telegram is a secondary channel next to the e-mail, so the
 * button is outline; on the guest success panel it is the card's one action,
 * so it is primary. When it comes back after «Скасувати» it takes the focus
 * back, so a keyboard user is not dropped onto `<body>`.
 */
export function TelegramConnectButton({
  connect,
  variant,
  className,
}: TelegramConnectPartProps & { variant: TelegramConnectVariant }) {
  const t = dict.telegramNotifications;
  const ref = useRef<HTMLButtonElement>(null);
  const visible = connect.phase === "off";
  const { takeFocusRestore } = connect;

  useEffect(() => {
    if (visible && takeFocusRestore()) ref.current?.focus();
  }, [visible, takeFocusRestore]);

  if (!visible) return null;
  return (
    <Button
      ref={ref}
      type="button"
      size="lg"
      variant={variant === "account" ? "outline" : "default"}
      onClick={connect.start}
      className={cn("min-h-11", className)}
    >
      {variant === "account" ? t.connectAccount : t.connectGuest}
    </Button>
  );
}

/**
 * The waiting block (role="status"): QR from `sm` up, «Відкрийте бота…»,
 * «Відкрити Telegram» · «Я натиснув «Старт»» · «Скасувати», and the one-time
 * hint. While `off` it shows the link error, if any; otherwise nothing.
 *
 * It takes the focus when it opens: the button that opened it has just been
 * unmounted, and the instructions are what the shopper needs next.
 */
export function TelegramConnectPanel({
  connect,
  className,
}: TelegramConnectPartProps) {
  if (connect.phase === "waiting") {
    return <WaitingPanel connect={connect} className={className} />;
  }
  // Only while `off`: after a 409 the account row turns `na` and its own line
  // already says Telegram is unavailable — the alert would say it twice. The
  // guest card never turns `na` (its status is not re-read), so it keeps it.
  if (connect.linkError && connect.phase === "off") {
    const t = dict.telegramNotifications;
    return (
      <p role="alert" className={cn("text-sm text-destructive", className)}>
        {connect.linkError === "conflict" ? t.linkConflict : t.linkError}
      </p>
    );
  }
  return null;
}

/**
 * The three waiting actions: a 44px touch target where they stack full-width
 * on a phone, the default height from `sm` up, so «Відкрити Telegram» ·
 * «Я натиснув «Старт»» · «Скасувати» fit one row in the account's text column.
 */
const WAITING_ACTION = "min-h-11 sm:min-h-10";

function WaitingPanel({ connect, className }: TelegramConnectPartProps) {
  const t = dict.telegramNotifications;
  const ref = useRef<HTMLDivElement>(null);
  const href = connect.link?.deepLink;
  const bot = connect.status?.botUsername;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      data-testid="telegram-connect-waiting"
      className={cn(
        "flex gap-5 rounded-lg bg-muted p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
        className,
      )}
    >
      {/* The code sits on the theme-invariant `code-*` pair (globals.css): an
          inverted, light-on-dark QR is one many phone cameras will not read.
          Hidden below `sm` — nobody scans the screen they are holding. */}
      <div
        data-testid="telegram-connect-qr"
        className="hidden size-28 shrink-0 items-center justify-center rounded-md border border-border bg-code-surface p-2 text-code-ink sm:flex"
      >
        {href ? (
          <QRCodeSVG
            value={href}
            size={96}
            marginSize={0}
            fgColor="currentColor"
            bgColor="transparent"
            role="img"
            aria-label={t.qrLabel}
          />
        ) : (
          <Skeleton className="size-full" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm text-foreground">
          {t.waitingBefore}{" "}
          {bot ? <b className="font-semibold">@{bot}</b> : null}{" "}
          {t.waitingAfter}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {href ? (
            <Button asChild className={WAITING_ACTION}>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {t.openTelegram}
                <span className="sr-only"> {t.opensInNewTab}</span>
              </a>
            </Button>
          ) : (
            <Button type="button" className={WAITING_ACTION} disabled>
              {t.linkLoading}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className={WAITING_ACTION}
            onClick={connect.checkNow}
          >
            {t.pressedStart}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(WAITING_ACTION, "px-3 text-muted-foreground")}
            onClick={connect.cancel}
          >
            {t.cancel}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{t.oneTimeHint}</p>
      </div>
    </div>
  );
}

/**
 * TelegramConnect — the button and the panel in one column, for a host that
 * has no row to split them across (the guest success card). The account row
 * places {@link TelegramConnectButton} on the right of the row and
 * {@link TelegramConnectPanel} under it instead.
 */
export function TelegramConnect({
  connect,
  variant,
  className,
}: TelegramConnectPartProps & { variant: TelegramConnectVariant }) {
  return (
    <div className={cn("flex flex-col items-start gap-3", className)}>
      <TelegramConnectButton connect={connect} variant={variant} />
      <TelegramConnectPanel connect={connect} className="w-full" />
    </div>
  );
}
