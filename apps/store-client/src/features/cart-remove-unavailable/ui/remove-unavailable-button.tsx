"use client";

import { Loader2, Trash2 } from "lucide-react";
import { dict } from "@/shared/config";

interface RemoveUnavailableButtonProps {
  /** How many withdrawn LINES the click removes (not units). */
  count: number;
  /** The removal loop is running — the click is ignored until it settles. */
  pending?: boolean;
  onClick: () => void;
}

/**
 * RemoveUnavailableButton — the one-tap remedy under the «приберіть
 * недоступні» reason (Cart.dc.html `.ca-rmall`, TASK-657). Outline-destructive,
 * never filled: the disabled checkout CTA above stays the page's primary, this
 * is the action that unblocks it.
 *
 * The visible text IS the accessible name («Прибрати 3 недоступні товари») —
 * no `aria-label` to drift from it.
 *
 * Busy uses `aria-disabled`, not `disabled`: a focused <button> that turns
 * `disabled` drops focus to <body> in Chromium, and the keyboard user who
 * pressed Enter here would be thrown to the top of the page mid-action. The
 * host guards the click while `pending`.
 */
export function RemoveUnavailableButton({
  count,
  pending = false,
  onClick,
}: RemoveUnavailableButtonProps) {
  const Icon = pending ? Loader2 : Trash2;
  return (
    <button
      type="button"
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={pending ? undefined : onClick}
      className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-destructive bg-transparent px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:border-border aria-disabled:text-disabled-foreground aria-disabled:hover:bg-transparent"
    >
      <Icon
        className={`size-4 shrink-0 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`}
        aria-hidden="true"
      />
      {dict.cart.removeUnavailable(count)}
    </button>
  );
}
