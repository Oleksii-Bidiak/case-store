// «Мої пристрої» entity (TASK-2074): the browser-local list of the shopper's
// devices — any number, ordered by last use, the first one active. Read from
// localStorage `my-devices:v1`; for a signed-in shopper that is a mirror of the
// account, kept in sync by features/my-devices-sync (TASK-1959).
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
  replaceMyDevices,
  setActiveDevice,
  setDeviceLabelById as setLabel,
  syncFlags as syncMyDevicesFlags,
} from "./model/my-devices-storage";

// The <html> flags CSS lays the page out by before React knows the devices
// (TASK-2074/2421/2410): the root layout's pre-paint script sets them, the
// stores keep them live.
export {
  DEVICE_FILTER_ATTR,
  HAS_DEVICE_ATTR,
  syncDeviceFlags,
} from "./model/device-flags";
export { PRE_PAINT_FLAGS_SCRIPT } from "./model/pre-paint-flags";

// Account mirror (TASK-1959): the shopper's own edits vs the server state
// applied locally, and whose account the local copy belongs to.
export { subscribeMyDevicesEdits } from "./model/my-devices-edits";
export {
  MY_DEVICES_OWNER_STORAGE_KEY,
  hasLocalMyDevicesState,
  readMyDevicesOwner,
  writeMyDevicesOwner,
} from "./model/my-devices-owner";

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
  replaceMyDevicesSettings,
  updateMyDevicesSettings,
  type CompatScope,
  type MyDevicesSettings,
} from "./model/my-devices-settings";
// "use client" module.
export { useMyDevicesSettings } from "./model/use-my-devices-settings";
