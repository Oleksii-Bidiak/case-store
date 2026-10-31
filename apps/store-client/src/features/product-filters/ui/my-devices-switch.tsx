"use client";

import { cn } from "@/shared/lib/utils";

interface MyDevicesSwitchProps {
  id: string;
  /** Id of the visible title the switch is named by. */
  labelledBy: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * The «З урахуванням моїх пристроїв» switch (Catalog §11): a 46×28 pill —
 * `bg-input` off, `bg-primary` on — with a card-coloured knob that slides
 * 18px. One control for the catalogue rail (TASK-2077) and the wishlist rail
 * (TASK-1300), so the two pages cannot drift. A native button with
 * `role="switch"`: Space / Enter toggle it, its state is announced.
 */
export function MyDevicesSwitch({
  id,
  labelledBy,
  checked,
  onCheckedChange,
}: MyDevicesSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative mt-0.5 inline-flex h-7 w-11.5 shrink-0 cursor-pointer items-center rounded-full outline-none transition-all duration-200 hover:ring-4 hover:ring-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.75 left-0.75 size-5.5 rounded-full bg-card shadow-card transition-transform duration-200 ease-out motion-reduce:transition-none",
          checked && "translate-x-4.5",
        )}
      />
    </button>
  );
}
