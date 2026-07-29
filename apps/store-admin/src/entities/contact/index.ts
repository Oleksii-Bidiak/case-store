// Contact entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated contact client from the shared layer so the
// rest of the app depends on `@/entities/contact` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminContactList,
  useAdminContactGet,
  useAdminContactUnreadCount,
  useAdminContactUpdate,
  // Batch status write behind the inbox's bulk bar (TASK-354).
  useAdminContactUpdateStatusMany,
  getAdminContactListQueryKey,
  getAdminContactUnreadCountQueryKey,
  getAdminContactGetQueryKey,
  AdminContactListStatus,
  ContactMessageEntityStatus,
  UpdateContactMessageDtoStatus,
  BulkContactMessageStatusDtoStatus,
} from "@/shared/api";

export type {
  ContactMessageEntity,
  ContactInboxResponse,
  ContactInboxMeta,
  ContactMessageResponse,
  ContactUnreadResponse,
  UpdateContactMessageDto,
  AdminContactListParams,
  BulkContactMessageStatusDto,
  BulkContactMessageStatusResponse,
} from "@/shared/api";
