// Homepage first block (TASK-1952): «Для якого пристрою шукаєте?» — model
// search, popular model tiles by family, «Усі моделі» → the shared device
// picker — or, once a device is saved, the active device's panel. Choosing a
// model makes it active and opens its hub `/devices/<slug>`.
//
// Mount it once, as the first section of the homepage (K6 composes the
// page), inside the page container. Pass `renderPicks` to fill the device
// panel's product rail with cards.
export { DeviceHero } from "./ui/device-hero";
export type { DeviceHeroPicks } from "./ui/hero-device-panel";
