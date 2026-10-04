import * as React from "react";
import { CheckIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

export type StepState = "now" | "done" | "skip" | "todo";

export interface StepperStep {
  id: string;
  title: string;
  /** Sub-label: what was entered, or what the step is about. */
  description?: string;
  state: StepState;
}

export interface StepperProps {
  steps: readonly StepperStep[];
  "aria-label": string;
  className?: string;
}

const COLUMNS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  // The order path (OrdersProposal К1): five steps in one row from lg.
  5: "lg:grid-cols-5",
};

/**
 * Numbered steps of a multi-step dialog (Staff С4–С7, wave 198): a column on a
 * phone, one row on desktop. The current step carries `aria-current="step"`;
 * «done» and «skipped» are said in text as well as drawn (✓, dashed and faded).
 */
export function Stepper({
  steps,
  "aria-label": ariaLabel,
  className,
}: StepperProps) {
  return (
    <ol
      aria-label={ariaLabel}
      className={cn(
        "grid grid-cols-1 gap-2",
        COLUMNS[steps.length] ?? "md:grid-cols-3",
        className,
      )}
    >
      {steps.map((step, index) => (
        <li
          key={step.id}
          data-state={step.state}
          aria-current={step.state === "now" ? "step" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm",
            step.state === "now" && "border-primary bg-primary/6",
            step.state === "skip" && "border-dashed opacity-60",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground",
              step.state === "now" && "bg-primary text-primary-foreground",
              step.state === "done" && "bg-success text-success-foreground",
            )}
          >
            {step.state === "done" ? (
              <CheckIcon className="size-3.5" />
            ) : (
              index + 1
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold text-foreground">
              <span className="sr-only">{index + 1}. </span>
              {step.title}
              {step.state === "done" || step.state === "skip" ? (
                <span className="sr-only">
                  {`, ${step.state === "done" ? dict.canon.stepDone : dict.canon.stepSkipped}`}
                </span>
              ) : null}
            </span>
            {step.description ? (
              <span className="truncate text-xs text-muted-foreground">
                {step.description}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
