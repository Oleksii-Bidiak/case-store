"use client";

import { useEffect, useRef } from "react";
import { Check, Plus, Smartphone, Tablet, Watch } from "lucide-react";

import type { DeviceModelLike } from "@/entities/my-devices";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

import type { DeviceKind } from "../model/device-links";
import { useModelDeviceState } from "../model/use-model-device-state";

/**
 * Visible keyboard focus: a 2px ring outline 2px off the control (the
 * DevicePicker / Search mockups). No `outline-none` base — in Tailwind v4 the
 * focus outline would inherit its `none` style.
 */
export const SEARCH_DEVICE_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring";

/** The family-disc glyph: phone, watch or tablet. Decorative. */
export function DeviceKindIcon({
  kind,
  className,
}: {
  kind: DeviceKind;
  className?: string;
}) {
  const Icon =
    kind === "watch" ? Watch : kind === "tablet" ? Tablet : Smartphone;
  return <Icon aria-hidden="true" className={className} />;
}

interface ModelDeviceActionProps {
  model: DeviceModelLike;
  /**
   * `popup` — the header suggestions block (40px, no icons, keeps the input
   * focused so the popup stays open); `row` — the /search model row (44px,
   * Plus / Check icons, the ghost pill of the mockup).
   */
  variant: "popup" | "row";
}

/**
 * Exactly one device-state element (TASK-2074): «Додати до моїх пристроїв»
 * (not saved) / «Показувати для нього» (saved, not active) / «✓ Ваш пристрій»
 * (active, not interactive). The block re-renders in place after the click.
 */
export function ModelDeviceAction({ model, variant }: ModelDeviceActionProps) {
  const { status, makeActive } = useModelDeviceState(model);
  const statusRef = useRef<HTMLSpanElement>(null);
  // The button disappears on success; if it held keyboard focus, hand focus
  // to the confirmation instead of dropping it on <body> (which would also
  // close the header popup through its focus-out guard).
  const moveFocus = useRef(false);

  useEffect(() => {
    if (status === "active" && moveFocus.current) {
      moveFocus.current = false;
      statusRef.current?.focus();
    }
  }, [status]);

  const popup = variant === "popup";

  if (status === "active") {
    return (
      <span
        ref={statusRef}
        tabIndex={-1}
        className={cn(
          "inline-flex items-center rounded-full font-semibold outline-none",
          popup
            ? "h-10 gap-1.5 px-1.5 text-sm text-foreground"
            : "h-11 gap-2 bg-card/70 px-4 text-sm text-success",
        )}
      >
        <Check
          aria-hidden="true"
          strokeWidth={2.5}
          className="size-4 shrink-0 text-success"
        />
        {dict.searchDevice.action.mine}
      </span>
    );
  }

  const saved = status === "saved";
  return (
    <button
      type="button"
      // Popup: keep the input from blurring, so the popup stays open and
      // the block re-renders in place.
      onMouseDown={popup ? (event) => event.preventDefault() : undefined}
      onClick={(event) => {
        moveFocus.current = document.activeElement === event.currentTarget;
        makeActive();
      }}
      className={cn(
        "inline-flex cursor-pointer items-center rounded-full font-semibold whitespace-nowrap text-foreground",
        "transition duration-150 ease-out motion-reduce:transition-none",
        popup
          ? "h-10 border border-foreground/20 bg-card px-3.5 text-sm hover:bg-muted"
          : "h-11 gap-2 bg-card px-4 text-sm hover:shadow-card active:scale-98 motion-reduce:active:scale-100",
        SEARCH_DEVICE_FOCUS,
      )}
    >
      {!popup &&
        (saved ? (
          <Check aria-hidden="true" className="size-4 shrink-0" />
        ) : (
          <Plus aria-hidden="true" className="size-4 shrink-0" />
        ))}
      {saved ? dict.searchDevice.action.activate : dict.searchDevice.action.add}
    </button>
  );
}
