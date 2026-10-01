import type { ComponentProps, ReactNode } from "react";
import { Input, Label } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";

interface AuthFieldProps extends Omit<ComponentProps<"input">, "id"> {
  /** Input id; the error line gets `${id}-error`, the hint `${id}-hint`. */
  id: string;
  label: ReactNode;
  /** Field-level validation message (zod), rendered as an inline alert. */
  error?: string;
  /** Guidance shown before anything goes wrong; replaced by the error. */
  hint?: ReactNode;
}

/**
 * AuthField — one labelled field of the auth forms (TASK-871).
 *
 * Composes `shared/ui` `Label` + `Input` instead of the hand-rolled markup
 * each form used to repeat. `h-11` keeps the 44px touch target; the error is
 * linked through `aria-describedby` and announced as an alert.
 *
 * Spreading react-hook-form's `register()` works as-is: on React 19 `ref` is a
 * plain prop, and `Input` passes every prop through to the `<input>`.
 */
export function AuthField({
  id,
  label,
  error,
  hint,
  className,
  ...inputProps
}: AuthFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const showHint = Boolean(hint) && !error;
  const describedBy =
    [showHint ? hintId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-foreground">
        {label}
      </Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn("h-11 bg-background", className)}
        {...inputProps}
      />
      {showHint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Text-link look shared by the auth forms' secondary actions. Weight is left
 * to the call site: the mockup bolds only «Забули пароль?» and the support link.
 */
export const AUTH_LINK_CLASS =
  "rounded-sm text-primary transition-colors hover:text-primary/80 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** The single primary action of an auth card (DS §5: large CTA radius). */
export const AUTH_SUBMIT_CLASS =
  "h-11 w-full rounded-cta text-base font-semibold";
