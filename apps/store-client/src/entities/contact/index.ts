// Contact entity — re-exports generated types and API hooks (FSD entities
// layer). Upper layers (widgets/features) import contact data access from here,
// not from the generated client directly.
export type {
  CreateContactMessageDto,
  ContactMessageCreatedResponse,
} from "@/shared/api/generated/models";

export { useContactControllerSubmit } from "@/shared/api/generated/contact/contact";
