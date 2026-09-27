"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { cn } from "@/shared/lib/utils";
import { buttonVariants } from "@/shared/ui/button";
import { dict } from "@/shared/config/dictionary";

/**
 * AlertDialog — the modal that interrupts to ask «are you sure?» (TASK-812).
 *
 * Backed by Radix `AlertDialog`, styled to match `dialog.tsx` one-for-one. The
 * difference from `Dialog` is semantic and it matters: `role="alertdialog"`,
 * no close-on-outside-click, no ✕ button, and initial focus on CANCEL — the
 * safe answer is the one a stray Enter lands on.
 *
 * Why not `window.confirm`, which is what the bulk hooks used before this:
 * it blocks the whole tab, cannot be styled or translated beyond its body text
 * (the buttons say «OK» / «Cancel» in the browser's language), and a browser
 * may suppress it outright after the operator ticks «don't show again» — in
 * which case `confirm()` returns `false` silently and the action looks broken.
 */
function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          // Token-scale twin of `dialog.tsx`'s centring (no arbitrary values,
          // TASK-260): centred card from `sm`, a 1rem-gutter card below it.
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-sm:right-4 max-sm:left-4 max-sm:w-auto max-sm:max-w-none max-sm:translate-x-0",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: "default" | "destructive";
}) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

// ── Imperative confirm ────────────────────────────────────────────────────────

export interface ConfirmOptions {
  /** Heading. Defaults to the generic «Підтвердіть дію». */
  title?: string;
  /** What is about to happen — the blast radius, stated before it commits. */
  description: React.ReactNode;
  /** The action's own verb, e.g. «Деактивувати (3)». Never a bare «OK». */
  confirmLabel: string;
  /** Defaults to «Скасувати». */
  cancelLabel?: string;
  /** Red confirm button — for actions that hide or remove something. */
  destructive?: boolean;
}

export interface ConfirmDialogApi {
  /**
   * Opens the dialog and resolves `true` on confirm, `false` on cancel, Escape
   * or unmount. A second call while one is open resolves the first as `false`.
   */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Render this once, anywhere in the caller's tree. `null`-safe when closed. */
  confirmDialog: React.ReactNode;
}

interface PendingConfirm {
  resolve: (confirmed: boolean) => void;
}

/**
 * `window.confirm`, but as a real AlertDialog (TASK-812).
 *
 * A hook cannot render, so it hands back the element with the function: the
 * caller writes `{confirmDialog}` somewhere in its JSX and keeps the one-line
 * `if (!(await confirm(...))) return;` shape the old guard had. The element is
 * local to the caller on purpose — no app-level provider to forget in a test
 * render, and two tables on one page cannot steal each other's prompt.
 */
export function useConfirmDialog(): ConfirmDialogApi {
  // The options outlive `open` so the text does not blank out mid-way through
  // the close animation.
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const [open, setOpen] = React.useState(false);
  const pendingRef = React.useRef<PendingConfirm | null>(null);

  const settle = React.useCallback((confirmed: boolean) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setOpen(false);
    pending.resolve(confirmed);
  }, []);

  const confirm = React.useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        pendingRef.current?.resolve(false);
        pendingRef.current = { resolve };
        setOptions(next);
        setOpen(true);
      }),
    [],
  );

  // An unmount mid-question is a «no»: nothing may fire for a table that is gone.
  React.useEffect(
    () => () => {
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    },
    [],
  );

  const confirmDialog = options ? (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {options.title ?? dict.common.confirmTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>{options.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {options.cancelLabel ?? dict.common.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={options.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {options.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirm, confirmDialog };
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
