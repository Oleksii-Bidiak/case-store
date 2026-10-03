import * as React from "react";

import { cn } from "@/shared/lib/utils";

export interface FormSectionCardProps extends Omit<
  React.ComponentProps<"section">,
  "title"
> {
  /** The section's heading — also its accessible name. */
  title: React.ReactNode;
  /** One muted line under the heading. */
  description?: React.ReactNode;
  /** Controls on the right of the heading row (a button, a «⋯» menu). */
  actions?: React.ReactNode;
}

/**
 * One titled card of a sectioned settings form (wave 198, Settings Н1–Н3): the
 * same chrome as `CollapsibleSection`, without the fold. Give it an `id` to be
 * a `FormSectionNav` anchor target.
 */
export function FormSectionCard({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: FormSectionCardProps) {
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card p-4 shadow-card",
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={headingId} className="text-sm font-semibold text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
