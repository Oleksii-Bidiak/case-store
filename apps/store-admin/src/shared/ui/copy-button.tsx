"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";

export interface CopyButtonProps {
  /** The text put on the clipboard. */
  value: string;
  /** Resting label, e.g. «Скопіювати». */
  label: string;
  /** Label shown for a moment after a successful copy, e.g. «Скопійовано». */
  copiedLabel: string;
  /** Shown instead when the browser refuses — the value is then selected by hand. */
  failedLabel: string;
  /** Optional accessible name when the visible label is not specific enough. */
  ariaLabel?: string;
}

/** How long the "copied" confirmation stays up. */
const CONFIRMATION_MS = 2000;

/**
 * CopyButton — put one short string on the clipboard, and say whether it worked
 * (TASK-484).
 *
 * The first use of `navigator.clipboard` in this project, so the shape is set
 * here deliberately rather than per call site.
 *
 * ── Why it reports failure instead of assuming success ────────────────────────
 * `writeText` is not guaranteed: it rejects on an insecure origin (plain HTTP,
 * which is exactly how an admin panel gets opened on a staging box), when the
 * document is not focused, and when permission is denied. A button that always
 * flashed «Скопійовано» would send an operator to paste an empty clipboard into
 * a customer's chat and wonder why nothing arrived. So a rejection says so, and
 * the caller is expected to keep the value visible and selectable for the manual
 * fallback.
 *
 * ── Why the timer is cleaned up ───────────────────────────────────────────────
 * The order card this lives on unmounts as soon as the operator navigates away,
 * and a pending `setState` on an unmounted component is a warning in dev and a
 * leak in principle.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  failedLabel,
  ariaLabel,
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const flash = (next: "copied" | "failed") => {
    setState(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), CONFIRMATION_MS);
  };

  const copy = () => {
    // Optional chaining, not a bang: `navigator.clipboard` is undefined outside a
    // secure context, and reading `.writeText` off it would throw before we ever
    // reached the catch.
    const write = navigator.clipboard?.writeText(value);
    if (!write) {
      flash("failed");
      return;
    }
    write.then(
      () => flash("copied"),
      () => flash("failed"),
    );
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label={ariaLabel}
      >
        {state === "copied"
          ? copiedLabel
          : state === "failed"
            ? failedLabel
            : label}
      </Button>
      {/* Announced once, to the screen-reader user who cannot see the label
          change. `aria-live` on a region that is empty at rest is the pattern
          that actually announces; swapping text inside the button does not. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied"
          ? copiedLabel
          : state === "failed"
            ? failedLabel
            : ""}
      </span>
    </div>
  );
}
