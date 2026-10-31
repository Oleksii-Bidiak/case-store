// Device fit (TASK-1953): «Підходить / Не для <модель>» — a product's
// compatible models against the shopper's active device («Мої пристрої»,
// client-only). The mark renders on product cards, catalog list rows and the
// wishlist; the PDP builds its big compatibility row from the same hook.
export { DeviceFitMark, type DeviceFitMarkProps } from "./ui/device-fit-mark";
export { useDeviceFit, type DeviceFitState } from "./model/use-device-fit";
export {
  commonDeviceFamily,
  deviceDisplayName,
  getDeviceFit,
  hasCompatData,
  summarizeModelNames,
  type DeviceFitVerdict,
} from "./model/device-fit";
