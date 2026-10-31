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

export {
  useActiveDevice,
  useMyDevices,
  useMyDevicesHydrated,
} from "./model/use-my-devices";
