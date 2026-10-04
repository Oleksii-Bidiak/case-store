import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * A customer account's status by the badge canon (§1.6 of the wave-198 problem
 * list): the positive state filled, the switched-off one on a grey badge — never
 * `destructive`, which is kept for real errors. The same pair `/staff` uses.
 */
export function CustomerStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="default">{dict.common.active}</Badge>
  ) : (
    <Badge variant="secondary">{dict.common.inactive}</Badge>
  );
}
