"use client";

import { Trash2 } from "lucide-react";
import { dict } from "@/shared/config";
import { Button } from "@/shared/ui";

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
  return (
    <Button
      type="button"
      variant="outline"
      loading={pending}
      onClick={onClick}
      className="mt-3 h-auto min-h-11 w-full rounded-xl border border-destructive bg-transparent px-4 py-2 text-sm font-semibold text-destructive hover:border-destructive hover:bg-destructive/8 active:bg-destructive/8 data-loading:border-border data-loading:text-disabled-foreground data-loading:hover:bg-transparent"
    >
      {!pending && <Trash2 className="size-4 shrink-0" aria-hidden="true" />}
      {dict.cart.removeUnavailable(count)}
    </Button>
  );
}
