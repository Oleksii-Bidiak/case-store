import { toast as sonnerToast, type ExternalToast } from "sonner";

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
 * Only the three methods the panel actually uses are re-exported. Adding
 * `info`/`warning`/`promise` later is a two-line change — deliberately not done
 * ahead of a caller, so the policy question ("does a warning wait?") gets asked
 * when someone has a real case.
 */

/** sonner accepts a string or a React node as the message. */
type ToastMessage = Parameters<typeof sonnerToast.error>[0];

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

  /** Dismiss one toast, or every toast when called with no id. */
  dismiss: (id?: number | string): unknown => sonnerToast.dismiss(id),
};
