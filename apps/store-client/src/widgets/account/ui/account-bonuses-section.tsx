import { dict } from "@/shared/config";

/**
 * AccountBonusesSection — the "Бонуси" section. STUB: there is no loyalty /
 * points backend yet (TASK-175 tracks the feature). Shows a zero balance and a
 * "coming soon" note rather than fake data.
 */
export function AccountBonusesSection() {
  const d = dict.account.dashboard;

  return (
    <div className="max-w-[760px]">
      <h1 className="mb-6 font-display text-[28px] font-bold tracking-[-0.02em] text-foreground">
        {d.bonusesHeading}
      </h1>

      <div className="flex flex-wrap items-center justify-between gap-6 rounded-[18px] bg-foreground px-8 py-[30px] text-background">
        <div>
          <span className="text-sm opacity-80">{d.bonusesAvailable}</span>
          <div className="mt-1 flex items-baseline gap-2.5">
            <b className="font-display text-[46px] leading-none font-bold">0</b>
            <span className="text-base opacity-85">₴ {d.bonusesHint}</span>
          </div>
        </div>
        <span className="inline-flex size-[72px] items-center justify-center rounded-full bg-white/15 text-warning">
          <svg
            width="38"
            height="38"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M9 12.5l2 2 4-4.5" />
          </svg>
        </span>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">{d.bonusesStub}</p>
    </div>
  );
}
