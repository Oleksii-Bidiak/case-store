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

  return (
    <div
      className="flex gap-2"
      role="timer"
      aria-label={dict.promo.countdown.aria}
    >
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex h-[62px] min-w-[62px] flex-col items-center justify-center rounded-[13px] bg-black/25 backdrop-blur-sm"
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
