"use client";

import { Check, Send } from "lucide-react";
import {
  TelegramConnect,
  useTelegramConnect,
} from "@/features/telegram-connect";
import { dict } from "@/shared/config";

interface CheckoutTelegramCardProps {
  /** The guest's order access token from the create call. */
  token: string;
  /** Short order number, as on the success card («7F3A91C2»). */
  orderNumber: string;
  /** Where the confirmation letter went — Telegram is added to it. */
  email: string;
  /** Override the poll cadence (tests). */
  pollIntervalMs?: number;
}

/**
 * «Стежте за замовленням у Telegram» (TASK-679, Checkout.dc.html guest
 * success). The token is bound to THIS order, not to a person: the chat that
 * presses «Старт» gets this order's confirmation summary and its «shipped».
 *
 * Renders nothing until the status read says the bot is available — a card
 * offering a channel the shop cannot deliver would be the silent success plan
 * 187 forbids — and nothing when the read fails (an unknown or claimed token
 * answers 404). The link is issued on click, so the QR appears only after
 * «Підключити Telegram» (owner decision 2, 2026-10-07).
 */
export function CheckoutTelegramCard({
  token,
  orderNumber,
  email,
  pollIntervalMs,
}: CheckoutTelegramCardProps) {
  const t = dict.telegramNotifications.guest;
  const connect = useTelegramConnect(
    { kind: "guest", token },
    { pollIntervalMs },
  );
  const { phase } = connect;
  if (phase === "loading" || phase === "error" || phase === "na") return null;

  return (
    <section
      aria-labelledby="checkout-telegram-title"
      data-testid="checkout-telegram-card"
      className="flex flex-col gap-3 rounded-card border border-border bg-card p-6 shadow-card"
    >
      <div className="flex items-center gap-3">
        <Send className="size-5 shrink-0 text-primary" aria-hidden />
        <h2
          id="checkout-telegram-title"
          className="font-display text-lg font-bold text-foreground"
        >
          {t.heading}
        </h2>
      </div>

      {phase === "on" ? (
        <p
          role="status"
          className="flex items-start gap-2 text-sm text-foreground"
        >
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {t.connected(email)}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.body(orderNumber)}</p>
          <TelegramConnect connect={connect} variant="guest" />
        </>
      )}
    </section>
  );
}
