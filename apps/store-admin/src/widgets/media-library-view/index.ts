// Media library screen (TASK-441, plan 177) — `/media`.
//
// The parts this screen is built from (grid, card, upload zone, asset dialog)
// moved to `@/features/media-picker` in step e — the picker inside every content
// form needs the same ones, and a feature may not import a widget. The route's
// loading skeleton is re-exported from there so `app/media/loading.tsx` keeps
// importing the screen it belongs to rather than reaching into a feature.
export { MediaLibraryView } from "./ui/media-library-view";
export { MediaLibrarySkeleton } from "@/features/media-picker";
