import {
  DEVICE_FILTER_ATTR,
  DEVICE_FILTER_EXPIRED_ATTR,
  HAS_DEVICE_ATTR,
  PRE_PAINT_FILTER_TIMEOUT_MS,
} from "./device-flags";
import {
  CATALOG_DEVICE_COOKIE,
  CATALOG_DEVICE_COOKIE_MAX_AGE,
  CATALOG_DEVICE_MAX_SLUGS,
} from "./catalog-device-cookie";
import { MY_DEVICES_STORAGE_KEY } from "./my-devices-storage";
import { MY_DEVICES_SETTINGS_STORAGE_KEY } from "./my-devices-settings";

const q = JSON.stringify;

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
 *     applies. Once the window's `load` fires a timer sets
 *     `data-device-filter-expired`, the CSS fallback for an app that never
 *     hydrates. Counted from `load`, not from here (TASK-2564): on a slow
 *     network the bundle alone takes longer than any fixed budget, and a gate
 *     that lifted on the clock showed the unfiltered grid before hydration;
 *     `load` also fires when a bundle fails, so a broken app still ends on the
 *     server grid, never an endless skeleton;
 *   - the `catalog-device` cookie (TASK-2564) — the default filter's `device=`
 *     by the rule of `defaultCatalogDevice`, over the entries the store would
 *     keep (valid ones, most recent first, one per model), or deleted when it
 *     does not apply. The stores keep it live afterwards; writing it here too
 *     covers a list saved before the cookie existed, from the first page.
 *
 * Any failure (no storage, bad device JSON) means "no device": the worst case
 * is the shift we had before, never an error. Nothing personal is in the
 * cached HTML — the attributes are the only trace. `<html>` carries
 * `suppressHydrationWarning`, so the extra attributes do not trip hydration.
 */
export const PRE_PAINT_FLAGS_SCRIPT = `(function(){try{var s=localStorage,h=document.documentElement,w=function(v){document.cookie=${q(
  `${CATALOG_DEVICE_COOKIE}=`,
)}+(v?encodeURIComponent(v)+"; max-age=${CATALOG_DEVICE_COOKIE_MAX_AGE}":"; max-age=0")+"; path=/; samesite=lax"},v=JSON.parse(s.getItem(${q(
  MY_DEVICES_STORAGE_KEY,
)})||"[]");if(!Array.isArray(v)||!v.some(function(d){return d&&typeof d.modelId==="string"&&d.modelId!==""})){w("");return}var l=[],m={};v.map(function(d,i){return[d,i]}).filter(function(p){var d=p[0];return d&&typeof d.modelId==="string"&&d.modelId!==""&&typeof d.slug==="string"&&d.slug!==""&&typeof d.name==="string"&&d.name!==""&&typeof d.lastUsedAt==="number"&&isFinite(d.lastUsedAt)}).sort(function(a,b){return b[0].lastUsedAt-a[0].lastUsedAt||a[1]-b[1]}).forEach(function(p){if(!m["$"+p[0].modelId]){m["$"+p[0].modelId]=1;l.push(p[0].slug)}});h.setAttribute(${q(
  HAS_DEVICE_ATTR,
)},"");var c=null;try{c=JSON.parse(s.getItem(${q(
  MY_DEVICES_SETTINGS_STORAGE_KEY,
)})||"null")}catch(e){}var on=!(c&&typeof c==="object"&&c.compatOnly===false);w(on&&l.length?(c&&typeof c==="object"&&c.compatScope==="all"&&l.length>1?l.slice(0,${CATALOG_DEVICE_MAX_SLUGS}).join(","):l[0]):"");if(on){h.setAttribute(${q(
  DEVICE_FILTER_ATTR,
)},"");addEventListener("load",function(){setTimeout(function(){h.setAttribute(${q(
  DEVICE_FILTER_EXPIRED_ATTR,
)},"")},${PRE_PAINT_FILTER_TIMEOUT_MS})})}}catch(e){}})();`;
