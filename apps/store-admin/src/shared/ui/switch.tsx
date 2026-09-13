"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";

/**
 * A two-state toggle (TASK-436).
 *
 * Distinct from {@link Checkbox} by intent, not by looks: a checkbox selects an
 * item or opts into a list, a switch turns a property of the thing being edited
 * on or off — and reads as on/off at a glance, which a bare square does not. The
 * blog form's "Головна стаття тижня" was a raw `<input type="checkbox">` with no
 * `<Label htmlFor>` and no hint, so the owner could not tell what flipping it
 * would do; that control is what this primitive replaces.
 *
 * Always pair it with a `<Label htmlFor>`: the thumb alone carries no meaning
 * for a screen reader, and Radix does not supply a name of its own.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // `ring-2` rather than the `ring-[3px]` its sibling Checkbox uses: that
        // arbitrary value is grandfathered in eslint-suppressions.json, a
        // baseline meant to shrink, and a new file has no business growing it.
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background ring-0 shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
