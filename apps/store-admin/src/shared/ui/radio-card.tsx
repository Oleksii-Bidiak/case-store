"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";

/**
 * RadioCardGroup / RadioCard — a choice that needs a sentence of explanation
 * per option (Staff С5 «Рівень доступу», wave 198). Radix RadioGroup: one tab
 * stop, arrows move AND select, as native radios do. The title is the radio's
 * name and the description its description, so a screen reader hears
 * «Менеджер, radio, checked — лише те, що йому видали», not one long name.
 */
function RadioCardGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-card-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

interface RadioCardProps extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Item>,
  "title"
> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /**
   * A small picture between the radio and the text — e.g. the placement
   * schema of BannersProposal БН5. Decorative: rendered `aria-hidden`.
   */
  media?: React.ReactNode;
}

function RadioCard({
  title,
  description,
  media,
  className,
  ...props
}: RadioCardProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "group/radio-card flex w-full items-start gap-2.5 rounded-md border bg-background px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground data-[state=checked]:border-primary",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-input group-data-[state=checked]/radio-card:border-5 group-data-[state=checked]/radio-card:border-primary"
      />
      {media ? (
        <span aria-hidden="true" className="shrink-0">
          {media}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={titleId} className="font-semibold text-foreground">
          {title}
        </span>
        {description ? (
          <span id={descriptionId} className="text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioCardGroup, RadioCard, type RadioCardProps };
