"use client";

import type { PickupPointPublicDto } from "@/shared/api";
import { RadioCard, RadioCardGroup } from "@/shared/ui";

/**
 * One active pickup point per card: the name is the radio's name, the address
 * and hours its description (TASK-1973 / TASK-1806). Used by the operator's
 * phone order and by the delivery edit of an existing order — the points come
 * from the public `GET /api/delivery/methods`, which an `orders:write` operator
 * can read without `settings:delivery`.
 *
 * Dumb on purpose: the caller owns the value, the label and the error text.
 */
export function PickupPointPicker({
  id,
  points,
  value,
  onChange,
  labelledBy,
  errorId,
  invalid = false,
}: {
  id: string;
  points: readonly PickupPointPublicDto[];
  value: string;
  onChange: (pointId: string) => void;
  labelledBy: string;
  errorId?: string;
  invalid?: boolean;
}) {
  return (
    <RadioCardGroup
      id={id}
      value={value}
      onValueChange={onChange}
      aria-labelledby={labelledBy}
      aria-describedby={invalid ? errorId : undefined}
      aria-invalid={invalid ? true : undefined}
      tabIndex={-1}
    >
      {points.map((point) => (
        <RadioCard
          key={point.id}
          value={point.id}
          title={point.name}
          description={[`${point.city}, ${point.address}`, point.workingHours]
            .filter(Boolean)
            .join(" · ")}
        />
      ))}
    </RadioCardGroup>
  );
}
