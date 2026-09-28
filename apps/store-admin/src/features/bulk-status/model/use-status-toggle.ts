"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useConfirmDialog, type ConfirmOptions } from "@/shared/ui";

/** The slice of an Orval `activate` / `deactivate` mutation this hook drives. */
export interface ToggleMutation {
  mutate: (
    variables: { id: string },
    options: { onSuccess: () => void; onError: () => void },
  ) => void;
  isPending: boolean;
}

export interface UseStatusToggleConfig {
  id: string;
  isActive: boolean;
  /** Omit when the resource has no one-click way back (discounts). */
  activate?: ToggleMutation;
  deactivate: ToggleMutation;
  /**
   * The prompt before DEACTIVATING, or `null` for none. Activating never asks —
   * making something visible is not the destructive direction.
   */
  confirmDeactivate?: ConfirmOptions | null;
  /** The operator said no — the caller restores focus (§7.5). */
  onCancel?: () => void;
  /** Cache work after the server confirms. */
  onWritten: (nextIsActive: boolean) => void;
  onFailed?: (nextIsActive: boolean) => void;
}

export interface StatusToggleApi {
  toggle: () => void;
  isPending: boolean;
  /** Render once in the caller's JSX; `null` while nothing is being asked. */
  confirmDialog: ReactNode;
}

/**
 * The single-row sibling of `useBulkStatus` (TASK-812): the engine the three
 * `*-status-toggle` features share instead of each re-growing the same
 * pick-the-mutation / guard-the-double-click / invalidate-on-success body.
 *
 * Cancel ⇒ ZERO mutation calls. No optimistic write: the caller's `onWritten`
 * runs only once the server has confirmed.
 */
export function useStatusToggle(
  config: UseStatusToggleConfig,
): StatusToggleApi {
  const { confirm, confirmDialog } = useConfirmDialog();
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  const isPending =
    (config.activate?.isPending ?? false) || config.deactivate.isPending;

  const toggle = useCallback(async () => {
    const current = configRef.current;
    const pending =
      (current.activate?.isPending ?? false) || current.deactivate.isPending;
    if (pending) return;

    const nextIsActive = !current.isActive;
    const mutation = nextIsActive ? current.activate : current.deactivate;
    if (!mutation) return;

    if (!nextIsActive && current.confirmDeactivate) {
      const confirmed = await confirm(current.confirmDeactivate);
      if (!confirmed) {
        configRef.current.onCancel?.();
        return;
      }
    }

    mutation.mutate(
      { id: current.id },
      {
        onSuccess: () => configRef.current.onWritten(nextIsActive),
        onError: () => configRef.current.onFailed?.(nextIsActive),
      },
    );
  }, [confirm]);

  const toggleSync = useCallback(() => {
    void toggle();
  }, [toggle]);

  return { toggle: toggleSync, isPending, confirmDialog };
}
