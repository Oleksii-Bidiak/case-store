import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";

const calloutVariants = cva(
  "flex items-start gap-2.5 rounded-md border text-sm text-foreground",
  {
    variants: {
      variant: {
        /** A neutral note — «Шаблон — готовий набір галочок…». */
        muted: "bg-muted px-3 py-2.5",
        /** Something to double-check before acting. */
        warning: "border-warning/35 bg-warning/8 px-3 py-2.5",
        /** A decision the screen asks for — may hold actions (Staff С4). */
        primary: "border-primary/30 bg-primary/5 px-3.5 py-3",
        /** A one-line full-width strip above a list (Staff «Повний доступ мають…»). */
        strip: "items-center bg-muted px-3.5 py-2.5",
      },
    },
    defaultVariants: { variant: "muted" },
  },
);

const ICONS = {
  muted: InfoIcon,
  warning: TriangleAlertIcon,
  primary: InfoIcon,
  strip: InfoIcon,
} as const;

export interface CalloutProps
  extends
    Omit<React.ComponentProps<"div">, "title">,
    VariantProps<typeof calloutVariants> {
  /** Bold first line. */
  title?: React.ReactNode;
  /** Buttons / a checkbox under the text. */
  actions?: React.ReactNode;
  /** Replace the variant's icon; `false` for none. */
  icon?: React.ReactNode | false;
}

/**
 * Callout — page content that explains or asks (wave 198). NOT a live region:
 * it is there when the page renders, not an event, so it must not interrupt a
 * screen reader. For errors use `FormAlert` / `ErrorState`.
 */
export function Callout({
  variant = "muted",
  title,
  actions,
  icon,
  className,
  children,
  ...props
}: CalloutProps) {
  const tone = variant ?? "muted";
  const Icon = ICONS[tone];
  const glyph =
    icon === false
      ? null
      : (icon ?? (
          <Icon
            aria-hidden="true"
            className={cn(
              "mt-0.5 size-4 shrink-0",
              tone === "warning" && "text-warning",
              tone === "primary" && "text-primary",
              (tone === "muted" || tone === "strip") && "text-muted-foreground",
            )}
          />
        ));
  return (
    <div
      data-slot="callout"
      data-variant={tone}
      className={cn(calloutVariants({ variant: tone }), className)}
      {...props}
    >
      {glyph}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
        {actions ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { calloutVariants };
