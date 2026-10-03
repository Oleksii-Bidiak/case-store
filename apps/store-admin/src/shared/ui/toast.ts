import { toast as sonnerToast, type ExternalToast } from "sonner";
import { dict } from "@/shared/config";

/**
 * The admin panel's toast entry point (TASK-422).
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * The owner's rule is: a success may fade by itself, an ERROR must wait to be
 * read. sonner cannot express that at the `<Toaster>`: its `ToastOptions` is a
 * flat, type-agnostic object (`node_modules/sonner/dist/index.d.ts:78`) applied
 * identically to every toast, and the runtime resolves ONE duration for all of
 * them (`index.mjs:1163`). Only a per-call value beats it
 * (`toast.duration || durationFromToaster || TOAST_LIFETIME`, `index.mjs:473`).
 *
 * So the per-type policy has to live at the call site — and putting it in
 * ninety-two call sites is the same as not having it, because the ninety-third
 * will forget. This module is that single call site: every admin toast goes
 * through it, `error` gets an infinite duration, everything else inherits the
 * 6 s default from `app/providers.tsx`.
 *
 * ── Not barrel-exported, on purpose ─────────────────────────────────────────
 * Import it directly (`@/shared/ui/toast`), like `use-url-params`,
 * `use-table-sort` and `use-debounced-callback`. Two import paths for one
 * symbol is how a wrapper quietly stops being the only way in; ESLint bans
 * `sonner` outside this file so there is exactly one.
 *
 * Only the methods the panel actually uses are re-exported (`undo` joined in
 * wave 198). Adding
 * `info`/`warning`/`promise` later is a two-line change — deliberately not done
 * ahead of a caller, so the policy question ("does a warning wait?") gets asked
 * when someone has a real case.
 */

/** sonner accepts a string or a React node as the message. */
type ToastMessage = Parameters<typeof sonnerToast.error>[0];

/** How long an undo toast stays — see `toast.undo`. */
export const UNDO_TOAST_DURATION_MS = 10_000;

export const toast = {
  /** Auto-dismisses after the Toaster's default (6 s). */
  success: (message: ToastMessage, data?: ExternalToast): string | number =>
    sonnerToast.success(message, data),

  /**
   * Stays until the operator dismisses it.
   *
   * `data` is spread AFTER the duration so a caller with a genuine reason can
   * still opt out — the default is sticky, not a ceiling.
   */
  error: (message: ToastMessage, data?: ExternalToast): string | number =>
    sonnerToast.error(message, {
      duration: Number.POSITIVE_INFINITY,
      ...data,
    }),

  /**
   * «Done — and you can take it back» (wave 198, owner decision): a success
   * toast carrying «Скасувати», after a bulk action or a move.
   *
   * 10 s rather than the 6 s default: the operator has to read what happened
   * AND reach the button. Still never the only way back — a toast cannot take
   * focus and it expires (see `reorder-undo-button.tsx`), so the screen keeps
   * its persistent «Скасувати останню …» control as the accessible fallback.
   */
  undo: (
    message: ToastMessage,
    {
      onUndo,
      label = dict.canon.undo,
      duration = UNDO_TOAST_DURATION_MS,
      ...data
    }: ExternalToast & {
      onUndo: () => void;
      label?: string;
      duration?: number;
    },
  ): string | number =>
    sonnerToast.success(message, {
      ...data,
      duration,
      action: { label, onClick: () => onUndo() },
    }),

  /** Dismiss one toast, or every toast when called with no id. */
  dismiss: (id?: number | string): unknown => sonnerToast.dismiss(id),
};
