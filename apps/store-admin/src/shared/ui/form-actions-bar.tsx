import { cn } from "@/shared/lib/utils";

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
 */
export function FormActionsBar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-actions-bar"
      className={cn(
        "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur supports-[backdrop-filter]:max-md:bg-background/80",
        className,
      )}
      {...props}
    />
  );
}
