import { dict } from "@/shared/config";
import {
  ProductSpecEntityType,
  type ProductSpecEntity,
} from "@/entities/product";

/**
 * Format a structured spec value for display (TASK-191): BOOLEAN renders as
 * "Так"/"Ні"; other types show the canonical value with the optional unit
 * suffix appended.
 */
export function formatSpecValue(spec: ProductSpecEntity): string {
  if (spec.type === ProductSpecEntityType.BOOLEAN) {
    return spec.value === "true"
      ? dict.product.specBooleanYes
      : dict.product.specBooleanNo;
  }
  return spec.unit ? `${spec.value} ${spec.unit}` : spec.value;
}
