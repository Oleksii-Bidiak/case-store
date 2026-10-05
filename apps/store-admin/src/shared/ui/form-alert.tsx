import * as React from "react";
import { CircleAlertIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";

/**
 * FormAlert — the server refused the WHOLE form (Login П2: «Невірний email або
 * пароль.»; a 409 conflict). Field-level problems go under their field with
 * `FieldError` instead. Announced (`role="alert"`), and carries an icon so the
 * colour is not the only signal. Renders nothing without a message.
 */
export function FormAlert({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  if (children === null || children === undefined || children === false) {
    return null;
  }
  return (
    <div
      role="alert"
      data-slot="form-alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/45 bg-destructive/6 px-3 py-2.5 text-sm text-destructive",
        className,
      )}
      {...props}
    >
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
