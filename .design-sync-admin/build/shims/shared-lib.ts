// design-sync shim for `@/shared/lib`. The admin UI consumes only `cn` from
// this barrel (live-announcer). The real barrel also re-exports
// api-error-message and friends, which pull API/axios types the UI never needs.
export { cn } from "@/shared/lib/utils";
