import { TriangleAlert } from "lucide-react";
import { dict, PAGE_CONTAINER } from "@/shared/config";

/**
 * The landing note for a preview link the API refused — invalid, expired,
 * revoked, or pointing at something that is gone (TASK-669, mockup
 * HomepageBlocks #invalid). It sits above the public page, so the visitor sees
 * what shoppers see now instead of a dead end. `role="status"` announces it
 * once without stealing focus.
 */
export function PreviewInvalidNote() {
  return (
    <div className={`${PAGE_CONTAINER} pt-4`}>
      <p
        role="status"
        className="flex items-start gap-2.5 rounded-xl border border-warning/45 bg-warning/10 px-4 py-3 text-sm text-foreground"
      >
        <TriangleAlert
          aria-hidden="true"
          className="mt-px size-4.5 shrink-0 text-warning"
        />
        <span>{dict.preview.invalid}</span>
      </p>
    </div>
  );
}
