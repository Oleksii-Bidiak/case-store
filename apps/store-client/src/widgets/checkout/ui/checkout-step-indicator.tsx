import { Check } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

const STEPS = [
  dict.checkout.stepShipping,
  dict.checkout.stepReview,
  dict.checkout.stepConfirm,
] as const;

/**
 * CheckoutStepIndicator — a static visual stepper for the checkout flow.
 * `current` is the active (1-based) step; earlier steps render as completed.
 */
export function CheckoutStepIndicator({ current = 1 }: { current?: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Checkout progress">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                isActive && "bg-primary text-primary-foreground",
                isDone && "bg-success text-success-foreground",
                !isActive && !isDone && "bg-muted text-muted-foreground",
              )}
            >
              {isDone ? <Check className="size-4" aria-hidden="true" /> : step}
            </span>
            <span
              className={cn(
                "text-sm font-medium",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {step < STEPS.length && (
              <span
                aria-hidden="true"
                className="hidden h-px flex-1 bg-border sm:block"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
