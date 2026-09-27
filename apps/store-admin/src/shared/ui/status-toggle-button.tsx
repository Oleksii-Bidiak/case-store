"use client";

import type { Ref } from "react";
import { dict } from "@/shared/config";
import { Badge } from "./badge";
import { Button } from "./button";

export interface StatusToggleButtonProps {
  isActive: boolean;
  isPending?: boolean;
  onToggle: () => void;
  /** Accessible name while inactive, e.g. «Активувати товар». */
  activateLabel: string;
  /** Accessible name while active, e.g. «Деактивувати товар». */
  deactivateLabel: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The one-click «Активний / Неактивний» badge-button of the admin tables
 * (TASK-812). The product and category toggles used to render this markup
 * twice, byte for byte; the part that differs between them — which mutation,
 * whether to ask first — lives in the feature, not here.
 */
export function StatusToggleButton({
  isActive,
  isPending = false,
  onToggle,
  activateLabel,
  deactivateLabel,
  ref,
}: StatusToggleButtonProps) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      onClick={onToggle}
      disabled={isPending}
      aria-label={isActive ? deactivateLabel : activateLabel}
    >
      <Badge variant={isActive ? "default" : "secondary"}>
        {isActive ? dict.common.active : dict.common.inactive}
      </Badge>
    </Button>
  );
}
