import {
  DEVICE_FILTER_ATTR,
  DEVICE_FILTER_EXPIRED_ATTR,
  HAS_DEVICE_ATTR,
  PRE_PAINT_FILTER_TIMEOUT_MS,
} from "./device-flags";
import { MY_DEVICES_STORAGE_KEY } from "./my-devices-storage";
import { MY_DEVICES_SETTINGS_STORAGE_KEY } from "./my-devices-settings";

/**
 * Inline, parser-blocking script for the root layout's <head> (TASK-2421; it
 * used to live in the device bar's placeholder, TASK-2074). It runs before
 * <body> is parsed, so nothing is painted without the flags, and only reads
 * localStorage:
 *
 *   - `data-has-device`    — the saved list has an entry with a `modelId`
 *     (a corrupt `[{}]` is no device; the full validation runs on the first
 *     client mount, which resyncs the flags);
 *   - `data-device-filter` — that, and the settings do not turn
 *     «лише сумісне» off (`compatOnly !== false`). Missing or corrupt settings
 *     mean the defaults, i.e. on — the same fallback `parseMyDevicesSettings`
 *     applies. A timer then sets `data-device-filter-expired`, the CSS
 *     fallback for an app that never hydrates.
 *
 * Any failure (no storage, bad device JSON) means "no device": the worst case
 * is the shift we had before, never an error. Nothing personal is in the
 * cached HTML — the attributes are the only trace. `<html>` carries
 * `suppressHydrationWarning`, so the extra attributes do not trip hydration.
 */
export const PRE_PAINT_FLAGS_SCRIPT = `(function(){try{var s=localStorage,v=JSON.parse(s.getItem(${JSON.stringify(
  MY_DEVICES_STORAGE_KEY,
)})||"[]");if(!Array.isArray(v)||!v.some(function(d){return d&&typeof d.modelId==="string"&&d.modelId!==""}))return;var h=document.documentElement;h.setAttribute(${JSON.stringify(
  HAS_DEVICE_ATTR,
)},"");var c=null;try{c=JSON.parse(s.getItem(${JSON.stringify(
  MY_DEVICES_SETTINGS_STORAGE_KEY,
)})||"null")}catch(e){}if(!(c&&typeof c==="object"&&c.compatOnly===false)){h.setAttribute(${JSON.stringify(
  DEVICE_FILTER_ATTR,
)},"");setTimeout(function(){h.setAttribute(${JSON.stringify(
  DEVICE_FILTER_EXPIRED_ATTR,
)},"")},${PRE_PAINT_FILTER_TIMEOUT_MS})}}catch(e){}})();`;
