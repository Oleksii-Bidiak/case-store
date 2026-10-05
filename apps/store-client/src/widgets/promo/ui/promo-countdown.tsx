"use client";

import { useEffect, useState } from "react";
import { dict } from "@/shared/config";

/** Milliseconds until the upcoming Sunday 23:59:59 (local). Stable within a week. */
function nextSundayEnd(): number {
  const now = new Date();
  const target = new Date(now);
  const daysUntilSun = (7 - now.getDay()) % 7;
  target.setDate(now.getDate() + daysUntilSun);
  target.setHours(23, 59, 59, 999);
  if (target.getTime() < now.getTime()) {
    target.setDate(target.getDate() + 7);
  }
  return target.getTime();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * PromoCountdown — a live "time left" strip in the promo hero, counting down to
 * the end of the current sale week. Client-only: the first tick is deferred via
 * requestAnimationFrame so the server/first-paint markup (zeros) matches, then
 * an interval updates it every second. No backend — the deadline is derived
 * client-side (a real campaign end-date would come from a promo backend).
 */
export function PromoCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = nextSundayEnd();
    const update = () => setRemaining(Math.max(0, target - Date.now()));
    const raf = requestAnimationFrame(update);
    const id = setInterval(update, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  const ms = remaining ?? 0;
  const cells = [
    { val: Math.floor(ms / 86400000), label: dict.promo.countdown.days },
    {
      val: Math.floor((ms % 86400000) / 3600000),
      label: dict.promo.countdown.hours,
    },
    {
      val: Math.floor((ms % 3600000) / 60000),
      label: dict.promo.countdown.minutes,
    },
    {
      val: Math.floor((ms % 60000) / 1000),
      label: dict.promo.countdown.seconds,
    },
  ];

  // Below `sm` the strip is a four-column grid that shares the hero's content
  // width (TASK-498): four fixed 62px tiles need 272px, and the hero leaves
  // ~224px at 320 and ~264px at 360, so its `overflow-hidden` clipped the
  // seconds tile. From `sm` the tiles return to their fixed width inline with
  // the CTA, as in the mockup.
  return (
    <div
      className="grid w-full grid-cols-4 gap-2 sm:flex sm:w-auto"
      role="timer"
      aria-label={dict.promo.countdown.aria}
    >
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex h-15.5 min-w-0 flex-col items-center justify-center rounded-cta bg-black/25 backdrop-blur-sm sm:min-w-15.5"
        >
          <span className="font-mono text-2xl leading-none font-bold">
            {pad(cell.val)}
          </span>
          <span className="text-[10.5px] tracking-wide uppercase opacity-80">
            {cell.label}
          </span>
        </div>
      ))}
    </div>
  );
}
