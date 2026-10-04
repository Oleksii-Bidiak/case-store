import {
  DeviceBrandTableSkeleton,
  DeviceSectionHeaderSkeleton,
} from "@/widgets";

/**
 * Route-level loading UI for `/devices/brands` (DevicesProposal ПР12): the
 * section header with its tabs, then the grid's skeleton.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <DeviceSectionHeaderSkeleton active="brands" />
      <DeviceBrandTableSkeleton />
    </div>
  );
}
