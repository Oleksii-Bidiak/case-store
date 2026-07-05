// Newsletter entity — re-exports generated newsletter types and the subscribe
// hook (FSD entities layer). Upper layers (features/widgets) import newsletter
// data access from here, not from the generated client directly.
export type {
  SubscribeDto,
  SubscribeResponse,
} from "@/shared/api/generated/models";

export { useNewsletterControllerSubscribe } from "@/shared/api/generated/newsletter/newsletter";
