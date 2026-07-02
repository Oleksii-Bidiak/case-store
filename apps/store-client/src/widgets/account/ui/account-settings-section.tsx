"use client";

import { useState } from "react";
import { dict } from "@/shared/config";

/**
 * AccountSettingsSection — the "Налаштування" section. STUB: appearance follows
 * the OS `prefers-color-scheme` (no manual theme system yet), and the
 * notification toggles are local-only (not persisted — no notification-prefs
 * backend). Tracked with the loyalty/settings follow-up (TASK-175).
 */
export function AccountSettingsSection() {
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
      <h1 className="mb-6 font-display text-[28px] font-bold tracking-[-0.02em] text-foreground">
        {d.settingsHeading}
      </h1>

      <div className="rounded-[18px] border border-border bg-card p-[26px] shadow-[var(--shadow-card)]">
        <h2 className="mb-1.5 text-[17px] font-semibold text-foreground">
          {d.appearanceHeading}
        </h2>
        <p className="text-[13.5px] text-muted-foreground">
          {d.appearanceNote}
        </p>
      </div>

      <div className="mt-[18px] rounded-[18px] border border-border bg-card p-[26px] shadow-[var(--shadow-card)]">
        <h2 className="mb-2 text-[17px] font-semibold text-foreground">
          {d.notificationsHeading}
        </h2>
        {d.notifs.map((n) => {
          const on = notifs[n.key];
          return (
            <label
              key={n.key}
              className="flex cursor-pointer items-center justify-between gap-4 border-t border-border py-[13px]"
            >
              <span className="flex flex-col">
                <b className="text-[14.5px] font-medium text-foreground">
                  {n.label}
                </b>
                <span className="text-[12.5px] text-muted-foreground">
                  {n.desc}
                </span>
              </span>
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(n.key)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[3px] transition-colors ${
                  on ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`size-5 rounded-full bg-white shadow transition-transform ${
                    on ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </label>
          );
        })}
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          {d.notifStub}
        </p>
      </div>
    </div>
  );
}
