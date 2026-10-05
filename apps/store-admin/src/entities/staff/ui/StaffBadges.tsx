import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";
import { levelBadgeVariant, levelLabel } from "../model/access-level";

/**
 * The level of a service account in words, on the canon badge (Д-ж2): owner
 * filled, deputy neutral outline, manager soft. One component for the
 * register, its 390 cards and the person's card, so the three never disagree.
 */
export function StaffLevelBadge({ level }: { level: number }) {
  return <Badge variant={levelBadgeVariant(level)}>{levelLabel(level)}</Badge>;
}

/**
 * «Активний» / «Вимкнено». A switched-off account is a reversible state the
 * owner chose (leave, a contractor between jobs), not an error — so it is the
 * grey `secondary` badge, not the red one it used to be.
 */
export function StaffStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="default">{dict.common.active}</Badge>
  ) : (
    <Badge variant="secondary">{dict.staff.statusOff}</Badge>
  );
}
