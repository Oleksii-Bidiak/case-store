// «Мої пристрої» entity (TASK-2074): the browser-local list of the shopper's
// devices — any number, ordered by last use, the first one active. Client-only
// (localStorage `my-devices:v1`); account sync is TASK-1959.
export {
  EMPTY_DEVICES,
  MAX_DEVICE_LABEL_LENGTH,
  activateDevice,
  getActiveDevice,
  parseMyDevices,
  removeDeviceFrom,
  serializeMyDevices,
  setDeviceLabel,
  sortByLastUsed,
  upsertDevice,
  type MyDevice,
  type MyDeviceInput,
} from "./model/my-devices";

export {
  MY_DEVICES_STORAGE_KEY,
  addDevice,
  clearMyDevices,
  readMyDevices,
  removeDevice,
  setActiveDevice,
  setDeviceLabelById as setLabel,
} from "./model/my-devices-storage";

// Device → store input (family resolved once) and the single picker's
// open command, callable from any layer above entities (TASK-2070).
export {
  toMyDeviceInput,
  type DeviceModelLike,
} from "./model/to-my-device-input";

export {
  closeDevicePicker,
  getDevicePickerState,
  openDevicePicker,
  useDevicePickerState,
  type DevicePickerRequest,
  type DevicePickerState,
} from "./model/device-picker-request";

export {
  useActiveDevice,
  useMyDevices,
  useMyDevicesHydrated,
} from "./model/use-my-devices";

// The catalogue filter's defaults (TASK-2076/2077) — localStorage
// `my-devices-settings:v1`. Moved here from widgets/my-devices-manager
// (TASK-1959), which re-exports them.
export {
  DEFAULT_MY_DEVICES_SETTINGS,
  MY_DEVICES_SETTINGS_STORAGE_KEY,
  catalogFilterDefault,
  parseMyDevicesSettings,
  readMyDevicesSettings,
  updateMyDevicesSettings,
  type CompatScope,
  type MyDevicesSettings,
} from "./model/my-devices-settings";
// "use client" module.
export { useMyDevicesSettings } from "./model/use-my-devices-settings";
