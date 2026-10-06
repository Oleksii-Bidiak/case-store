"use client";

import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Label, Switch } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

const t = dict.deliverySettingsForm;

interface DeliveryMethodCardProps {
  /** Stable id for the switch — also what the e2e and the tests reach it by. */
  switchId: string;
  icon: LucideIcon;
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** The settings of the method; shown only while it is switched on. */
  children?: ReactNode;
}

/**
 * One delivery method on /settings/delivery (ДН-1.1): a 36 px icon tile, the
 * name and what the buyer gets, and the on/off switch on the right. A switched-
 * on card lifts (card shadow, primary-tinted tile); a switched-off one goes
 * flat with a muted tile, so the four cards read as "what the checkout offers"
 * at a glance. The body — the method's own fields — exists only while the
 * method is on: settings of a method nobody is offered are noise.
 *
 * The switch is named by the card title (`aria-labelledby`) and described by
 * its line, so a screen reader hears «Нова Пошта, перемикач, увімкнено» rather
 * than the visible «Увімкнено» twice. That visible word is a `<label>` for the
 * same switch (a bigger target on desktop) and gives way to the description on
 * a phone, where the switch keeps a 44 px hit area of its own (`after:-inset-3`
 * around the 36×20 track).
 */
export function DeliveryMethodCard({
  switchId,
  icon: Icon,
  title,
  description,
  enabled,
  onEnabledChange,
  children,
}: DeliveryMethodCardProps) {
  const ids = useId();
  const titleId = `${ids}-title`;
  const descriptionId = `${ids}-description`;
  const hasBody = enabled && children !== undefined && children !== null;

  return (
    <section
      aria-labelledby={titleId}
      data-enabled={enabled}
      className={cn(
        "flex flex-col rounded-lg border bg-card p-4 transition-shadow motion-reduce:transition-none",
        enabled && "shadow-card",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md transition-colors motion-reduce:transition-none",
            enabled
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3
            id={titleId}
            className="text-control font-semibold text-foreground"
          >
            {title}
          </h3>
          <p id={descriptionId} className="text-pill text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="-my-3 flex min-h-11 shrink-0 items-center gap-2">
          <Label
            htmlFor={switchId}
            aria-hidden="true"
            className="min-h-11 cursor-pointer px-1 text-pill font-normal text-muted-foreground max-sm:hidden"
          >
            {enabled ? t.statusOn : t.statusOff}
          </Label>
          <Switch
            id={switchId}
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative after:absolute after:-inset-3"
          />
        </div>
      </div>
      {hasBody ? (
        <div className="mt-3.5 flex flex-col gap-4 border-t pt-3.5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
