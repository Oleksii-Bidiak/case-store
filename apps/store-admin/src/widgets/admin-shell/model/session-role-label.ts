import { dict } from "@/shared/config";

/**
 * The role line of the signed-in session — the header badge AND the account
 * menu read this one function, so the two can never disagree (wave 198).
 *
 * From the server's flags, never the token's role alone (TASK-475): an ADMIN
 * token is the owner OR a deputy, and only `/auth/me/permissions` says which.
 * Until that answer arrives an ADMIN is unnamed (null) rather than guessed.
 */
export function sessionRoleLabel(session: {
  isOwner: boolean;
  isAdmin: boolean;
  role: string | null;
}): string | null {
  if (session.isOwner) return dict.header.roleOwner;
  if (session.isAdmin) return dict.header.roleAdmin;
  if (session.role === "MANAGER") return dict.header.roleManager;
  return null;
}
