import { DEVICE_FILTER_ATTR, HAS_DEVICE_ATTR } from "./device-flags";
import { MY_DEVICES_STORAGE_KEY } from "./my-devices-storage";
import { MY_DEVICES_SETTINGS_STORAGE_KEY } from "./my-devices-settings";

/**
 * Inline, parser-blocking script for the root layout's <head> (TASK-2421; it
 * used to live in the device bar's placeholder, TASK-2074). It runs before
 * <body> is parsed, so nothing is painted without the flags, and only reads
 * localStorage:
 *
 *   - `data-has-device`    — the saved list is a non-empty array;
 *   - `data-device-filter` — that, and the settings do not turn
 *     «лише сумісне» off (`compatOnly !== false`). Missing or corrupt settings
 *     mean the defaults, i.e. on — the same fallback `parseMyDevicesSettings`
 *     applies.
 *
 * Any failure (no storage, bad device JSON) means "no device": the worst case
 * is the shift we had before, never an error. Nothing personal is in the
 * cached HTML — the attributes are the only trace. `<html>` carries
 * `suppressHydrationWarning`, so the extra attributes do not trip hydration.
 */
export const PRE_PAINT_FLAGS_SCRIPT = `(function(){try{var s=localStorage,v=JSON.parse(s.getItem(${JSON.stringify(
  MY_DEVICES_STORAGE_KEY,
)})||"[]");if(!Array.isArray(v)||v.length===0)return;var h=document.documentElement;h.setAttribute(${JSON.stringify(
  HAS_DEVICE_ATTR,
)},"");var c=null;try{c=JSON.parse(s.getItem(${JSON.stringify(
  MY_DEVICES_SETTINGS_STORAGE_KEY,
)})||"null")}catch(e){}if(!(c&&typeof c==="object"&&c.compatOnly===false))h.setAttribute(${JSON.stringify(
  DEVICE_FILTER_ATTR,
)},"")}catch(e){}})();`;
