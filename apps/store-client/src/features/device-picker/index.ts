// Device picker (TASK-2070): the one dialog / bottom sheet for choosing,
// switching and forgetting «Мої пристрої».
//
// Usage:
//   - mount `<DevicePicker />` ONCE (the site header does);
//   - open it from anywhere with `openDevicePicker({ query?, family? })` —
//     re-exported here for widgets and pages; features import it from
//     `@/entities/my-devices` (no feature → feature imports).
export { DevicePicker } from "./ui/device-picker";
export {
  closeDevicePicker,
  openDevicePicker,
  type DevicePickerRequest,
} from "@/entities/my-devices";
