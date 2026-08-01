// Analytics entity (TASK-380) — storefront traffic as the admin dashboard sees
// it.
//
// The numbers come from our own API, not from Umami directly: the analytics
// credential must stay server-side, and anything this bundle holds is public.

export { useGetTrafficSummary } from "@/shared/api";

export type { TrafficSummaryEntity } from "@/shared/api";
