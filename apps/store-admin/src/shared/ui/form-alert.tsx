import * as React from "react";
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";

export interface FormAlertProps extends Omit<
  React.ComponentProps<"div">,
  "title"
> {
  /**
   * A bold first sentence that names the failure («Не вдалося видалити.»),
   * with the explanation after it in body text (CategoryDelete ДН-2.8,
   * TASK-655). With a title only the icon and the tint carry the red, so a
   * three-line explanation stays readable; without one the whole short message
   * is red, as on Login П2.
   */
  title?: React.ReactNode;
}

/**
 * FormAlert — the server refused the WHOLE form (Login П2: «Невірний email або
 * пароль.»; a 409 conflict). Field-level problems go under their field with
 * `FieldError` instead. Announced (`role="alert"`), and carries an icon so the
 * colour is not the only signal. Renders nothing without a message.
 */
export function FormAlert({
  className,
  title,
  children,
  ...props
}: FormAlertProps) {
  if (children === null || children === undefined || children === false) {
    return null;
  }
  const titled = title !== undefined && title !== null && title !== false;
  const Icon = titled ? TriangleAlertIcon : CircleAlertIcon;
  return (
    <div
      role="alert"
      data-slot="form-alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/45 bg-destructive/6 px-3 py-2.5 text-sm",
        titled ? "text-foreground" : "text-destructive",
        className,
      )}
      {...props}
    >
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <div className="min-w-0">
        {titled ? (
          <>
            <strong className="font-semibold">{title}</strong>{" "}
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
}
