import {
  DeviceModelTableSkeleton,
  DeviceSectionHeaderSkeleton,
} from "@/widgets";

/**
 * Route-level loading UI for `/devices/models` (DevicesProposal ПР12): the
 * section header with its tabs, then the registry's skeleton.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <DeviceSectionHeaderSkeleton active="models" />
      <DeviceModelTableSkeleton />
    </div>
  );
}
