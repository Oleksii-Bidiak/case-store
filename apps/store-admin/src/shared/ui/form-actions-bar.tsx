import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Button } from "./button";

/**
 * FormActionsBar — sticky submit-row wrapper for long admin forms (TASK-258).
 *
 * Below `md` it sticks to the bottom of the nearest scrolling ancestor —
 * admin-shell's `<main className="overflow-y-auto p-4 lg:p-6">` (TASK-257) —
 * with a translucent/blurred background so content scrolling underneath does
 * not visually collide with the buttons. `-mx-4 px-4` cancels `<main>`'s `p-4`
 * mobile padding so the bar bleeds edge-to-edge across the whole sticky range
 * (`<main>` is `p-4` at every width below `lg`, and the bar is only sticky
 * below `md`). At `md`+ it is a plain static block — the desktop form-submit
 * row renders exactly as before.
 *
 * NOTE: the sticky behavior relies on `<main>` staying the nearest scrolling
 * ancestor between the form and the viewport; if a future refactor changes
 * that container's overflow behavior, the bar silently stops sticking.
 *
 * ── `variant="sticky"` (wave 198, Product Ф1 / Category КТ5) ────────────────
 * One «Зберегти» for a whole sectioned form, pinned to the bottom at EVERY
 * width, saying which sections have unsaved changes. It is `sticky` inside
 * `<main>`, not `fixed` to the viewport: `<main>` already starts where the
 * sidebar ends, so the bar inherits the 256 px offset on desktop and 0 on a
 * phone without hard-coding the shell's width here. The negative side margins
 * bleed it over `<main>`'s padding (`p-4` / `lg:p-6`), the same trick as
 * above. Place it as the LAST child of the form so its sticky range is the
 * whole form.
 */
interface StickyBarProps {
  variant: "sticky";
  /** Section titles with unsaved edits; listed in «Незбережені зміни: …». */
  dirtySections?: readonly string[];
  /** Replaces the generated line. */
  summary?: React.ReactNode;
  /** «Скасувати зміни». Shown only while there is something to discard. */
  onDiscard?: () => void;
  /** The primary button's text — rendered as `type="submit"`. */
  saveLabel?: string;
  /** Submits a form the bar is not inside (`<button form=…>`). */
  formId?: string;
  isSaving?: boolean;
  saveDisabled?: boolean;
}

type FormActionsBarProps = React.ComponentProps<"div"> &
  ({ variant?: "default" } | StickyBarProps);

export function FormActionsBar(props: FormActionsBarProps) {
  if (props.variant === "sticky") return <StickyFormActionsBar {...props} />;
  const { className, variant: _variant, ...rest } = props;
  void _variant;
  return (
    <div
      data-slot="form-actions-bar"
      className={cn(
        "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur supports-[backdrop-filter]:max-md:bg-background/80",
        className,
      )}
      {...rest}
    />
  );
}

function StickyFormActionsBar({
  variant: _variant,
  dirtySections = [],
  summary,
  onDiscard,
  saveLabel,
  formId,
  isSaving = false,
  saveDisabled = false,
  className,
  children,
  ...rest
}: React.ComponentProps<"div"> & StickyBarProps) {
  void _variant;
  const dirty = dirtySections.length > 0;
  const line =
    summary ??
    (dirty ? dict.canon.unsavedChanges(dirtySections.join(", ")) : null);
  return (
    <div
      data-slot="form-actions-bar"
      data-variant="sticky"
      className={cn(
        "sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background px-4 py-2.5 shadow-bar lg:-mx-6 lg:px-6 lg:py-3",
        className,
      )}
      {...rest}
    >
      {line ? (
        <p className="flex min-w-0 items-center gap-2 text-sm text-foreground">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-primary"
          />
          <span className="min-w-0">{line}</span>
        </p>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {children}
        {onDiscard && (dirty || summary) ? (
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={onDiscard}
          >
            {dict.canon.discardChanges}
          </Button>
        ) : null}
        {saveLabel ? (
          <Button
            type="submit"
            form={formId}
            disabled={isSaving || saveDisabled}
          >
            {saveLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
