// Device-model list item → what the «Мої пристрої» store saves (TASK-2070).
// Shared by the picker, the homepage tiles and search, so the family is
// resolved the same way wherever a device is added.

import { getDeviceFamily } from "@/entities/device/model/device-family";

import type { MyDeviceInput } from "./my-devices";

/** The fields read from a `GET /device-models` row (structural). */
export interface DeviceModelLike {
  id: string;
  slug: string;
  name: string;
  brandName?: string | null;
  brandSlug?: string | null;
  series?: string | null;
}

export function toMyDeviceInput(model: DeviceModelLike): MyDeviceInput {
  return {
    modelId: model.id,
    slug: model.slug,
    name: model.name,
    brandName: model.brandName ?? "",
    family: getDeviceFamily(model),
  };
}
