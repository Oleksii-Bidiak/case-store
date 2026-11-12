// Moved to entities/my-devices (TASK-1959): the account sync lives below the
// widgets layer and must read and write the settings too. Re-exported so the
// widget's own imports keep working. Server-safe, like the original.
export {
  DEFAULT_MY_DEVICES_SETTINGS,
  MY_DEVICES_SETTINGS_STORAGE_KEY,
  catalogFilterDefault,
  getMyDevicesSettingsSnapshot,
  parseMyDevicesSettings,
  readMyDevicesSettings,
  resetMyDevicesSettings,
  subscribeMyDevicesSettings,
  updateMyDevicesSettings,
  type CompatScope,
  type MyDevicesSettings,
} from "@/entities/my-devices/model/my-devices-settings";
