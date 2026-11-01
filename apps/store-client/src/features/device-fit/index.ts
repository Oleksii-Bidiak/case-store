// Device fit (TASK-1953): «Підходить / Не для <модель>» — a product's
// compatible models against the shopper's active device («Мої пристрої»,
// client-only). The mark renders on product cards, catalog list rows and the
// wishlist; the PDP builds its big compatibility row from the same hook.
export { DeviceFitMark, type DeviceFitMarkProps } from "./ui/device-fit-mark";
export { useDeviceFit, type DeviceFitState } from "./model/use-device-fit";
// Mode B of the card mark — the catalogue listing sets `all` while its
// «для всіх моїх» filter is on (TASK-2077).
export {
  DeviceFitScopeProvider,
  useDeviceFitScope,
  type DeviceFitScope,
} from "./model/fit-scope";
export {
  commonDeviceFamily,
  deviceDisplayName,
  deviceHubHref,
  deviceShortDisplayName,
  deviceShortName,
  fittingDevices,
  getDeviceFit,
  hasCompatData,
  summarizeModelNames,
  type DeviceFitVerdict,
} from "./model/device-fit";
