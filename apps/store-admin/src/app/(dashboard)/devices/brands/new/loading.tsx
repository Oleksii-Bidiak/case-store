import {
  DeviceBrandTableSkeleton,
  DeviceSectionHeaderSkeleton,
} from "@/widgets";

/** `/devices/brands/new` renders the grid with the dialog — so does its loading UI. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <DeviceSectionHeaderSkeleton active="brands" />
      <DeviceBrandTableSkeleton />
    </div>
  );
}
