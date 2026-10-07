"use client";

import { useState } from "react";
import { ThemeToggle } from "@/features/theme";
import { dict, H1_CLASS } from "@/shared/config";
import { AccountNotificationChannels } from "./account-notification-channels";

/**
 * AccountSettingsSection — the "Налаштування" section.
 *
 * Appearance is REAL: the same light/system/dark control the header carries
 * (`features/theme`), so a visitor can change the theme from the page that
 * claims to hold their settings. Until TASK-505 this card only described the
 * theme — and described it wrongly, still promising the pre-TASK-412 behaviour
 * of following the OS with no say in it.
 *
 * «Сповіщення» opens with WHERE the order notifications go (TASK-679): the
 * e-mail, always, and Telegram on top of it — real, from the API. The topic
 * toggles under it («Про що повідомляти») remain a STUB: local-only, not
 * persisted (no notification-prefs backend). Tracked with the loyalty/settings
 * follow-up (TASK-175).
 */
export function AccountSettingsSection({
  email,
  telegramPollIntervalMs,
}: {
  /** The account's address — named on the always-on «Пошта» row. */
  email: string;
  /** Override the Telegram status poll cadence (tests). */
  telegramPollIntervalMs?: number;
}) {
  const d = dict.account.dashboard;
  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    promo: true,
    orders: true,
    price: false,
  });

  const toggle = (key: string) =>
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="max-w-[680px]">
      <h1 className={`mb-6 ${H1_CLASS} text-foreground`}>
        {d.settingsHeading}
      </h1>

      <div className="rounded-card border border-border bg-card p-[26px] shadow-card">
        <h2 className="mb-1.5 text-lg font-semibold text-foreground">
          {d.appearanceHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{d.appearanceNote}</p>
        {/* The control itself, not a sentence about it. `hideLabel`: the card
            heading and the line above already name this field, so the switch's
            own caption would be a third title — it stays as the group's
            accessible name. `max-w-xs` keeps the three segments at a thumb's
            width instead of stretching them across a 680px card. */}
        <ThemeToggle variant="full" hideLabel className="mt-4 max-w-xs" />
      </div>

      <div className="mt-[18px] rounded-card border border-border bg-card p-[26px] shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {d.notificationsHeading}
        </h2>
        <AccountNotificationChannels
          email={email}
          pollIntervalMs={telegramPollIntervalMs}
        />
        <h3 className="mt-2 border-t border-border pt-5 pb-2 text-sm font-semibold text-foreground">
          {dict.telegramNotifications.account.topicsHeading}
        </h3>
        {d.notifs.map((n) => {
          const on = notifs[n.key];
          return (
            <label
              key={n.key}
              className="flex cursor-pointer items-center justify-between gap-4 border-t border-border py-[13px]"
            >
              <span className="flex flex-col">
                <b className="text-sm font-medium text-foreground">{n.label}</b>
                <span className="text-xs text-muted-foreground">{n.desc}</span>
              </span>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(n.key)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[3px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${
                  on ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  // Thumb in the on-primary token (TASK-879): white in both
                  // themes, so it reads on the primary track and the muted one.
                  className={`size-5 rounded-full bg-primary-foreground shadow transition-transform ${
                    on ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </label>
          );
        })}
        <p className="mt-3 text-xs text-muted-foreground">{d.notifStub}</p>
      </div>
    </div>
  );
}
