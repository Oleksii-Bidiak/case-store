"use client";

import { useId } from "react";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import type { DeliveryPreviewRow } from "../model/delivery-preview";

const t = dict.deliverySettingsForm;

interface DeliveryPreviewPanelProps {
  rows: readonly DeliveryPreviewRow[];
  className?: string;
}

/**
 * «Так побачить покупець на чекауті» (ДН-1.1, right column): the method cards
 * the storefront would draw for the CURRENT, unsaved form, the first one
 * pre-selected as the checkout does. Illustrative, not interactive — the radio
 * dots are drawn, not inputs, so the panel adds no tab stops to the form.
 */
export function DeliveryPreviewPanel({
  rows,
  className,
}: DeliveryPreviewPanelProps) {
  const headingId = useId();
  const hint =
    rows.length === 0
      ? t.previewHintNone
      : rows.length === 1
        ? t.previewHintOne
        : t.previewHintMany;

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="delivery-preview"
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card",
        className,
      )}
    >
      <p id={headingId} className="text-xs font-semibold text-muted-foreground">
        {t.previewHeading}
      </p>

      {rows.length > 0 ? (
        <ul aria-label={t.previewListAria} className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const selected = index === 0;
            return (
              <li
                key={row.method}
                data-method={row.method}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3",
                  selected && "border-primary bg-primary/5",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-primary" : "border-input",
                  )}
                >
                  {selected ? (
                    <span className="size-2 rounded-full bg-primary" />
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {row.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.line}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm font-medium text-destructive">{t.previewEmpty}</p>
      )}

      <p className="text-xs text-muted-foreground">{hint}</p>
    </aside>
  );
}
