// User entity — re-exports generated current-user profile types and API hooks
// (FSD entities layer). Upper layers import profile data access from here.
export type {
  UserEntity,
  UpdateProfileDto,
  UserResponseEnvelope,
} from "@/shared/api/generated/models";

export {
  useUserControllerGetProfile,
  useUserControllerUpdateProfile,
  getUserControllerGetProfileQueryKey,
} from "@/shared/api/generated/users/users";

// Email-verification state derived from the profile (TASK-342).
export {
  readEmailVerificationState,
  type EmailVerificationState,
} from "./model/email-verification";
