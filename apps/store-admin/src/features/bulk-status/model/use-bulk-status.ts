"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  useAnnouncer,
  useConfirmDialog,
  type ConfirmOptions,
} from "@/shared/ui";

/**
 * The slice of a TanStack mutation this hook drives. Every Orval-generated
 * `use…Many` mutation satisfies it as-is.
 */
export interface BulkMutation<TVariables, TData> {
  mutate: (
    variables: TVariables,
    options: { onSuccess: (data: TData) => void; onError: () => void },
  ) => void;
  isPending: boolean;
}

export interface UseBulkStatusConfig<TValue, TVariables, TData> {
  mutation: BulkMutation<TVariables, TData>;
  /** Builds the request body from the selection and the chosen value. */
  toVariables: (ids: string[], value: TValue) => TVariables;
  /**
   * The blast-radius prompt for this value, or `null` when the direction is
   * safe (activating, approving, setting a colour). Cancel ⇒ ZERO requests.
   */
  confirmFor?: (ids: string[], value: TValue) => ConfirmOptions | null;
  announceSaving: (count: number, value: TValue) => string;
  /** Built from the RESPONSE — announce what the database wrote. */
  announceDone: (data: TData, ids: string[], value: TValue) => string;
  announceFailed: string;
  /** Cache work after the server confirms (invalidate / setQueryData). */
  onWritten: (data: TData, ids: string[], value: TValue) => void;
  /** Called after `onWritten` — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface BulkStatusApi<TValue> {
  run: (ids: string[], value: TValue) => void;
  isPending: boolean;
  /** Render once in the caller's JSX; the confirm prompt lives here. */
  confirmDialog: ReactNode;
}

/**
 * One bulk-write engine for every «select rows → apply one value» action in the
 * panel (TASK-812). It replaced three byte-for-byte copies (product, category,
 * message status) plus the review, colour and group variants, which had each
 * re-grown the same four rules — and one of them, the `window.confirm` guard,
 * was diverging from the AlertDialog every other destructive action uses.
 *
 * The rules, kept verbatim from TASK-293/355:
 *
 * - **Confirm the destructive direction only**, via `confirmFor`. Prompting on a
 *   safe action is how operators learn to dismiss prompts unread. Cancel ⇒ zero
 *   mutation calls.
 * - **No optimistic write.** Caches are touched only after the server confirms,
 *   so a failed batch leaves the table showing the true state.
 * - **Announce what the database wrote**, not what was asked for.
 * - **One batch at a time.** A second call while one is pending is dropped.
 */
export function useBulkStatus<TValue, TVariables, TData>(
  config: UseBulkStatusConfig<TValue, TVariables, TData>,
): BulkStatusApi<TValue> {
  const { announcePolite, announceAssertive } = useAnnouncer();
  const { confirm, confirmDialog } = useConfirmDialog();

  // The config is a fresh object every render; read the latest one at call
  // time so `run` can stay referentially stable.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });
  // `mutation.isPending` in a closure is stale across the `await` below.
  const inFlightRef = useRef(false);

  const run = useCallback(
    async (ids: string[], value: TValue) => {
      const current = configRef.current;
      if (current.mutation.isPending || inFlightRef.current) return;
      if (ids.length === 0) return;

      const prompt = current.confirmFor?.(ids, value) ?? null;
      if (prompt) {
        inFlightRef.current = true;
        const confirmed = await confirm(prompt);
        inFlightRef.current = false;
        if (!confirmed) return;
      }

      const latest = configRef.current;
      announcePolite(latest.announceSaving(ids.length, value));
      latest.mutation.mutate(latest.toVariables(ids, value), {
        onSuccess: (data) => {
          const settled = configRef.current;
          settled.onWritten(data, ids, value);
          announcePolite(settled.announceDone(data, ids, value));
          settled.onSuccess?.();
        },
        onError: () => {
          announceAssertive(configRef.current.announceFailed);
        },
      });
    },
    [announceAssertive, announcePolite, confirm],
  );

  const runSync = useCallback(
    (ids: string[], value: TValue) => {
      void run(ids, value);
    },
    [run],
  );

  return {
    run: runSync,
    isPending: config.mutation.isPending,
    confirmDialog,
  };
}
