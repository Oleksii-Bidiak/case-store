"use client";

import * as React from "react";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Button } from "./button";

export interface ErrorStateProps {
  /**
   * `inline` — a destructive-tinted bar with the message and an outline
   * «Повторити» (Dashboard П4: one per failed block).
   * `card` — a centred block for a whole area that failed (a table, a page).
   */
  variant?: "inline" | "card";
  /** `card` heading. Defaults to «Не вдалося завантажити дані». */
  title?: React.ReactNode;
  /** The `inline` message, or the `card` description. */
  message?: React.ReactNode;
  onRetry?: () => void;
  /** Spins the icon and disables the button while the retry is in flight. */
  isRetrying?: boolean;
  className?: string;
}

/**
 * The one way a load failure looks in the admin (wave 198). Always offers
 * «Повторити» when the caller can retry: an error with no way out is a dead
 * end, and «оновіть сторінку» throws away whatever else is on screen.
 * `role="alert"` so the failure is announced where it appears.
 */
export function ErrorState({
  variant = "inline",
  title = dict.canon.errorTitle,
  message,
  onRetry,
  isRetrying = false,
  className,
}: ErrorStateProps) {
  const retry = onRetry ? (
    <Button
      type="button"
      variant={variant === "card" ? "default" : "outline"}
      size={variant === "card" ? "default" : "sm"}
      onClick={onRetry}
      disabled={isRetrying}
      className={variant === "inline" ? "text-foreground" : undefined}
    >
      {variant === "card" ? (
        <RefreshCwIcon
          aria-hidden="true"
          className={cn(
            isRetrying && "animate-spin motion-reduce:animate-none",
          )}
        />
      ) : null}
      {dict.canon.retry}
    </Button>
  ) : null;

  if (variant === "card") {
    return (
      <div
        role="alert"
        data-slot="error-state"
        data-variant="card"
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-10 text-center",
          className,
        )}
      >
        <TriangleAlertIcon aria-hidden="true" className="size-6 text-warning" />
        <div className="flex max-w-md flex-col gap-1">
          <p className="text-base font-semibold text-foreground">{title}</p>
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
        </div>
        {retry}
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-slot="error-state"
      data-variant="inline"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive",
        className,
      )}
    >
      <p>{message ?? title}</p>
      {retry}
    </div>
  );
}
