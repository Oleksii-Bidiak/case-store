import { Check } from "lucide-react";
import { dict } from "@/shared/config";

const STEPS = [
  dict.checkout.stepShipping,
  dict.checkout.stepReview,
  dict.checkout.stepConfirm,
] as const;

/**
 * CheckoutStepIndicator — the checkout progress stepper (Checkout.dc.html
 * styling). `current` is the active (1-based) step; earlier steps render as
 * completed. Keeps `aria-current="step"` on the active circle.
 */
export function CheckoutStepIndicator({ current = 1 }: { current?: number }) {
  return (
    <ol
      className="mb-7 flex flex-wrap items-center gap-2"
      aria-label="Checkout progress"
    >
      {STEPS.map((label, index) => {
        const step = index + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2.5">
              <span
                aria-current={isActive ? "step" : undefined}
                className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] font-mono text-[13px] font-bold ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : isDone
                      ? "border-transparent bg-success/15 text-success"
                      : "border-border bg-card text-muted-foreground"
                }`}
              >
                {isDone ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  step
                )}
              </span>
              <span
                className={`text-sm font-semibold ${
                  isActive || isDone
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </span>
            {step < STEPS.length && (
              <span aria-hidden="true" className="h-px w-7 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
