import { cn } from "@/shared/lib/utils";

export type StatusDotTone = "success" | "warning" | "primary";

const TONES: Record<StatusDotTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  // «primary» = dirty / has unsaved changes.
  primary: "bg-primary",
};

export interface StatusDotProps {
  tone: StatusDotTone;
  /** What the colour means — read by screen readers, never shown. */
  label: string;
  className?: string;
}

/** An 8 px dot whose meaning is also in (sr-only) words (wave 198). */
export function StatusDot({ tone, label, className }: StatusDotProps) {
  return (
    <>
      <span
        aria-hidden="true"
        data-slot="status-dot"
        className={cn(
          "inline-block size-2 shrink-0 rounded-full",
          TONES[tone],
          className,
        )}
      />
      <span className="sr-only">{label}</span>
    </>
  );
}
