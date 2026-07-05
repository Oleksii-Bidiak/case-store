// Contact entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated contact client from the shared layer so the
// rest of the app depends on `@/entities/contact` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminContactList,
  useAdminContactGet,
  useAdminContactUnreadCount,
  useAdminContactUpdate,
  getAdminContactListQueryKey,
  getAdminContactUnreadCountQueryKey,
  getAdminContactGetQueryKey,
  AdminContactListStatus,
  ContactMessageEntityStatus,
  UpdateContactMessageDtoStatus,
} from "@/shared/api";

export type {
  ContactMessageEntity,
  ContactInboxResponse,
  ContactInboxMeta,
  ContactMessageResponse,
  ContactUnreadResponse,
  UpdateContactMessageDto,
  AdminContactListParams,
} from "@/shared/api";
